// SMHI MCP Server - Modular Implementation
import { MCP_CONFIG } from './src/config/constants.js';
import { TOOL_SCHEMAS } from './src/config/tool-schemas.js';
import { toolHandlers } from './src/tools/index.js';
import { checkRequestLimits } from './src/middleware/limits.js';
import { handleSSE } from './src/handlers/sse.js';
import { handleWebSocket } from './src/handlers/websocket.js';

// Create MCP server with modular tool handlers
function createMCPServer(env) {
    return {
        env: env,
        
        async handle_request(request) {
            const { method, params, id } = request;
            let result;
            
            try {
                switch (method) {
                    case "initialize":
                        result = {
                            protocolVersion: "2025-06-18",
                            capabilities: {
                                tools: { listChanged: true },
                                logging: {}
                            },
                            serverInfo: {
                                name: "smhi-mcp",
                                version: "2.0.0"
                            },
                            instructions: "SMHI MCP Server provides Swedish weather data. Use check_weather for current conditions and forecasts. Use get_snowmobile_conditions for winter activity planning. Use find_stations to discover stations by name or coordinates. All responses include structured JSON with summary, data, next_actions, and warnings."
                        };
                        break;
                        
                    case "tools/list":
                        result = { tools: TOOL_SCHEMAS };
                        break;
                        
                    case "resources/list":
                        result = { resources: [] };
                        break;
                        
                    case "tools/call":
                        const { name, arguments: args } = params;

                        // Route to appropriate tool handler - all tools now accept args object
                        if (toolHandlers[name]) {
                            let toolResult = await toolHandlers[name](args || {});
                            result = { content: [toolResult] };
                        } else {
                            throw new Error(`Unknown tool: ${name}`);
                        }
                        break;
                    
                    case "notifications/initialized":
                        // MCP notification that client is ready - notifications have no response
                        return null;
                        
                    default:
                        throw new Error(`Unknown method: ${method}`);
                }
                
                return { jsonrpc: "2.0", id, result };
                
            } catch (error) {
                return { 
                    jsonrpc: "2.0", 
                    id, 
                    error: { code: -32000, message: error.message } 
                };
            }
        }
    };
}

export default {
    async fetch(request, env, ctx) {
        const requestId = crypto.randomUUID().substring(0, 8);
        console.log(`[${requestId}] === INCOMING REQUEST ===`);
        console.log(`[${requestId}] Method: ${request.method}`);
        console.log(`[${requestId}] URL: ${request.url}`);
        
        // Log headers
        console.log(`[${requestId}] Headers:`);
        for (const [key, value] of request.headers.entries()) {
            console.log(`[${requestId}]   ${key}: ${value}`);
        }
        
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response('', {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version',
                    'Access-Control-Max-Age': '86400',
                }
            });
        }
        
        // Transport detection
        const acceptHeader = request.headers.get('accept') || '';
        const contentType = request.headers.get('content-type') || '';
        const isWebSocketUpgrade = request.headers.get('upgrade') === 'websocket';
        
        // Create MCP server instance for SSE/WebSocket handlers
        const server = createMCPServer(env);

        // 1) Pure SSE - GET requests with SSE accept header
        if (request.method === 'GET' && acceptHeader.includes('text/event-stream')) {
            console.log(`[${requestId}] Pure SSE connection detected`);
            return handleSSE(request, server, requestId);
        }

        // 2) Standard HTTP/JSON-RPC - POST requests with JSON content (MCP spec compliant)
        if (request.method === 'POST' && contentType.includes('application/json')) {
            console.log(`[${requestId}] Standard HTTP JSON-RPC request detected`);
            // Continue to existing HTTP handling logic below
        }

        // 3) WebSocket upgrade
        if (request.method === 'GET' && isWebSocketUpgrade) {
            console.log(`[${requestId}] WebSocket upgrade request detected`);
            return handleWebSocket(request, server, requestId);
        }
        
        // 4) Generic GET request
        if (request.method === 'GET') {
            return new Response(`SMHI MCP Server v2.0.0\n\nThis is an MCP (Model Context Protocol) server providing Swedish weather data.\n\nSupported protocols:\n- HTTP POST with JSON-RPC 2.0\n- WebSocket with JSON-RPC 2.0\n\nEndpoint: https://smhi-mcp.hakan-3a6.workers.dev\n\nTools available: 6 outcome-oriented tools\n- check_weather: Current weather + 24h forecast\n- get_snowmobile_conditions: Snow + temp for snowmobiling\n- find_stations: Search stations by name or coordinates\n- get_weather_history: Historical data with pagination\n- get_station_info: Station metadata + current readings\n- list_regions: Snowmobile monitoring regions\n\nFor Claude Code: Use HTTP POST with mcp-protocol-version header\nFor Claude Web UI: WebSocket connection supported\n\nLast updated: ${new Date().toISOString()}\nRequest ID: ${requestId}\n`, {
                headers: { 'Content-Type': 'text/plain' }
            });
        }
        
        if (request.method !== 'POST') {
            console.log(`[${requestId}] Rejecting non-POST/GET request (method: ${request.method})`);
            return new Response('Expected POST or GET', { status: 405 });
        }
        
        try {
            // Check request limits
            await checkRequestLimits();

            const bodyText = await request.text();
            console.log(`[${requestId}] Request body: ${bodyText}`);

            const body = JSON.parse(bodyText);
            console.log(`[${requestId}] Parsed JSON body:`, JSON.stringify(body, null, 2));

            // Use existing server instance from earlier in the request
            const response = await server.handle_request(body);
            
            console.log(`[${requestId}] Response:`, JSON.stringify(response, null, 2));
            
            // If response is null (notification), return 202 Accepted
            if (response === null) {
                return new Response(null, { status: 202 });
            }
            
            return new Response(JSON.stringify(response), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version',
                    'mcp-protocol-version': MCP_CONFIG.PROTOCOL_VERSION
                }
            });
            
        } catch (error) {
            console.log(`[${requestId}] Error:`, error.message);
            const errorResponse = {
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: `Parse error: ${error.message}` }
            };
            return new Response(JSON.stringify(errorResponse), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'mcp-protocol-version': MCP_CONFIG.PROTOCOL_VERSION
                }
            });
        }
    }
};