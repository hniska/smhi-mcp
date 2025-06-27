const temperatureStations = {
    "155960": "Tärnaby/Hemavan at altitude 800m ",
    "155970": "Tärnaby/Hemavan at altitude 450m",
    "155790": "Gielas A",
    "166910": "Mierkenis",
    "159770": "Glommersträsk",
    "132170": "Storlien-Storvallen",
    "188850": "Katterjåkk/Riksgränsen",
    "159880": "Arvidsjaur",
    "166810": "Gautosjö",
    "151280": "Lövånger/Bjuröklubb"
};

const snowDepthStations = {
    "145500": "Borgafjäll",
    "158970": "Arvidsjaur",
    "159770": "Glommersträsk",
    "132180": "Storlien-Storvallen",
    "188850": "Katterjåkk/Riksgränsen",
    "155770": "Kittelfjäll",
    "155940": "Tärnaby/Hemavan",
    "158820": "Adak",
    "166810": "Gautosjö",
    "144530": "Jorm",
    "151220": "Lövånger"
};

const METOBS_BASE_URL = "https://opendata-download-metobs.smhi.se/api/version/1.0";
const METFCST_BASE_URL = "https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2";

const SMHIParameter = {
    SNOW_DEPTH: "8",
    MAX_TEMP: "27",
    AVG_TEMP: "2",
    AIR_TEMP: "1"
};

async function makeSmhiRequest(url) {
    const headers = {
        'accept': 'application/json',
        'referer': 'https://opendata.smhi.se/',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)'
    };
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`SMHI API request failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
}

async function list_temperature_stations() {
    return {
        type: "text",
        text: `Available temperature stations:\n${JSON.stringify(temperatureStations, null, 2)}`
    };
}

async function list_snow_depth_stations() {
    return {
        type: "text",
        text: `Available snow depth stations:\n${JSON.stringify(snowDepthStations, null, 2)}`
    };
}

async function get_station_temperature(station_id) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${SMHIParameter.AIR_TEMP}/station/${station_id}/period/latest-hour/data.json`;
        const data = await makeSmhiRequest(url);
        if (!data.value || data.value.length === 0) {
            return {
                type: "text",
                text: `Error: No temperature data available for station ${station_id}`
            };
        }
        const latestValue = data.value[0];
        return {
            type: "text",
            text: `Temperature for station ${station_id}:\n` +
                   `Temperature: ${latestValue.value}°C\n` +
                   `Timestamp: ${latestValue.date}\n`
        };
    } catch (e) {
        return {
            type: "text",
            text: `Error: Failed to fetch temperature data from SMHI: ${e.message}`
        };
    }
}

async function get_station_snow_depth(station_id) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${SMHIParameter.SNOW_DEPTH}/station/${station_id}/period/latest-day/data.json`;
        const data = await makeSmhiRequest(url);
        if (!data.value || data.value.length === 0) {
            return {
                type: "text",
                text: `Error: No snow depth data available for station ${station_id}`
            };
        }
        const latestValue = data.value[data.value.length - 1];
        return {
            type: "text",
            text: `Snow depth for station ${station_id}:\n` +
                   `Snow depth: ${latestValue.value} meters\n` +
                   `Timestamp: ${latestValue.date}\n` +
                   `Station name: ${data.station.name || 'Unknown'}`
        };
    } catch (e) {
        return {
            type: "text",
            text: `Error: Failed to fetch snow depth data from SMHI: ${e.message}`
        };
    }
}

async function get_weather_forecast(lat, lon) {
    try {
        const url = `${METFCST_BASE_URL}/geotype/point/lon/${lon}/lat/${lat}/data.json`;
        const data = await makeSmhiRequest(url);
        
        const summary = data.timeSeries.slice(0, 5).map(entry => {
            const params = Object.fromEntries(entry.parameters.map(p => [p.name, p.values[0]]));
            return `Time: ${entry.validTime}, Temp: ${params.t}°C, Precip: ${params.pmean} mm/h`;
        }).join('\n');

        return {
            type: "text",
            text: `Weather forecast for coordinates (${lat}, ${lon}):\n\n${summary}`
        };
    } catch (e) {
        return {
            type: "text",
            text: `Error: Failed to fetch forecast from SMHI: ${e.message}`
        };
    }
}

async function list_all_stations_for_parameter(parameter, cursor) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}.json`;
        const data = await makeSmhiRequest(url);
        const stations = data.station || [];

        const offset = cursor ? parseInt(atob(cursor), 10) : 0;
        const pageSize = 100;
        const pageItems = stations.slice(offset, offset + pageSize);

        const nextCursor = (offset + pageSize < stations.length) ? btoa(offset + pageSize) : null;

        const stationsInfo = Object.fromEntries(pageItems.map(s => [s.key, {
            name: s.name,
            latitude: s.latitude,
            longitude: s.longitude,
            height: s.height,
            active: s.active,
            owner: s.owner
        }]));

        const summary = `Total stations: ${stations.length}, Active: ${stations.filter(s => s.active).length}\n` +
                      `Showing ${pageItems.length} stations (offset: ${offset})`;

        let resultText = `All SMHI stations for parameter ${parameter} (paginated):\n${summary}\n\n${JSON.stringify(stationsInfo, null, 2)}`;
        if (nextCursor) {
            resultText += `\n\nTo get next page, use cursor: ${nextCursor}`;
        }

        return {
            type: "text",
            text: resultText,
            nextCursor: nextCursor
        };
    } catch (e) {
        return {
            type: "text",
            text: `Error: Could not fetch all stations for parameter ${parameter}: ${e.message}`
        };
    }
}

const server = {
    name: "smhi-mcp",
    version: "1.0.0",

    get_tools() {
        return [
            { name: "list_temperature_stations", description: "Retrieves a list of all available temperature monitoring stations from SMHI." },
            { name: "list_snow_depth_stations", description: "Retrieves a list of all available snow depth monitoring stations from SMHI." },
            { name: "get_station_temperature", description: "Fetches the latest temperature reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
            { name: "get_station_snow_depth", description: "Fetches the latest snow depth reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
            { name: "get_weather_forecast", description: "Retrieves a daily summarized weather forecast for the given coordinates using SMHI data.", inputSchema: { type: "object", properties: { "lat": { type: "number" }, "lon": { type: "number" } }, required: ["lat", "lon"] } },
            { name: "list_all_temperature_stations", description: "Retrieves all SMHI stations that provide temperature data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
            { name: "list_all_snow_depth_stations", description: "Retrieves all SMHI stations that provide snow depth data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } }
        ];
    },

    async handle_request(request) {
        const { method, params, id } = request;

        let result;
        try {
            switch (method) {
                case "initialize":
                    result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: this.name, version: this.version } };
                    break;
                case "tools/list":
                    result = { tools: this.get_tools() };
                    break;
                case "tools/call":
                    const { name, arguments: args } = params;
                    switch (name) {
                        case "list_temperature_stations":
                            result = { content: [await list_temperature_stations()] };
                            break;
                        case "list_snow_depth_stations":
                            result = { content: [await list_snow_depth_stations()] };
                            break;
                        case "get_station_temperature":
                            result = { content: [await get_station_temperature(args.station_id)] };
                            break;
                        case "get_station_snow_depth":
                            result = { content: [await get_station_snow_depth(args.station_id)] };
                            break;
                        case "get_weather_forecast":
                            result = { content: [await get_weather_forecast(args.lat, args.lon)] };
                            break;
                        case "list_all_temperature_stations":
                            result = { content: [await list_all_stations_for_parameter(SMHIParameter.AIR_TEMP, args.cursor)] };
                            break;
                        case "list_all_snow_depth_stations":
                            result = { content: [await list_all_stations_for_parameter(SMHIParameter.SNOW_DEPTH, args.cursor)] };
                            break;
                        default:
                            throw new Error(`Unknown tool: ${name}`);
                    }
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

export default {
    async fetch(request, env, ctx) {
        if (request.method !== 'POST') {
            return new Response('Expected POST', { status: 405 });
        }
        try {
            const body = await request.json();
            const response = await server.handle_request(body);
            return new Response(JSON.stringify(response), {
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e) {
            return new Response(JSON.stringify({
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: `Parse error: ${e.message}` }
            }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
    },
};