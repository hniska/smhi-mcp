// MCP Server implementation

import { MCP_CONFIG } from '../config/constants.js';

/**
 * Create MCP server with all tool handlers
 */
export function createMCPServer(toolHandlers, env) {
    return {
        name: MCP_CONFIG.SERVER_NAME,
        version: MCP_CONFIG.SERVER_VERSION,
        env: env,
        
        get_tools() {
            return [
                { name: "list_snowmobile_conditions", description: "Lists weather stations relevant for snowmobile conditions, organized by region and showing both temperature and snow depth monitoring capabilities across northern Sweden and mountain regions.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                { name: "list_temperature_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined temperature monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                { name: "list_snow_depth_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined snow depth monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                { name: "get_station_temperature", description: "Fetches the latest temperature reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                { name: "get_station_snow_depth", description: "Fetches the latest snow depth reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                { name: "get_weather_forecast", description: "Retrieves weather forecast for the given coordinates using SMHI data with optional time filtering and limit control.", inputSchema: { type: "object", properties: { "lat": { type: "number" }, "lon": { type: "number" }, "fromDate": { type: "string", description: "Start date/time for filtering (ISO 8601 format, e.g., '2025-06-30' or '2025-06-30T12:00:00Z')" }, "toDate": { type: "string", description: "End date/time for filtering (ISO 8601 format, e.g., '2025-07-05' or '2025-07-05T23:59:59Z')" }, "limit": { type: "number", description: "Maximum number of forecast periods to return (default: 8 periods = ~8 hours, max: 100)", default: 8 } }, required: ["lat", "lon"] } },
                { name: "get_station_precipitation", description: "Fetches precipitation data with multiple resolutions (daily, hourly, 15-min, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "period": { type: "string", description: "Data period: latest-day, latest-hour, latest-months, corrected-archive", default: "latest-day" } }, required: ["station_id"] } },
                { name: "get_temperature_multi_resolution", description: "Fetches temperature data with multiple resolutions (hourly, daily mean/min/max, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Temperature parameter: 1=hourly, 2=daily-mean, 19=daily-min, 20=daily-max, 22=monthly", default: "1" }, "period": { type: "string", description: "Data period: latest-hour, latest-day, latest-months, corrected-archive", default: "latest-hour" } }, required: ["station_id"] } },
                { name: "get_station_metadata", description: "Retrieves detailed metadata and available periods for a station and parameter.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code (e.g., 1, 2, 5, 7, 8, etc.)" } }, required: ["station_id", "parameter"] } },
                { name: "get_historical_data", description: "Fetches historical data for any parameter and period with pagination and date filtering support.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code" }, "period": { type: "string", description: "Data period: corrected-archive, latest-months, latest-day, latest-hour" }, "limit": { type: "number", description: "Number of values per page", default: 10 }, "cursor": { type: "string", description: "Pagination cursor for next/previous page" }, "reverse": { type: "boolean", description: "Show newest data first (true) or oldest first (false)", default: true }, "fromDate": { type: "string", description: "Start date for filtering (ISO 8601 format, e.g., '2024-01-01' or '2024-01-01T12:00:00Z')" }, "toDate": { type: "string", description: "End date for filtering (ISO 8601 format, e.g., '2024-12-31' or '2024-12-31T23:59:59Z')" } }, required: ["station_id", "parameter", "period"] } },
                { name: "list_all_temperature_stations", description: "Retrieves all SMHI stations that provide temperature data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
                { name: "list_all_snow_depth_stations", description: "Retrieves all SMHI stations that provide snow depth data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
                { name: "list_all_precipitation_stations", description: "Retrieves all SMHI stations that provide precipitation data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "cursor": { type: "string" } } } },
                { name: "search_stations_by_name", description: "Search for weather stations by name using fuzzy matching within a specific parameter type.", inputSchema: { type: "object", properties: { "query": { type: "string", description: "Station name to search for" }, "parameter": { type: "string", description: "Parameter type to filter stations: 1=temperature, 5=daily-precip, 7=hourly-precip, 8=snow-depth", default: "1" }, "limit": { type: "number", description: "Maximum number of results to return", default: 10 }, "threshold": { type: "number", description: "Minimum similarity score (0.0-1.0) for fuzzy matching", default: 0.3 } }, required: ["query"] } },
                { name: "search_stations_by_name_multi_param", description: "Search for weather stations by name across all parameter types (temperature, precipitation, snow). Useful when you don't know which parameter type a station supports.", inputSchema: { type: "object", properties: { "query": { type: "string", description: "Station name to search for" }, "limit": { type: "number", description: "Maximum number of results to return", default: 10 }, "threshold": { type: "number", description: "Minimum similarity score (0.0-1.0) for fuzzy matching", default: 0.3 } }, required: ["query"] } }
            ];
        },
        
        async handle_request(request) {
            const { method, params, id } = request;
            let result;
            
            try {
                switch (method) {
                    case "initialize":
                        result = { 
                            protocolVersion: MCP_CONFIG.PROTOCOL_VERSION, 
                            capabilities: { tools: { listChanged: true } }, 
                            serverInfo: { name: this.name, version: this.version } 
                        };
                        break;
                        
                    case "tools/list":
                        result = { tools: this.get_tools() };
                        break;
                        
                    case "resources/list":
                        result = { resources: [] };
                        break;
                        
                    case "prompts/list":
                        result = { prompts: [] };
                        break;
                        
                    case "notifications/initialized":
                        // This is a notification, not a request - no response needed
                        console.log('Received notifications/initialized - client is ready');
                        return null;
                        
                    case "tools/call":
                        const { name, arguments: args } = params;
                        
                        if (!toolHandlers[name]) {
                            throw new Error(`Unknown tool: ${name}`);
                        }
                        
                        const toolResult = await toolHandlers[name](args, this.env);
                        result = { content: [toolResult] };
                        break;
                        
                    default:
                        throw new Error(`Method not found: ${method}`);
                }
                
                return { jsonrpc: "2.0", id, result };
                
            } catch (e) {
                return { jsonrpc: "2.0", id, error: { code: -32603, message: `Internal error: ${e.message}` } };
            }
        }
    };
}