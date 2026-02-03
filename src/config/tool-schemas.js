// Tool schemas for SMHI MCP server
// Defines the input schemas for all available tools

export const TOOL_SCHEMAS = [
    {
        name: "check_weather",
        description: `Get current weather and 24h forecast for any location in Sweden.

USE THIS WHEN: User asks about current weather, temperature, or forecast for a location.
RETURNS: Current temperature from nearest station + hourly forecast for 24 hours.
WON'T WORK FOR: Historical data (use get_weather_history instead).

Examples:
- "What's the weather in Stockholm?"
- "How cold is it in Kiruna?"
- "Weather forecast for Hemavan"`,
        inputSchema: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "Place name in Sweden (e.g., 'Stockholm', 'Kiruna', 'Hemavan')"
                },
                lat: {
                    type: "number",
                    description: "Latitude in decimal degrees (alternative to location name)"
                },
                lon: {
                    type: "number",
                    description: "Longitude in decimal degrees (required if lat is provided)"
                }
            }
        }
    },
    {
        name: "get_snowmobile_conditions",
        description: `Get combined temperature and snow depth readings for snowmobile conditions.

USE THIS WHEN: User asks about snowmobile conditions, snow depth, or winter conditions in northern Sweden.
RETURNS: Temperature and snow depth from multiple monitoring stations, organized by region.
REGIONS: arctic_mountain, mountain, northern_sweden, coastal, all

Examples:
- "What are snowmobile conditions like?"
- "How much snow in the mountains?"
- "Is there enough snow for snowmobiling?"`,
        inputSchema: {
            type: "object",
            properties: {
                region: {
                    type: "string",
                    enum: ["arctic_mountain", "mountain", "northern_sweden", "coastal", "all"],
                    description: "Region to check. Use 'all' for overview of all regions.",
                    default: "all"
                }
            }
        }
    },
    {
        name: "find_stations",
        description: `Search for weather stations by name or coordinates.

USE THIS WHEN: User wants to find a specific weather station or stations near a location.
RETURNS: List of matching stations with their IDs, coordinates, and available data types.
SEARCH MODES: By name (query) or by coordinates (lat/lon).

Examples:
- "Find stations near Stockholm"
- "What stations measure snow depth?"
- "Find weather stations in Kiruna"`,
        inputSchema: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Station name to search for (e.g., 'Stockholm', 'Hemavan')"
                },
                lat: {
                    type: "number",
                    description: "Latitude for coordinate search (decimal degrees)"
                },
                lon: {
                    type: "number",
                    description: "Longitude for coordinate search (decimal degrees)"
                },
                data_type: {
                    type: "string",
                    enum: ["temperature", "precipitation", "snow_depth"],
                    description: "Type of weather data to filter by",
                    default: "temperature"
                },
                radius_km: {
                    type: "number",
                    description: "Search radius in kilometers (for coordinate search)",
                    default: 50
                },
                limit: {
                    type: "number",
                    description: "Maximum number of results to return",
                    default: 10
                },
                active_only: {
                    type: "boolean",
                    description: "Only return active stations",
                    default: true
                }
            }
        }
    },
    {
        name: "get_weather_history",
        description: `Retrieve historical weather data for a specific station.

USE THIS WHEN: User asks about past weather, temperature trends, or historical data.
RETURNS: Historical readings with timestamps, pagination support, and statistics.
TIME RANGES: current (last hour), today (last 24h), this_month, historical (archive)
DATA TYPES: temperature, precipitation, snow_depth

Examples:
- "Temperature history for station 159770"
- "Snow depth trends this month"
- "Historical precipitation data"`,
        inputSchema: {
            type: "object",
            properties: {
                station_id: {
                    type: "string",
                    description: "SMHI station ID (e.g., '159770')"
                },
                data_type: {
                    type: "string",
                    enum: ["temperature", "precipitation", "snow_depth"],
                    description: "Type of weather data to retrieve"
                },
                time_range: {
                    type: "string",
                    enum: ["current", "today", "this_month", "historical"],
                    description: "Time period to retrieve data from"
                },
                from_date: {
                    type: "string",
                    description: "Start date filter (ISO 8601 format, e.g., '2024-01-01')"
                },
                to_date: {
                    type: "string",
                    description: "End date filter (ISO 8601 format)"
                },
                limit: {
                    type: "number",
                    description: "Number of readings to return per page",
                    default: 20
                },
                cursor: {
                    type: "string",
                    description: "Pagination cursor from previous response"
                }
            },
            required: ["station_id", "data_type", "time_range"]
        }
    },
    {
        name: "get_station_info",
        description: `Get detailed information about a specific weather station.

USE THIS WHEN: User wants to know what data a station provides, or its exact location.
RETURNS: Station metadata, available data types, current readings if available.

Examples:
- "Tell me about station 159770"
- "What data does the Hemavan station provide?"
- "Station details for Kiruna"`,
        inputSchema: {
            type: "object",
            properties: {
                station_id: {
                    type: "string",
                    description: "SMHI station ID to get information for"
                }
            },
            required: ["station_id"]
        }
    },
    {
        name: "list_regions",
        description: `List available snowmobile monitoring regions in Sweden.

USE THIS WHEN: User wants to know what regions are available for snowmobile conditions.
RETURNS: List of regions with station counts and capabilities.

Examples:
- "What regions can I check?"
- "Which areas have snow monitoring?"
- "List snowmobile regions"`,
        inputSchema: {
            type: "object",
            properties: {}
        }
    }
];
