// SMHI MCP Server - Modular Implementation
import { MCP_CONFIG } from './src/config/constants.js';
import { TOOL_SCHEMAS } from './src/config/tool-schemas.js';
import { toolHandlers, toolArguments, ENV, CTX } from './src/tools/index.js';
import { checkRequestLimits, tooManyRequestsResponse } from './src/middleware/limits.js';
import { isBlocked, forbiddenResponse } from './src/middleware/blocklist.js';
import { handleSSE } from './src/handlers/sse.js';
import { handleWebSocket } from './src/handlers/websocket.js';

// JSON-RPC 2.0 error codes.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version, mcp-session-id',
    'mcp-protocol-version': MCP_CONFIG.PROTOCOL_VERSION
};

const JSON_HEADERS = { 'Content-Type': 'application/json', ...CORS_HEADERS };

/** A JSON-RPC error carrying the code the client should see. */
class RpcError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

// Create MCP server with modular tool handlers
function createMCPServer(env, ctx) {
    return {
        env,
        ctx,

        async handle_request(request) {
            const { method, params, id } = request ?? {};
            let result;

            try {
                if (typeof method !== 'string') {
                    throw new RpcError(INVALID_REQUEST, 'Request is missing a "method" string');
                }

                switch (method) {
                    case "initialize":
                        result = {
                            protocolVersion: MCP_CONFIG.PROTOCOL_VERSION,
                            capabilities: {
                                tools: { listChanged: true },
                                logging: {}
                            },
                            serverInfo: {
                                name: MCP_CONFIG.SERVER_NAME,
                                version: MCP_CONFIG.SERVER_VERSION
                            },
                            instructions: "SMHI MCP Server provides Swedish weather data including temperature, precipitation, snow depth, and weather forecasts from SMHI's open APIs. Use station search tools to find specific monitoring locations across Sweden. Tools support historical data, real-time conditions, and forecasting."
                        };
                        break;

                    case "tools/list":
                        result = { tools: TOOL_SCHEMAS };
                        break;

                    case "resources/list":
                        result = { resources: [] };
                        break;

                    case "prompts/list":
                        result = { prompts: [] };
                        break;

                    case "ping":
                        result = {};
                        break;

                    case "tools/call":
                        result = await this.callTool(params);
                        break;

                    case "notifications/initialized":
                        // MCP notification that client is ready - notifications have no response
                        return null;

                    default:
                        throw new RpcError(METHOD_NOT_FOUND, `Unknown method: ${method}`);
                }

                return { jsonrpc: "2.0", id, result };

            } catch (error) {
                return {
                    jsonrpc: "2.0",
                    id,
                    error: {
                        code: error instanceof RpcError ? error.code : INTERNAL_ERROR,
                        message: error.message
                    }
                };
            }
        },

        /**
         * Run one tool and wrap its output as an MCP tool result.
         *
         * Arguments are mapped from the named object MCP sends to the handler's
         * positional signature through `toolArguments`, so the signatures live
         * in one place next to the registry rather than in a switch here.
         */
        async callTool(params) {
            if (!params || typeof params !== 'object') {
                throw new RpcError(INVALID_PARAMS, 'tools/call requires params with a tool name');
            }

            const { name, arguments: args } = params;
            const handler = toolHandlers[name];
            const signature = toolArguments[name];

            if (!handler || !signature) {
                throw new RpcError(INVALID_PARAMS, `Unknown tool: ${name}`);
            }
            if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) {
                throw new RpcError(INVALID_PARAMS, `Arguments for ${name} must be an object`);
            }

            const named = args ?? {};
            const positional = signature.map((key) => {
                if (key === ENV) return this.env;
                if (key === CTX) return this.ctx;
                return named[key];
            });

            const { isError, ...content } = await handler(...positional);

            return isError
                ? { content: [content], isError: true }
                : { content: [content] };
        }
    };
}

export default {
    async fetch(request, env, ctx) {
        const requestId = crypto.randomUUID().substring(0, 8);

        // Blocklist first: refuse before doing any other work, including the
        // logging below, so a blocked flood stays cheap and quiet.
        if (isBlocked(request, env)) {
            console.log(`[${requestId}] Blocked ${request.headers.get('cf-connecting-ip')} (${request.method} ${request.url})`);
            return forbiddenResponse();
        }

        // One line per request. This used to log every header, the whole request
        // body, and the whole response re-serialised with two-space indent --
        // paid for in CPU on every call and again in log ingestion, on a Worker
        // whose request budget was the thing under pressure. Set DEBUG_LOGS=1 in
        // wrangler.toml to get the detail back while diagnosing something.
        const debug = env?.DEBUG_LOGS === '1' || env?.DEBUG_LOGS === 'true';
        console.log(`[${requestId}] ${request.method} ${new URL(request.url).pathname}`);
        if (debug) {
            for (const [key, value] of request.headers.entries()) {
                console.log(`[${requestId}]   ${key}: ${value}`);
            }
        }

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response('', {
                headers: {
                    ...CORS_HEADERS,
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Max-Age': '86400',
                }
            });
        }

        // Account for every request, whatever its method. Preflight is handled
        // above and deliberately not charged.
        const limits = await checkRequestLimits();
        if (limits.exceeded) {
            console.log(`[${requestId}] Daily budget spent (${limits.count} at this edge) - returning 429`);
            return tooManyRequestsResponse(limits);
        }

        // Transport detection
        const acceptHeader = request.headers.get('accept') || '';
        const contentType = request.headers.get('content-type') || '';
        const isWebSocketUpgrade = request.headers.get('upgrade') === 'websocket';

        // Create MCP server instance for SSE/WebSocket handlers
        const server = createMCPServer(env, ctx);

        if (request.method === 'GET') {
            // 1) WebSocket upgrade
            if (isWebSocketUpgrade) {
                return handleWebSocket(request, server, requestId);
            }

            // 2) A client asking for the server-initiated SSE stream. There is
            //    none, so this answers 405; see handlers/sse.js for why that
            //    matters more than it looks.
            if (acceptHeader.includes('text/event-stream')) {
                return handleSSE(request, server, requestId);
            }

            // 3) Human-readable landing page
            return new Response(
                `SMHI MCP Server v${MCP_CONFIG.SERVER_VERSION}\n\n` +
                `This is an MCP (Model Context Protocol) server providing Swedish weather data.\n\n` +
                `Supported protocols:\n` +
                `- HTTP POST with JSON-RPC 2.0\n` +
                `- WebSocket with JSON-RPC 2.0\n\n` +
                `Tools available: ${TOOL_SCHEMAS.length}\n\n` +
                `For Claude Code: Use HTTP POST with mcp-protocol-version header\n` +
                `For Claude Web UI: WebSocket connection supported\n\n` +
                `Request ID: ${requestId}\n`,
                { headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } }
            );
        }

        if (request.method !== 'POST') {
            console.log(`[${requestId}] Rejecting ${request.method}`);
            return new Response('Expected POST or GET', {
                status: 405,
                headers: { 'Allow': 'GET, POST, OPTIONS', 'Content-Type': 'text/plain' }
            });
        }

        let body;
        try {
            body = await request.json();
        } catch (error) {
            console.log(`[${requestId}] Parse error: ${error.message}`);
            return new Response(JSON.stringify({
                jsonrpc: "2.0",
                id: null,
                error: { code: PARSE_ERROR, message: `Parse error: ${error.message}` }
            }), { status: 400, headers: JSON_HEADERS });
        }

        if (debug) console.log(`[${requestId}] Body: ${JSON.stringify(body)}`);

        const response = await server.handle_request(body);

        // If response is null (notification), return 202 Accepted
        if (response === null) {
            return new Response(null, { status: 202 });
        }

        if (response.error) {
            console.log(`[${requestId}] ${body?.method}: ${response.error.code} ${response.error.message}`);
        }

        return new Response(JSON.stringify(response), { headers: JSON_HEADERS });
    }
};
