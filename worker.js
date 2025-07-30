// SMHI MCP Server - Modular Implementation
import { MCP_CONFIG } from './src/config/constants.js';
import { toolHandlers } from './src/tools/index.js';
import { checkRequestLimits } from './src/middleware/limits.js';
import { handleSSE } from './src/handlers/sse.js';
import { handleWebSocket } from './src/handlers/websocket.js';
import { snowmobileConditionsStations } from './src/data/stations.js';

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
                            capabilities: { tools: { listChanged: true } }, 
                            serverInfo: { name: "smhi-mcp", version: "1.0.0" } 
                        };
                        break;
                        
                    case "tools/list":
                        // Generate tool schemas dynamically from handler registry
                        const tools = [
                            { name: "list_snowmobile_conditions", description: "Lists weather stations for snowmobile conditions by region with temperature and snow depth data.", inputSchema: { type: "object", properties: {} } },
                            { name: "list_temperature_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead.", inputSchema: { type: "object", properties: {} } },
                            { name: "list_snow_depth_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead.", inputSchema: { type: "object", properties: {} } },
                            { name: "get_station_temperature", description: "Fetches the latest temperature reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                            { name: "get_station_snow_depth", description: "Fetches the latest snow depth reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                            { name: "get_weather_forecast", description: "Retrieves weather forecast for coordinates with optional filtering.", inputSchema: { type: "object", properties: { "lat": { type: "number" }, "lon": { type: "number" }, "fromDate": { type: "string", description: "Start date/time (ISO 8601)" }, "toDate": { type: "string", description: "End date/time (ISO 8601)" }, "limit": { type: "number", description: "Number of forecast periods (default: 8, max: 100)", default: 8 } }, required: ["lat", "lon"] } },
                            { name: "get_station_precipitation", description: "Fetches precipitation data with multiple resolutions.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "period": { type: "string", description: "latest-day, latest-hour, latest-months, corrected-archive", default: "latest-day" } }, required: ["station_id"] } },
                            { name: "get_temperature_multi_resolution", description: "Fetches temperature data with multiple resolutions.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "1=hourly, 2=daily-mean, 19=daily-min, 20=daily-max, 22=monthly", default: "1" }, "period": { type: "string", description: "latest-hour, latest-day, latest-months, corrected-archive", default: "latest-hour" } }, required: ["station_id"] } },
                            { name: "get_station_metadata", description: "Retrieves station metadata and available periods.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "1=temp, 5=precip, 8=snow" } }, required: ["station_id", "parameter"] } },
                            { name: "get_historical_data", description: "Fetches historical data with pagination and filtering.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "1=temp, 5=precip, 8=snow" }, "period": { type: "string", description: "corrected-archive, latest-months, latest-day, latest-hour" }, "limit": { type: "number", default: 10 }, "cursor": { type: "string" }, "reverse": { type: "boolean", default: true }, "fromDate": { type: "string", description: "ISO 8601 date" }, "toDate": { type: "string", description: "ISO 8601 date" } }, required: ["station_id", "parameter", "period"] } },
                            { name: "list_all_temperature_stations", description: "Lists all temperature stations with pagination.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
                            { name: "list_all_snow_depth_stations", description: "Lists all snow depth stations with pagination.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
                            { name: "list_all_precipitation_stations", description: "Lists all precipitation stations with pagination.", inputSchema: { type: "object", properties: { "parameter": { type: "string", description: "5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "cursor": { type: "string" } } } },
                            { name: "search_stations_by_name", description: "Search stations by name within a parameter type.", inputSchema: { type: "object", properties: { "query": { type: "string" }, "parameter": { type: "string", description: "1=temp, 5=precip, 8=snow", default: "1" }, "limit": { type: "number", default: 10 }, "threshold": { type: "number", default: 0.3 }, "active_only": { type: "boolean", default: true } }, required: ["query"] } },
                            { name: "search_stations_by_name_multi_param", description: "Search stations by name across all parameter types.", inputSchema: { type: "object", properties: { "query": { type: "string" }, "limit": { type: "number", default: 10 }, "threshold": { type: "number", default: 0.3 }, "active_only": { type: "boolean", default: true } }, required: ["query"] } }
                        ];
                        result = { tools };
                        break;
                        
                    case "resources/list":
                        result = { resources: [] };
                        break;
                        
                    case "tools/call":
                        const { name, arguments: args } = params;
                        
                        // Route to appropriate tool handler with correct parameters
                        if (toolHandlers[name]) {
                            let toolResult;
                            
                            switch (name) {
                                case "get_station_temperature":
                                    toolResult = await toolHandlers[name](args.station_id);
                                    break;
                                case "get_station_snow_depth":
                                    toolResult = await toolHandlers[name](args.station_id);
                                    break;
                                case "get_weather_forecast":
                                    toolResult = await toolHandlers[name](args.lat, args.lon, args.fromDate, args.toDate, args.limit);
                                    break;
                                case "get_station_precipitation":
                                    toolResult = await toolHandlers[name](args.station_id, this.env, args.parameter, args.period);
                                    break;
                                case "get_temperature_multi_resolution":
                                    toolResult = await toolHandlers[name](args.station_id, this.env, args.parameter, args.period);
                                    break;
                                case "get_station_metadata":
                                    toolResult = await toolHandlers[name](args.station_id, args.parameter);
                                    break;
                                case "get_historical_data":
                                    toolResult = await toolHandlers[name](args.station_id, args.parameter, args.period, args.limit, args.cursor, args.reverse, args.fromDate, args.toDate, this.env);
                                    break;
                                case "list_all_temperature_stations":
                                    toolResult = await toolHandlers[name](this.env, args.cursor);
                                    break;
                                case "list_all_snow_depth_stations":
                                    toolResult = await toolHandlers[name](this.env, args.cursor);
                                    break;
                                case "list_all_precipitation_stations":
                                    toolResult = await toolHandlers[name](this.env, args.parameter, args.cursor);
                                    break;
                                case "search_stations_by_name":
                                    toolResult = await toolHandlers[name](args.query, this.env, args.parameter, args.limit, args.threshold, args.active_only);
                                    break;
                                case "search_stations_by_name_multi_param":
                                    toolResult = await toolHandlers[name](args.query, this.env, args.limit, args.threshold, args.active_only);
                                    break;
                                case "list_snowmobile_conditions":
                                case "list_temperature_stations":
                                case "list_snow_depth_stations":
                                    toolResult = await toolHandlers[name]();
                                    break;
                                default:
                                    throw new Error(`Unknown tool: ${name}`);
                            }
                            
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
        
        // 1) Pure SSE - GET requests with SSE accept header
        if (request.method === 'GET' && acceptHeader.includes('text/event-stream')) {
            console.log(`[${requestId}] Pure SSE connection detected`);
            return handleSSE(request, env, requestId);
        }
        
        // 2) Standard HTTP/JSON-RPC - POST requests with JSON content (MCP spec compliant)
        if (request.method === 'POST' && contentType.includes('application/json')) {
            console.log(`[${requestId}] Standard HTTP JSON-RPC request detected`);
            // Continue to existing HTTP handling logic below
        }
        
        // 3) WebSocket upgrade
        if (request.method === 'GET' && isWebSocketUpgrade) {
            console.log(`[${requestId}] WebSocket upgrade request detected`);
            return handleWebSocket(request, env, requestId);
        }
        
        // 4) Generic GET request
        if (request.method === 'GET') {
            return new Response(`SMHI MCP Server v1.0.0\n\nThis is an MCP (Model Context Protocol) server providing Swedish weather data.\n\nSupported protocols:\n- HTTP POST with JSON-RPC 2.0\n- WebSocket with JSON-RPC 2.0\n\nEndpoint: https://smhi-mcp.hakan-3a6.workers.dev\n\nTools available: 15 weather data tools\n\nFor Claude Code: Use HTTP POST with mcp-protocol-version header\nFor Claude Web UI: WebSocket connection supported\n\nLast updated: ${new Date().toISOString()}\nRequest ID: ${requestId}\n`, {
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
            
            // Create MCP server instance
            const server = createMCPServer(env);
            const response = await server.handle_request(body);
            
            console.log(`[${requestId}] Response:`, JSON.stringify(response, null, 2));
            
            // If response is null (notification), return 204 No Content
            if (response === null) {
                return new Response('', { status: 204 });
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