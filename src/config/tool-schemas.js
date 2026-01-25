// Tool schemas for SMHI MCP server
// Defines the input schemas for all available tools

export const TOOL_SCHEMAS = [
    {
        name: "list_snowmobile_conditions",
        description: "Lists weather stations relevant for snowmobile conditions, organized by region and showing both temperature and snow depth monitoring capabilities across northern Sweden and mountain regions.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
        name: "list_temperature_stations",
        description: "[DEPRECATED] Use list_snowmobile_conditions instead.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
        name: "list_snow_depth_stations",
        description: "[DEPRECATED] Use list_snowmobile_conditions instead.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
        name: "get_station_temperature",
        description: "Fetches the latest temperature reading for a specific SMHI weather station.",
        inputSchema: {
            type: "object",
            properties: {
                "station_id": { type: "string" }
            },
            required: ["station_id"]
        }
    },
    {
        name: "get_station_snow_depth",
        description: "Fetches the latest snow depth reading for a specific SMHI weather station.",
        inputSchema: {
            type: "object",
            properties: {
                "station_id": { type: "string" }
            },
            required: ["station_id"]
        }
    },
    {
        name: "get_weather_forecast",
        description: "Retrieves weather forecast for coordinates with optional filtering.",
        inputSchema: {
            type: "object",
            properties: {
                "lat": { type: "number" },
                "lon": { type: "number" },
                "fromDate": { type: "string", description: "Start date/time (ISO 8601)" },
                "toDate": { type: "string", description: "End date/time (ISO 8601)" },
                "limit": { type: "number", description: "Number of forecast periods (default: 8, max: 100)", default: 8 }
            },
            required: ["lat", "lon"]
        }
    },
    {
        name: "get_station_precipitation",
        description: "Fetches precipitation data with multiple resolutions.",
        inputSchema: {
            type: "object",
            properties: {
                "station_id": { type: "string" },
                "parameter": { type: "string", description: "5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" },
                "period": { type: "string", description: "latest-day, latest-hour, latest-months, corrected-archive", default: "latest-day" }
            },
            required: ["station_id"]
        }
    },
    {
        name: "get_temperature_multi_resolution",
        description: "Fetches temperature data with multiple resolutions.",
        inputSchema: {
            type: "object",
            properties: {
                "station_id": { type: "string" },
                "parameter": { type: "string", description: "1=hourly, 2=daily-mean, 19=daily-min, 20=daily-max, 22=monthly", default: "1" },
                "period": { type: "string", description: "latest-hour, latest-day, latest-months, corrected-archive", default: "latest-hour" }
            },
            required: ["station_id"]
        }
    },
    {
        name: "get_station_metadata",
        description: "Retrieves station metadata and available periods.",
        inputSchema: {
            type: "object",
            properties: {
                "station_id": { type: "string" },
                "parameter": { type: "string", description: "1=temp, 5=precip, 8=snow" }
            },
            required: ["station_id", "parameter"]
        }
    },
    {
        name: "get_historical_data",
        description: "Fetches historical data with pagination and filtering.",
        inputSchema: {
            type: "object",
            properties: {
                "station_id": { type: "string" },
                "parameter": { type: "string", description: "1=temp, 5=precip, 8=snow" },
                "period": { type: "string", description: "corrected-archive, latest-months, latest-day, latest-hour" },
                "limit": { type: "number", default: 10 },
                "cursor": { type: "string" },
                "reverse": { type: "boolean", default: true },
                "fromDate": { type: "string", description: "ISO 8601 date" },
                "toDate": { type: "string", description: "ISO 8601 date" }
            },
            required: ["station_id", "parameter", "period"]
        }
    },
    {
        name: "list_all_temperature_stations",
        description: "Lists all temperature stations with pagination.",
        inputSchema: {
            type: "object",
            properties: {
                "cursor": { type: "string" }
            }
        }
    },
    {
        name: "list_all_snow_depth_stations",
        description: "Lists all snow depth stations with pagination.",
        inputSchema: {
            type: "object",
            properties: {
                "cursor": { type: "string" }
            }
        }
    },
    {
        name: "list_all_precipitation_stations",
        description: "Lists all precipitation stations with pagination.",
        inputSchema: {
            type: "object",
            properties: {
                "parameter": { type: "string", description: "5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" },
                "cursor": { type: "string" }
            }
        }
    },
    {
        name: "search_stations_by_name",
        description: "Search stations by name within a parameter type.",
        inputSchema: {
            type: "object",
            properties: {
                "query": { type: "string" },
                "parameter": { type: "string", description: "1=temp, 5=precip, 8=snow", default: "1" },
                "limit": { type: "number", default: 10 },
                "threshold": { type: "number", default: 0.3 },
                "active_only": { type: "boolean", default: true }
            },
            required: ["query"]
        }
    },
    {
        name: "search_stations_by_name_multi_param",
        description: "Search stations by name across all parameter types.",
        inputSchema: {
            type: "object",
            properties: {
                "query": { type: "string" },
                "limit": { type: "number", default: 10 },
                "threshold": { type: "number", default: 0.3 },
                "active_only": { type: "boolean", default: true }
            },
            required: ["query"]
        }
    },
    {
        name: "get_stations_near_location",
        description: "Find nearest weather stations to given coordinates using geographic distance calculation.",
        inputSchema: {
            type: "object",
            properties: {
                "latitude": { type: "number", description: "Latitude in WGS84 decimal degrees (e.g., 65.353 for Adak)" },
                "longitude": { type: "number", description: "Longitude in WGS84 decimal degrees (e.g., 18.5837 for Adak)" },
                "parameter": { type: "string", description: "1=temperature, 5=daily-precip, 8=snow-depth", default: "1" },
                "radius_km": { type: "number", description: "Maximum search radius in kilometers", default: 50 },
                "limit": { type: "number", description: "Maximum number of stations to return", default: 10 },
                "active_only": { type: "boolean", description: "Only return active stations", default: true }
            },
            required: ["latitude", "longitude"]
        }
    }
];
