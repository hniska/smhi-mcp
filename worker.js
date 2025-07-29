// Import modular components
import { SMHIParameter, SMHIPeriod, CACHE_TTL, METOBS_BASE_URL, METFCST_BASE_URL, REQUEST_LIMITS, MCP_CONFIG } from './src/config/constants.js';
import { getCachedResponse, setCachedResponse, getCachedCSV, setCachedCSV, getR2CacheTTL } from './src/utils/cache.js';
import { levenshteinDistance, calculateSimilarity, normalizeSwedish } from './src/utils/string.js';
import { makeSmhiRequest, getWeatherDescription } from './src/api/smhi.js';
import { get_station_temperature, get_station_snow_depth, get_weather_forecast } from './src/services/weather.js';

const snowmobileConditionsStations = {
    // Stations with both temperature AND snow depth - ideal for snowmobile conditions
    "159770": { 
        name: "Glommersträsk", 
        hasTemperature: true, 
        hasSnowDepth: true,
        region: "Northern Sweden"
    },
    "188850": { 
        name: "Katterjåkk/Riksgränsen", 
        hasTemperature: true, 
        hasSnowDepth: true,
        region: "Arctic/Mountain"
    },
    "166810": { 
        name: "Gautosjö", 
        hasTemperature: true, 
        hasSnowDepth: true,
        region: "Northern Sweden"
    },
    
    // Temperature-only stations in snowmobile regions
    "155960": { 
        name: "Tärnaby/Hemavan (800m)", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Mountain"
    },
    "155970": { 
        name: "Tärnaby/Hemavan (450m)", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Mountain"
    },
    "155790": { 
        name: "Gielas A", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Northern Sweden"
    },
    "166910": { 
        name: "Mierkenis", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Northern Sweden"
    },
    "132170": { 
        name: "Storlien-Storvallen", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Mountain"
    },
    "159880": { 
        name: "Arvidsjaur", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Northern Sweden"
    },
    "151280": { 
        name: "Lövånger/Bjuröklubb", 
        hasTemperature: true, 
        hasSnowDepth: false,
        region: "Coastal"
    },
    
    // Snow depth-only stations in snowmobile regions
    "145500": { 
        name: "Borgafjäll", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Mountain"
    },
    "158970": { 
        name: "Arvidsjaur", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Northern Sweden"
    },
    "132180": { 
        name: "Storlien-Storvallen", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Mountain"
    },
    "155770": { 
        name: "Kittelfjäll", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Mountain"
    },
    "155940": { 
        name: "Tärnaby/Hemavan", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Mountain"
    },
    "158820": { 
        name: "Adak", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Northern Sweden"
    },
    "144530": { 
        name: "Jorm", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Mountain"
    },
    "151220": { 
        name: "Lövånger", 
        hasTemperature: false, 
        hasSnowDepth: true,
        region: "Coastal"
    }
};

// Legacy station maps for backward compatibility (deprecated)
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

// Constants now imported from src/config/constants.js

// SMHIParameter and SMHIPeriod now imported from src/config/constants.js

// Cache utilities now imported from src/utils/cache.js

// SMHI API client now imported from src/api/smhi.js

async function list_snowmobile_conditions() {
    const stationsByRegion = {
        "Arctic/Mountain": [],
        "Mountain": [],
        "Northern Sweden": [],
        "Coastal": []
    };
    
    let totalStations = 0;
    let dualCapabilityStations = 0;
    
    for (const [id, info] of Object.entries(snowmobileConditionsStations)) {
        const capabilities = [];
        if (info.hasTemperature) capabilities.push("Temperature");
        if (info.hasSnowDepth) capabilities.push("Snow Depth");
        
        if (info.hasTemperature && info.hasSnowDepth) {
            dualCapabilityStations++;
        }
        
        stationsByRegion[info.region].push({
            id: id,
            name: info.name,
            capabilities: capabilities.join(" + ")
        });
        totalStations++;
    }
    
    // Sort stations within each region by ID
    for (const region in stationsByRegion) {
        stationsByRegion[region].sort((a, b) => a.id.localeCompare(b.id));
    }
    
    const regionOutput = Object.entries(stationsByRegion)
        .filter(([region, stations]) => stations.length > 0)
        .map(([region, stations]) => 
            `📍 ${region} (${stations.length} stations):\n` + 
            stations.map(s => `  ${s.id}: ${s.name} (${s.capabilities})`).join('\n')
        ).join('\n\n');
    
    return {
        type: "text",
        text: `🛷 Snowmobile Conditions Monitoring Stations\n\n` +
               `${regionOutput}\n\n` +
               `📊 Summary:\n` +
               `• Total stations: ${totalStations}\n` +
               `• Dual capability (temp + snow): ${dualCapabilityStations}\n` +
               `• Temperature only: ${totalStations - dualCapabilityStations - Object.values(snowmobileConditionsStations).filter(s => !s.hasTemperature && s.hasSnowDepth).length}\n` +
               `• Snow depth only: ${Object.values(snowmobileConditionsStations).filter(s => !s.hasTemperature && s.hasSnowDepth).length}\n\n` +
               `💡 Use get_station_temperature or get_station_snow_depth with station IDs above.\n` +
               `🔍 Use search_stations_by_name_multi_param to find additional stations.`
    };
}

// Legacy functions for backward compatibility (deprecated)
async function list_temperature_stations() {
    return {
        type: "text",
        text: `⚠️  DEPRECATED: Use list_snowmobile_conditions instead.\n\nAvailable temperature stations:\n${JSON.stringify(temperatureStations, null, 2)}`
    };
}

async function list_snow_depth_stations() {
    return {
        type: "text",
        text: `⚠️  DEPRECATED: Use list_snowmobile_conditions instead.\n\nAvailable snow depth stations:\n${JSON.stringify(snowDepthStations, null, 2)}`
    };
}

// Temperature function now imported from src/services/weather.js

// Snow depth function now imported from src/services/weather.js

// Weather forecast function now imported from src/services/weather.js

// Convert SMHI weather symbol to description
// Weather description function now imported from src/api/smhi.js

async function get_station_precipitation(station_id, env, parameter = SMHIParameter.DAILY_PRECIP, period = SMHIPeriod.LATEST_DAY) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}/data.json`;
        const cacheKey = `precip-${station_id}-${parameter}-${period}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.current);
        
        if (!data.value || data.value.length === 0) {
            return {
                type: "text",
                text: `Error: No precipitation data available for station ${station_id}, parameter ${parameter}, period ${period}`
            };
        }
        
        const latestValue = data.value[data.value.length - 1];
        const parameterName = {
            [SMHIParameter.DAILY_PRECIP]: "Daily precipitation",
            [SMHIParameter.HOURLY_PRECIP]: "Hourly precipitation", 
            [SMHIParameter.PRECIP_15MIN]: "15-minute precipitation",
            [SMHIParameter.MONTHLY_PRECIP]: "Monthly precipitation"
        }[parameter] || "Precipitation";
        
        return {
            type: "text",
            text: `${parameterName} for station ${station_id}:\n` +
                   `Precipitation: ${latestValue.value} mm\n` +
                   `Timestamp: ${latestValue.date}\n` +
                   `Period: ${period}\n` +
                   `Station: ${data.station?.name || 'Unknown'}`
        };
    } catch (e) {
        return {
            type: "text",
            text: `Error: Failed to fetch precipitation data from SMHI: ${e.message}`
        };
    }
}

async function get_temperature_multi_resolution(station_id, env, parameter = SMHIParameter.AIR_TEMP, period = SMHIPeriod.LATEST_HOUR) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}/data.json`;
        const cacheKey = `temp-multi-${station_id}-${parameter}-${period}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.current);
        
        if (!data.value || data.value.length === 0) {
            return {
                type: "text",
                text: `Error: No temperature data available for station ${station_id}, parameter ${parameter}, period ${period}`
            };
        }
        
        const latestValue = data.value[data.value.length - 1];
        const parameterName = {
            [SMHIParameter.AIR_TEMP]: "Hourly temperature",
            [SMHIParameter.AVG_TEMP]: "Daily mean temperature",
            [SMHIParameter.MIN_TEMP]: "Daily minimum temperature",
            [SMHIParameter.MAX_TEMP]: "Daily maximum temperature",
            [SMHIParameter.MONTHLY_TEMP]: "Monthly mean temperature"
        }[parameter] || "Temperature";
        
        return {
            type: "text",
            text: `${parameterName} for station ${station_id}:\n` +
                   `Temperature: ${latestValue.value}°C\n` +
                   `Timestamp: ${latestValue.date}\n` +
                   `Period: ${period}\n` +
                   `Station: ${data.station?.name || 'Unknown'}`
        };
    } catch (e) {
        return {
            type: "text",
            text: `Error: Failed to fetch temperature data from SMHI: ${e.message}`
        };
    }
}

async function get_station_metadata(station_id, parameter) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}.json`;
        const cacheKey = `metadata-${station_id}-${parameter}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.metadata);
        
        // Extract station name from title (format: "Parameter - StationName: ...")
        let stationName = data.name || 'Unknown';
        if (data.title && data.title.includes(' - ') && data.title.includes(':')) {
            const titleParts = data.title.split(' - ')[1];
            if (titleParts) {
                stationName = titleParts.split(':')[0].trim();
            }
        }
        
        // Get position info (use latest position if multiple)
        const positions = data.position || [];
        const latestPosition = positions[positions.length - 1] || {};
        
        const periods = data.period || [];
        const periodsInfo = periods.map(p => ({
            key: p.key,
            from: p.from,
            to: p.to,
            summary: p.summary
        }));
        
        return {
            type: "text",
            text: `Station metadata for ${station_id}, parameter ${parameter}:\n` +
                   `Station: ${stationName}\n` +
                   `Owner: ${data.owner}\n` +
                   `Active: ${data.active}\n` +
                   `Height: ${latestPosition.height || 'Unknown'}m\n` +
                   `Position: ${latestPosition.latitude || 'Unknown'}, ${latestPosition.longitude || 'Unknown'}\n\n` +
                   `Available periods:\n${JSON.stringify(periodsInfo, null, 2)}`
        };
    } catch (e) {
        return {
            type: "text",
            text: `Error: Failed to fetch station metadata from SMHI: ${e.message}`
        };
    }
}

async function get_historical_data(station_id, parameter, period, limit = 10, cursor = null, reverse = true, fromDate = null, toDate = null, env = null) {
    try {
        // First get metadata to find CSV download URL (cache metadata)
        const metadataUrl = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}.json`;
        const metadataCacheKey = `hist-meta-${station_id}-${parameter}-${period}`;
        let metadata;
        
        try {
            metadata = await makeSmhiRequest(metadataUrl, metadataCacheKey, CACHE_TTL.metadata);
        } catch (e) {
            // If the specific parameter/period combination fails, check what's available for this station
            try {
                const stationUrl = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}.json`;
                const stationInfo = await makeSmhiRequest(stationUrl);
                const availablePeriods = stationInfo.period?.map(p => p.key) || [];
                
                return {
                    type: "text",
                    text: `Error: No data available for station ${station_id}, parameter ${parameter}, period ${period}.\n` +
                           `Available periods for this parameter: ${availablePeriods.join(', ') || 'none'}\n` +
                           `Station: ${stationInfo.title || 'Unknown'}`
                };
            } catch (stationError) {
                // If station doesn't support this parameter at all, suggest checking what parameters are available
                return {
                    type: "text",
                    text: `Error: Station ${station_id} does not support parameter ${parameter}.\n` +
                           `Use search_stations_by_name_multi_param to find what parameters this station supports, or try a different parameter:\n` +
                           `• 1 = hourly temperature\n` +
                           `• 2 = daily mean temperature\n` +
                           `• 5 = daily precipitation\n` +
                           `• 8 = snow depth`
                };
            }
        }
        
        // Extract CSV download URL from metadata
        const dataSection = metadata.data?.[0];
        const csvLink = dataSection?.link?.find(link => 
            link.type === 'text/plain' && link.href?.includes('data.csv')
        );
        if (!csvLink) {
            return {
                type: "text",
                text: `Error: No CSV data available for station ${station_id}, parameter ${parameter}, period ${period}`
            };
        }
        
        // Try R2 cache first for CSV data
        let csvText = await getCachedCSV(station_id, parameter, period, env, fromDate, toDate);
        
        if (!csvText) {
            // Download CSV data from SMHI
            const csvResponse = await fetch(csvLink.href, {
                headers: {
                    'accept': 'text/csv',
                    'referer': 'https://opendata.smhi.se/',
                    'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)'
                }
            });
            
            if (!csvResponse.ok) {
                throw new Error(`CSV download failed: ${csvResponse.status} ${csvResponse.statusText}`);
            }
            
            csvText = await csvResponse.text();
            
            // Cache the CSV in R2 for future requests
            await setCachedCSV(csvText, station_id, parameter, period, env);
        }
        const lines = csvText.trim().split('\n');
        
        if (lines.length < 2) {
            return {
                type: "text",
                text: `Error: No data found in CSV for station ${station_id}, parameter ${parameter}, period ${period}`
            };
        }
        
        // Parse CSV data - find where actual data starts (after metadata headers)
        const values = [];
        let dataStartIndex = -1;
        
        // Find the line that starts the actual data (contains "Datum;Tid" pattern for latest data)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Look for the header that indicates actual temperature/measurement data
            if (line.includes('Datum;Tid (UTC)') || (line.includes('Datum;Tid') && line.includes('Kvalitet'))) {
                dataStartIndex = i + 1; // Data starts after this header line
                break;
            }
        }
        
        // If we didn't find the specific header, try to detect data lines by pattern  
        // But skip the position data section (which has dates from 1960s-2020s)
        if (dataStartIndex === -1) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const parts = line.split(';');
                // Look for lines that start with a recent date pattern (recent data, not historical position info)
                if (parts.length >= 3 && parts[0].match(/^202[0-9]-\d{2}-\d{2}$/)) {
                    dataStartIndex = i;
                    break;
                }
            }
        }
        
        if (dataStartIndex === -1) {
            return {
                type: "text",
                text: `Error: Could not find data section in CSV for station ${station_id}, parameter ${parameter}, period ${period}`
            };
        }
        
        // Parse actual data rows
        for (let i = dataStartIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line.startsWith(';')) continue; // Skip empty lines and metadata lines
            
            const parts = line.split(';');
            if (parts.length >= 3) {
                // CSV format for latest data: Datum;Tid (UTC);Value;Quality;;
                const date = parts[0];
                const time = parts[1];
                const value = parseFloat(parts[2]);
                const quality = parts[3];
                
                // Combine date and time for display
                const dateTime = time ? `${date} ${time}` : date;
                
                // Only include valid data points (skip metadata/empty lines)
                if (!isNaN(value) && date && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    values.push({
                        date: dateTime,
                        value: value,
                        quality: quality || 'Unknown'
                    });
                }
            }
        }
        
        if (values.length === 0) {
            return {
                type: "text",
                text: `Error: No valid data points found for station ${station_id}, parameter ${parameter}, period ${period}`
            };
        }
        
        // Apply date filtering if specified
        let filteredData = values;
        if (fromDate || toDate) {
            const fromTimestamp = fromDate ? new Date(fromDate).getTime() : 0;
            const toTimestamp = toDate ? new Date(toDate).getTime() : Infinity;
            
            filteredData = values.filter(item => {
                const itemTimestamp = new Date(item.date).getTime();
                return itemTimestamp >= fromTimestamp && itemTimestamp <= toTimestamp;
            });
            
            if (filteredData.length === 0) {
                return {
                    type: "text",
                    text: `No data found between ${fromDate || 'beginning'} and ${toDate || 'end'} for station ${station_id}, parameter ${parameter}, period ${period}`
                };
            }
        }
        
        const totalValues = filteredData.length;
        let startIndex = 0;
        
        // Handle pagination cursor
        if (cursor) {
            try {
                startIndex = parseInt(atob(cursor), 10);
            } catch (e) {
                startIndex = 0;
            }
        }
        
        // For reverse pagination (newest first), start from the end
        let paginatedValues;
        let nextCursor = null;
        let prevCursor = null;
        
        if (reverse) {
            // Reverse pagination: show newest data first
            const endIndex = totalValues - startIndex;
            const actualStartIndex = Math.max(0, endIndex - limit);
            paginatedValues = filteredData.slice(actualStartIndex, endIndex).reverse();
            
            // Calculate cursors
            if (endIndex < totalValues) {
                prevCursor = btoa((startIndex - limit).toString());
            }
            if (actualStartIndex > 0) {
                nextCursor = btoa((startIndex + limit).toString());
            }
        } else {
            // Forward pagination: show oldest data first
            const endIndex = Math.min(totalValues, startIndex + limit);
            paginatedValues = filteredData.slice(startIndex, endIndex);
            
            // Calculate cursors  
            if (startIndex > 0) {
                prevCursor = btoa(Math.max(0, startIndex - limit).toString());
            }
            if (endIndex < totalValues) {
                nextCursor = btoa(endIndex.toString());
            }
        }
        
        const parameterName = {
            [SMHIParameter.AIR_TEMP]: "Temperature",
            [SMHIParameter.AVG_TEMP]: "Daily mean temperature",
            [SMHIParameter.MIN_TEMP]: "Daily minimum temperature", 
            [SMHIParameter.MAX_TEMP]: "Daily maximum temperature",
            [SMHIParameter.MONTHLY_TEMP]: "Monthly mean temperature",
            [SMHIParameter.DAILY_PRECIP]: "Daily precipitation",
            [SMHIParameter.HOURLY_PRECIP]: "Hourly precipitation",
            [SMHIParameter.PRECIP_15MIN]: "15-minute precipitation",
            [SMHIParameter.MONTHLY_PRECIP]: "Monthly precipitation",
            [SMHIParameter.SNOW_DEPTH]: "Snow depth"
        }[parameter] || "Data";
        
        const unit = parameter.includes("TEMP") ? "°C" : 
                    parameter.includes("PRECIP") ? "mm" :
                    parameter === SMHIParameter.SNOW_DEPTH ? "m" : "";
        
        const dataPoints = paginatedValues.map(v => `${v.date}: ${v.value}${unit} (${v.quality})`).join('\n');
        
        let paginationInfo = `\nShowing ${paginatedValues.length} of ${totalValues} total values`;
        if (fromDate || toDate) {
            paginationInfo += `\nFiltered between: ${fromDate || 'beginning'} and ${toDate || 'end'}`;
            paginationInfo += `\nOriginal dataset: ${values.length} values`;
        }
        if (nextCursor) paginationInfo += `\nNext page cursor: ${nextCursor}`;
        if (prevCursor) paginationInfo += `\nPrevious page cursor: ${prevCursor}`;
        
        // Extract station name from metadata title (format: "Parameter - StationName: ...")
        let stationName = metadata.station?.name || metadata.name || 'Unknown';
        if (metadata.title && metadata.title.includes(' - ') && metadata.title.includes(':')) {
            const titleParts = metadata.title.split(' - ')[1];
            if (titleParts) {
                stationName = titleParts.split(':')[0].trim();
            }
        }

        return {
            type: "text",
            text: `Historical ${parameterName.toLowerCase()} for station ${station_id}:\n` +
                   `Period: ${period}\n` +
                   `Station: ${stationName}\n` +
                   `Order: ${reverse ? 'Newest first' : 'Oldest first'}\n\n` +
                   `${dataPoints}${paginationInfo}`,
            nextCursor: nextCursor,
            prevCursor: prevCursor,
            totalCount: totalValues,
            originalCount: values.length,
            filtered: !!(fromDate || toDate)
        };
    } catch (e) {
        return {
            type: "text",
            text: `Error: Failed to fetch historical data from SMHI: ${e.message}`
        };
    }
}

// String utilities now imported from src/utils/string.js

// Station listing functions with pagination
async function list_all_stations_for_parameter(parameter, cursor) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}.json`;
        const cacheKey = `stations-${parameter}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.metadata);
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

async function list_all_temperature_stations(env, cursor) {
    return await list_all_stations_for_parameter(SMHIParameter.AIR_TEMP, cursor);
}

async function list_all_snow_depth_stations(env, cursor) {
    return await list_all_stations_for_parameter(SMHIParameter.SNOW_DEPTH, cursor);
}

async function list_all_precipitation_stations(env, parameter = SMHIParameter.DAILY_PRECIP, cursor) {
    return await list_all_stations_for_parameter(parameter, cursor);
}

async function search_stations_by_name_multi_param(query, env, limit = 10, threshold = 0.3) {
    const parameters = [SMHIParameter.AIR_TEMP, SMHIParameter.DAILY_PRECIP, SMHIParameter.HOURLY_PRECIP, SMHIParameter.SNOW_DEPTH];
    const allResults = [];
    
    try {
        // Search across all major parameters
        for (const parameter of parameters) {
            try {
                const url = `${METOBS_BASE_URL}/parameter/${parameter}.json`;
                const cacheKey = `stations-${parameter}`;
                const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.metadata);
                const stations = data.station || [];
                
                const normalizedQuery = normalizeSwedish(query);
                
                for (const station of stations) {
                    const stationName = station.name || '';
                    const normalizedName = normalizeSwedish(stationName);
                    
                    let score = 0;
                    let matchType = '';
                    
                    // Exact match (case insensitive)
                    if (normalizedName === normalizedQuery) {
                        score = 1.0;
                        matchType = 'exact';
                    }
                    // Substring match
                    else if (normalizedName.includes(normalizedQuery)) {
                        score = 0.9 - (Math.abs(normalizedName.length - normalizedQuery.length) / normalizedName.length) * 0.1;
                        matchType = 'substring';
                    }
                    // Fuzzy match
                    else {
                        const similarity = calculateSimilarity(normalizedQuery, normalizedName);
                        if (similarity >= threshold) {
                            score = similarity;
                            matchType = 'fuzzy';
                        }
                    }
                    
                    if (score >= threshold) {
                        // Check if we already have this station from another parameter
                        const existingResult = allResults.find(r => r.id === station.key);
                        if (existingResult) {
                            // Keep the result with higher score, or add parameter info
                            if (score > existingResult.score) {
                                existingResult.score = score;
                                existingResult.matchType = matchType;
                                existingResult.name = stationName;
                                existingResult.parameter = parameter;
                            }
                            // Add parameter to list
                            if (!existingResult.parameters) {
                                existingResult.parameters = [existingResult.parameter];
                            }
                            if (!existingResult.parameters.includes(parameter)) {
                                existingResult.parameters.push(parameter);
                            }
                        } else {
                            allResults.push({
                                id: station.key,
                                name: stationName,
                                latitude: station.latitude,
                                longitude: station.longitude,
                                height: station.height,
                                active: station.active,
                                owner: station.owner,
                                score: score,
                                matchType: matchType,
                                parameter: parameter,
                                parameters: [parameter]
                            });
                        }
                    }
                }
            } catch (e) {
                // Continue with other parameters if one fails
                continue;
            }
        }
        
        // Sort by score (descending) and then by name
        allResults.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.name.localeCompare(b.name);
        });
        
        // Limit results
        const limitedResults = allResults.slice(0, limit);
        
        if (limitedResults.length === 0) {
            return {
                type: "text",
                text: `No stations found matching "${query}" across all parameters (threshold: ${threshold})`
            };
        }
        
        const resultsText = limitedResults.map(r => {
            const paramNames = (r.parameters || [r.parameter]).map(p => {
                return {
                    [SMHIParameter.AIR_TEMP]: "Temperature",
                    [SMHIParameter.DAILY_PRECIP]: "Daily Precipitation",
                    [SMHIParameter.HOURLY_PRECIP]: "Hourly Precipitation",
                    [SMHIParameter.SNOW_DEPTH]: "Snow Depth"
                }[p] || `Parameter ${p}`;
            }).join(', ');
            
            return `${r.id}: ${r.name} (${r.matchType}, score: ${r.score.toFixed(2)})\n` +
                   `  Location: ${r.latitude}, ${r.longitude} (${r.height}m)\n` +
                   `  Status: ${r.active ? 'Active' : 'Inactive'}, Owner: ${r.owner}\n` +
                   `  Available for: ${paramNames}`;
        }).join('\n\n');
        
        return {
            type: "text",
            text: `Multi-parameter station search results for "${query}":\n` +
                   `Found ${limitedResults.length} of ${allResults.length} matches (threshold: ${threshold})\n\n` +
                   resultsText
        };
        
    } catch (e) {
        return {
            type: "text",
            text: `Error: Failed to search stations across parameters: ${e.message}`
        };
    }
}

async function search_stations_by_name(query, env, parameter = SMHIParameter.AIR_TEMP, limit = 10, threshold = 0.3) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}.json`;
        const cacheKey = `stations-${parameter}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.metadata);
        const stations = data.station || [];

        if (stations.length === 0) {
            return {
                type: "text",
                text: `No stations found for parameter ${parameter}`
            };
        }

        const normalizedQuery = normalizeSwedish(query);
        const results = [];

        for (const station of stations) {
            const stationName = station.name || '';
            const normalizedName = normalizeSwedish(stationName);
            
            let score = 0;
            let matchType = '';

            // Exact match (case insensitive)
            if (normalizedName === normalizedQuery) {
                score = 1.0;
                matchType = 'exact';
            }
            // Substring match
            else if (normalizedName.includes(normalizedQuery)) {
                score = 0.9 - (Math.abs(normalizedName.length - normalizedQuery.length) / normalizedName.length) * 0.1;
                matchType = 'substring';
            }
            // Fuzzy match
            else {
                const similarity = calculateSimilarity(normalizedQuery, normalizedName);
                if (similarity >= threshold) {
                    score = similarity;
                    matchType = 'fuzzy';
                }
            }

            if (score >= threshold) {
                results.push({
                    id: station.key,
                    name: stationName,
                    latitude: station.latitude,
                    longitude: station.longitude,
                    height: station.height,
                    active: station.active,
                    owner: station.owner,
                    score: score,
                    matchType: matchType
                });
            }
        }

        // Sort by score (descending) and then by name
        results.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.name.localeCompare(b.name);
        });

        // Limit results
        const limitedResults = results.slice(0, limit);

        if (limitedResults.length === 0) {
            return {
                type: "text",
                text: `No stations found matching "${query}" for parameter ${parameter} (threshold: ${threshold})`
            };
        }

        const parameterName = {
            [SMHIParameter.AIR_TEMP]: "Temperature",
            [SMHIParameter.DAILY_PRECIP]: "Daily Precipitation",
            [SMHIParameter.HOURLY_PRECIP]: "Hourly Precipitation",
            [SMHIParameter.SNOW_DEPTH]: "Snow Depth"
        }[parameter] || `Parameter ${parameter}`;

        const resultsText = limitedResults.map(r => 
            `${r.id}: ${r.name} (${r.matchType}, score: ${r.score.toFixed(2)})\n` +
            `  Location: ${r.latitude}, ${r.longitude} (${r.height}m)\n` +
            `  Status: ${r.active ? 'Active' : 'Inactive'}, Owner: ${r.owner}`
        ).join('\n\n');

        return {
            type: "text",
            text: `Station search results for "${query}" (${parameterName}):\n` +
                   `Found ${limitedResults.length} of ${results.length} matches (threshold: ${threshold})\n\n` +
                   resultsText
        };

    } catch (e) {
        return {
            type: "text",
            text: `Error: Failed to search stations: ${e.message}`
        };
    }
}

const server = {
    name: "smhi-mcp",
    version: "1.0.0",
    env: null, // Will be set in fetch handler

    get_tools() {
        return [
            // Snowmobile conditions tool
            { name: "list_snowmobile_conditions", description: "Lists weather stations relevant for snowmobile conditions, organized by region and showing both temperature and snow depth monitoring capabilities across northern Sweden and mountain regions.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
            
            // Legacy tools (deprecated but maintained for compatibility)
            { name: "list_temperature_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined temperature monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
            { name: "list_snow_depth_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined snow depth monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
            { name: "get_station_temperature", description: "Fetches the latest temperature reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
            { name: "get_station_snow_depth", description: "Fetches the latest snow depth reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
            { name: "get_weather_forecast", description: "Retrieves weather forecast for the given coordinates using SMHI data with optional time filtering and limit control.", inputSchema: { type: "object", properties: { "lat": { type: "number" }, "lon": { type: "number" }, "fromDate": { type: "string", description: "Start date/time for filtering (ISO 8601 format, e.g., '2025-06-30' or '2025-06-30T12:00:00Z')" }, "toDate": { type: "string", description: "End date/time for filtering (ISO 8601 format, e.g., '2025-07-05' or '2025-07-05T23:59:59Z')" }, "limit": { type: "number", description: "Number of hourly forecast periods to return. Each period = 1 hour of weather data. Examples: 8=8 hours (~today), 24=1 day, 48=2 days, 168=1 week. Default: 8, Max: 100", default: 8 } }, required: ["lat", "lon"] } },
            
            // Multi-resolution precipitation tools
            { name: "get_station_precipitation", description: "Fetches precipitation data with multiple resolutions (daily, hourly, 15-min, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "period": { type: "string", description: "Data period: latest-day, latest-hour, latest-months, corrected-archive", default: "latest-day" } }, required: ["station_id"] } },
            
            // Multi-resolution temperature tools
            { name: "get_temperature_multi_resolution", description: "Fetches temperature data with multiple resolutions (hourly, daily mean/min/max, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Temperature parameter: 1=hourly, 2=daily-mean, 19=daily-min, 20=daily-max, 22=monthly", default: "1" }, "period": { type: "string", description: "Data period: latest-hour, latest-day, latest-months, corrected-archive", default: "latest-hour" } }, required: ["station_id"] } },
            
            // Station metadata and discovery
            { name: "get_station_metadata", description: "Retrieves detailed metadata and available periods for a station and parameter.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code: 1=temp-hourly, 2=temp-daily-mean, 19=temp-daily-min, 20=temp-daily-max, 22=temp-monthly, 5=precip-daily, 7=precip-hourly, 14=precip-15min, 23=precip-monthly, 8=snow-depth" } }, required: ["station_id", "parameter"] } },
            
            // Historical data access with pagination and date filtering
            { name: "get_historical_data", description: "Fetches historical data for any parameter and period with pagination and date filtering support.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code: 1=temp-hourly, 2=temp-daily-mean, 19=temp-daily-min, 20=temp-daily-max, 22=temp-monthly, 5=precip-daily, 7=precip-hourly, 14=precip-15min, 23=precip-monthly, 8=snow-depth" }, "period": { type: "string", description: "Data period: corrected-archive, latest-months, latest-day, latest-hour" }, "limit": { type: "number", description: "Number of values per page", default: 10 }, "cursor": { type: "string", description: "Pagination cursor for next/previous page" }, "reverse": { type: "boolean", description: "Show newest data first (true) or oldest first (false)", default: true }, "fromDate": { type: "string", description: "Start date for filtering (ISO 8601 format, e.g., '2024-01-01' or '2024-01-01T12:00:00Z')" }, "toDate": { type: "string", description: "End date for filtering (ISO 8601 format, e.g., '2024-12-31' or '2024-12-31T23:59:59Z')" } }, required: ["station_id", "parameter", "period"] } },
            
            // Station listing with pagination
            { name: "list_all_temperature_stations", description: "Retrieves all SMHI stations that provide temperature data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
            { name: "list_all_snow_depth_stations", description: "Retrieves all SMHI stations that provide snow depth data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
            { name: "list_all_precipitation_stations", description: "Retrieves all SMHI stations that provide precipitation data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "cursor": { type: "string" } } } },
            
            // Station search
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
                        protocolVersion: "2025-06-18", 
                        capabilities: { 
                            tools: { listChanged: true } 
                        }, 
                        serverInfo: { 
                            name: this.name, 
                            version: this.version 
                        } 
                    };
                    break;
                case "tools/list":
                    result = { tools: this.get_tools() };
                    break;
                case "resources/list":
                    // MCP resources endpoint - return empty resources for now
                    result = { resources: [] };
                    break;
                case "prompts/list":
                    // MCP prompts endpoint - return empty prompts for now
                    result = { prompts: [] };
                    break;
                case "notifications/initialized":
                    // This is a notification from the client that it has completed initialization
                    // Notifications don't expect a response - return null to indicate no response
                    console.log('Client initialization complete');
                    return null;
                case "tools/call":
                    const { name, arguments: args } = params;
                    switch (name) {
                        // Snowmobile conditions tool
                        case "list_snowmobile_conditions":
                            result = { content: [await list_snowmobile_conditions()] };
                            break;
                            
                        // Legacy tools (deprecated)
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
                            result = { content: [await get_weather_forecast(args.lat, args.lon, args.fromDate, args.toDate, args.limit)] };
                            break;
                        
                        // Multi-resolution tools
                        case "get_station_precipitation":
                            result = { content: [await get_station_precipitation(args.station_id, this.env, args.parameter, args.period)] };
                            break;
                        case "get_temperature_multi_resolution":
                            result = { content: [await get_temperature_multi_resolution(args.station_id, this.env, args.parameter, args.period)] };
                            break;
                        case "get_station_metadata":
                            result = { content: [await get_station_metadata(args.station_id, args.parameter)] };
                            break;
                        case "get_historical_data":
                            result = { content: [await get_historical_data(args.station_id, args.parameter, args.period, args.limit, args.cursor, args.reverse, args.fromDate, args.toDate, this.env)] };
                            break;
                        
                        // Station listing tools
                        case "list_all_temperature_stations":
                            result = { content: [await list_all_stations_for_parameter(SMHIParameter.AIR_TEMP, args.cursor)] };
                            break;
                        case "list_all_snow_depth_stations":
                            result = { content: [await list_all_stations_for_parameter(SMHIParameter.SNOW_DEPTH, args.cursor)] };
                            break;
                        case "list_all_precipitation_stations":
                            result = { content: [await list_all_stations_for_parameter(args.parameter || SMHIParameter.DAILY_PRECIP, args.cursor)] };
                            break;
                        case "search_stations_by_name":
                            result = { content: [await search_stations_by_name(args.query, this.env, args.parameter, args.limit, args.threshold)] };
                            break;
                        case "search_stations_by_name_multi_param":
                            result = { content: [await search_stations_by_name_multi_param(args.query, this.env, args.limit, args.threshold)] };
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

// Request counting for free tier limits
async function checkRequestLimits() {
    const cache = caches.default;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const countKey = `https://cache.smhi-mcp.local/daily-requests-${today}`;
    
    let response = await cache.match(countKey);
    let count = 0;
    
    if (response) {
        const data = await response.json();
        count = data.count || 0;
    }
    
    // Check if approaching limit (95% of 100k free tier)
    if (count >= 95000) {
        throw new Error('Daily request limit reached. Service temporarily unavailable.');
    }
    
    // Increment counter
    count++;
    const newResponse = new Response(JSON.stringify({ count }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'max-age=86400' // 24 hours
        }
    });
    await cache.put(countKey, newResponse);
    
    return count;
}

// SSE handler for Claude web UI (the correct transport method)
async function handleSSE(request, env, requestId) {
    console.log(`[${requestId}] Setting up SSE connection for Claude web UI`);
    
    // Create a TransformStream for SSE
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    
    // Set up the MCP server
    const mcpServer = {
        name: "smhi-mcp",
        version: "1.0.0",
        env: env,
        
        get_tools() {
            return [
                { name: "list_snowmobile_conditions", description: "Lists weather stations relevant for snowmobile conditions, organized by region and showing both temperature and snow depth monitoring capabilities across northern Sweden and mountain regions.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                { name: "list_temperature_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined temperature monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                { name: "list_snow_depth_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined snow depth monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                { name: "get_station_temperature", description: "Fetches the latest temperature reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                { name: "get_station_snow_depth", description: "Fetches the latest snow depth reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                { name: "get_weather_forecast", description: "Retrieves weather forecast for the given coordinates using SMHI data with optional time filtering and limit control.", inputSchema: { type: "object", properties: { "lat": { type: "number" }, "lon": { type: "number" }, "fromDate": { type: "string", description: "Start date/time for filtering (ISO 8601 format, e.g., '2025-06-30' or '2025-06-30T12:00:00Z')" }, "toDate": { type: "string", description: "End date/time for filtering (ISO 8601 format, e.g., '2025-07-05' or '2025-07-05T23:59:59Z')" }, "limit": { type: "number", description: "Number of hourly forecast periods to return. Each period = 1 hour of weather data. Examples: 8=8 hours (~today), 24=1 day, 48=2 days, 168=1 week. Default: 8, Max: 100", default: 8 } }, required: ["lat", "lon"] } },
                { name: "get_station_precipitation", description: "Fetches precipitation data with multiple resolutions (daily, hourly, 15-min, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "period": { type: "string", description: "Data period: latest-day, latest-hour, latest-months, corrected-archive", default: "latest-day" } }, required: ["station_id"] } },
                { name: "get_temperature_multi_resolution", description: "Fetches temperature data with multiple resolutions (hourly, daily mean/min/max, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Temperature parameter: 1=hourly, 2=daily-mean, 19=daily-min, 20=daily-max, 22=monthly", default: "1" }, "period": { type: "string", description: "Data period: latest-hour, latest-day, latest-months, corrected-archive", default: "latest-hour" } }, required: ["station_id"] } },
                { name: "get_station_metadata", description: "Retrieves detailed metadata and available periods for a station and parameter.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code: 1=temp-hourly, 2=temp-daily-mean, 19=temp-daily-min, 20=temp-daily-max, 22=temp-monthly, 5=precip-daily, 7=precip-hourly, 14=precip-15min, 23=precip-monthly, 8=snow-depth" } }, required: ["station_id", "parameter"] } },
                { name: "get_historical_data", description: "Fetches historical data for any parameter and period with pagination and date filtering support.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code: 1=temp-hourly, 2=temp-daily-mean, 19=temp-daily-min, 20=temp-daily-max, 22=temp-monthly, 5=precip-daily, 7=precip-hourly, 14=precip-15min, 23=precip-monthly, 8=snow-depth" }, "period": { type: "string", description: "Data period: corrected-archive, latest-months, latest-day, latest-hour" }, "limit": { type: "number", description: "Number of values per page", default: 10 }, "cursor": { type: "string", description: "Pagination cursor for next/previous page" }, "reverse": { type: "boolean", description: "Show newest data first (true) or oldest first (false)", default: true }, "fromDate": { type: "string", description: "Start date for filtering (ISO 8601 format, e.g., '2024-01-01' or '2024-01-01T12:00:00Z')" }, "toDate": { type: "string", description: "End date for filtering (ISO 8601 format, e.g., '2024-12-31' or '2024-12-31T23:59:59Z')" } }, required: ["station_id", "parameter", "period"] } },
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
                            protocolVersion: "2025-06-18", 
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
                        // Handle all tool calls using the existing functions
                        const { name, arguments: args } = params;
                        let toolResult;
                        
                        switch (name) {
                            case "list_snowmobile_conditions":
                                toolResult = await list_snowmobile_conditions();
                                break;
                            case "list_temperature_stations":
                                toolResult = await list_temperature_stations();
                                break;
                            case "list_snow_depth_stations":
                                toolResult = await list_snow_depth_stations();
                                break;
                            case "get_station_temperature":
                                toolResult = await get_station_temperature(args.station_id, this.env);
                                break;
                            case "get_station_snow_depth":
                                toolResult = await get_station_snow_depth(args.station_id, this.env);
                                break;
                            case "get_weather_forecast":
                                toolResult = await get_weather_forecast(args.lat, args.lon, args.fromDate, args.toDate, args.limit);
                                break;
                            case "get_station_precipitation":
                                toolResult = await get_station_precipitation(args.station_id, this.env, args.parameter, args.period);
                                break;
                            case "get_temperature_multi_resolution":
                                toolResult = await get_temperature_multi_resolution(args.station_id, this.env, args.parameter, args.period);
                                break;
                            case "get_station_metadata":
                                toolResult = await get_station_metadata(args.station_id, args.parameter, this.env);
                                break;
                            case "get_historical_data":
                                toolResult = await get_historical_data(args.station_id, args.parameter, args.period, this.env, args.limit, args.cursor, args.reverse, args.fromDate, args.toDate);
                                break;
                            case "list_all_temperature_stations":
                                toolResult = await list_all_temperature_stations(this.env, args.cursor);
                                break;
                            case "list_all_snow_depth_stations":
                                toolResult = await list_all_snow_depth_stations(this.env, args.cursor);
                                break;
                            case "list_all_precipitation_stations":
                                toolResult = await list_all_precipitation_stations(this.env, args.parameter, args.cursor);
                                break;
                            case "search_stations_by_name":
                                toolResult = await search_stations_by_name(args.query, this.env, args.parameter, args.limit, args.threshold);
                                break;
                            case "search_stations_by_name_multi_param":
                                toolResult = await search_stations_by_name_multi_param(args.query, this.env, args.limit, args.threshold);
                                break;
                            default:
                                throw new Error(`Unknown tool: ${name}`);
                        }
                        
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
    
    // For SSE, Claude web UI expects immediate JSON responses via regular HTTP
    // The SSE connection is used for long-running operations, but MCP requests are typically short
    if (request.method === 'POST') {
        try {
            const body = await request.json();
            console.log(`[${requestId}] SSE request:`, JSON.stringify(body, null, 2));
            
            const response = await mcpServer.handle_request(body);
            console.log(`[${requestId}] SSE response:`, JSON.stringify(response, null, 2));
            
            // If response is null (notification), return 204 No Content
            if (response === null) {
                return new Response('', { status: 204 });
            }
            
            // For MCP over SSE, we typically return JSON directly
            return new Response(JSON.stringify(response), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version',
                    'mcp-protocol-version': '2025-06-18'
                }
            });
            
        } catch (error) {
            console.log(`[${requestId}] SSE error:`, error.message);
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
                    'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version',
                    'mcp-protocol-version': '2025-06-18'
                }
            });
        }
    } else {
        // For GET requests, establish SSE connection
        console.log(`[${requestId}] SSE connection established`);
        
        // Send initial connection message
        const initialMessage = `data: {"type":"connection","status":"established","timestamp":"${new Date().toISOString()}"}\n\n`;
        await writer.write(new TextEncoder().encode(initialMessage));
        
        // Keep connection alive with periodic heartbeats
        const heartbeatInterval = setInterval(async () => {
            try {
                const heartbeat = `data: {"type":"heartbeat","timestamp":"${new Date().toISOString()}"}\n\n`;
                await writer.write(new TextEncoder().encode(heartbeat));
            } catch (err) {
                console.log(`[${requestId}] Heartbeat failed:`, err.message);
                clearInterval(heartbeatInterval);
            }
        }, 10000); // Every 10 seconds
        
        // Close connection after 5 minutes of inactivity
        setTimeout(async () => {
            clearInterval(heartbeatInterval);
            try {
                await writer.close();
            } catch (err) {
                // Connection may already be closed
            }
        }, 300000); // 5 minutes
    }
    
    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version',
        },
    });
}

// DEPRECATED: Hybrid SSE/HTTP handler - removed for MCP spec compliance
// This function has been deprecated and should not be used
async function handleHybridSSE_DEPRECATED(request, env, requestId) {
    console.log(`[${requestId}] Setting up hybrid SSE/HTTP connection`);
    
    // Create a TransformStream for SSE
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    
    // Set up the MCP server (same as handleSSE)
    const server = {
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
                        result = { tools: [
                            { name: "list_snowmobile_conditions", description: "Lists weather stations relevant for snowmobile conditions, organized by region and showing both temperature and snow depth monitoring capabilities across northern Sweden and mountain regions.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                            { name: "list_temperature_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined temperature monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                            { name: "list_snow_depth_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined snow depth monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                            { name: "get_station_temperature", description: "Fetches the latest temperature reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                            { name: "get_station_snow_depth", description: "Fetches the latest snow depth reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                            { name: "get_weather_forecast", description: "Retrieves weather forecast for the given coordinates using SMHI data with optional time filtering and limit control.", inputSchema: { type: "object", properties: { "lat": { type: "number" }, "lon": { type: "number" }, "fromDate": { type: "string", description: "Start date/time for filtering (ISO 8601 format, e.g., '2025-06-30' or '2025-06-30T12:00:00Z')" }, "toDate": { type: "string", description: "End date/time for filtering (ISO 8601 format, e.g., '2025-07-05' or '2025-07-05T23:59:59Z')" }, "limit": { type: "number", description: "Number of hourly forecast periods to return. Each period = 1 hour of weather data. Examples: 8=8 hours (~today), 24=1 day, 48=2 days, 168=1 week. Default: 8, Max: 100", default: 8 } }, required: ["lat", "lon"] } },
                            { name: "get_station_precipitation", description: "Fetches precipitation data with multiple resolutions (daily, hourly, 15-min, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "period": { type: "string", description: "Data period: latest-day, latest-hour, latest-months, corrected-archive", default: "latest-day" } }, required: ["station_id"] } },
                            { name: "get_temperature_multi_resolution", description: "Fetches temperature data with multiple resolutions (hourly, daily mean/min/max, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Temperature parameter: 1=hourly, 2=daily-mean, 19=daily-min, 20=daily-max, 22=monthly", default: "1" }, "period": { type: "string", description: "Data period: latest-hour, latest-day, latest-months, corrected-archive", default: "latest-hour" } }, required: ["station_id"] } },
                            { name: "get_station_metadata", description: "Retrieves detailed metadata and available periods for a station and parameter.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code: 1=temp-hourly, 2=temp-daily-mean, 19=temp-daily-min, 20=temp-daily-max, 22=temp-monthly, 5=precip-daily, 7=precip-hourly, 14=precip-15min, 23=precip-monthly, 8=snow-depth" } }, required: ["station_id", "parameter"] } },
                            { name: "get_historical_data", description: "Fetches historical data for any parameter and period with pagination and date filtering support.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code: 1=temp-hourly, 2=temp-daily-mean, 19=temp-daily-min, 20=temp-daily-max, 22=temp-monthly, 5=precip-daily, 7=precip-hourly, 14=precip-15min, 23=precip-monthly, 8=snow-depth" }, "period": { type: "string", description: "Data period: corrected-archive, latest-months, latest-day, latest-hour" }, "limit": { type: "number", description: "Number of values per page", default: 10 }, "cursor": { type: "string", description: "Pagination cursor for next/previous page" }, "reverse": { type: "boolean", description: "Show newest data first (true) or oldest first (false)", default: true }, "fromDate": { type: "string", description: "Start date for filtering (ISO 8601 format, e.g., '2024-01-01' or '2024-01-01T12:00:00Z')" }, "toDate": { type: "string", description: "End date for filtering (ISO 8601 format, e.g., '2024-12-31' or '2024-12-31T23:59:59Z')" } }, required: ["station_id", "parameter", "period"] } },
                            { name: "list_all_temperature_stations", description: "Retrieves all SMHI stations that provide temperature data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
                            { name: "list_all_snow_depth_stations", description: "Retrieves all SMHI stations that provide snow depth data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
                            { name: "list_all_precipitation_stations", description: "Retrieves all SMHI stations that provide precipitation data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "cursor": { type: "string" } } } },
                            { name: "search_stations_by_name", description: "Search for weather stations by name using fuzzy matching within a specific parameter type.", inputSchema: { type: "object", properties: { "query": { type: "string", description: "Station name to search for" }, "parameter": { type: "string", description: "Parameter type to filter stations: 1=temperature, 5=daily-precip, 7=hourly-precip, 8=snow-depth", default: "1" }, "limit": { type: "number", description: "Maximum number of results to return", default: 10 }, "threshold": { type: "number", description: "Minimum similarity score (0.0-1.0) for fuzzy matching", default: 0.3 } }, required: ["query"] } },
                            { name: "search_stations_by_name_multi_param", description: "Search for weather stations by name across all parameter types (temperature, precipitation, snow). Useful when you don't know which parameter type a station supports.", inputSchema: { type: "object", properties: { "query": { type: "string", description: "Station name to search for" }, "limit": { type: "number", description: "Maximum number of results to return", default: 10 }, "threshold": { type: "number", description: "Minimum similarity score (0.0-1.0) for fuzzy matching", default: 0.3 } }, required: ["query"] } }
                        ] };
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
                        // Handle all tool calls using the existing functions
                        const { name, arguments: args } = params;
                        let toolResult;
                        
                        switch (name) {
                            case "list_snowmobile_conditions":
                                toolResult = await list_snowmobile_conditions();
                                break;
                            case "list_temperature_stations":
                                toolResult = await list_temperature_stations();
                                break;
                            case "list_snow_depth_stations":
                                toolResult = await list_snow_depth_stations();
                                break;
                            case "get_station_temperature":
                                toolResult = await get_station_temperature(args.station_id, this.env);
                                break;
                            case "get_station_snow_depth":
                                toolResult = await get_station_snow_depth(args.station_id, this.env);
                                break;
                            case "get_weather_forecast":
                                toolResult = await get_weather_forecast(args.lat, args.lon, args.fromDate, args.toDate, args.limit);
                                break;
                            case "get_station_precipitation":
                                toolResult = await get_station_precipitation(args.station_id, this.env, args.parameter, args.period);
                                break;
                            case "get_temperature_multi_resolution":
                                toolResult = await get_temperature_multi_resolution(args.station_id, this.env, args.parameter, args.period);
                                break;
                            case "get_station_metadata":
                                toolResult = await get_station_metadata(args.station_id, args.parameter, this.env);
                                break;
                            case "get_historical_data":
                                toolResult = await get_historical_data(args.station_id, args.parameter, args.period, this.env, args.limit, args.cursor, args.reverse, args.fromDate, args.toDate);
                                break;
                            case "list_all_temperature_stations":
                                toolResult = await list_all_temperature_stations(this.env, args.cursor);
                                break;
                            case "list_all_snow_depth_stations":
                                toolResult = await list_all_snow_depth_stations(this.env, args.cursor);
                                break;
                            case "list_all_precipitation_stations":
                                toolResult = await list_all_precipitation_stations(this.env, args.parameter, args.cursor);
                                break;
                            case "search_stations_by_name":
                                toolResult = await search_stations_by_name(args.query, this.env, args.parameter, args.limit, args.threshold);
                                break;
                            case "search_stations_by_name_multi_param":
                                toolResult = await search_stations_by_name_multi_param(args.query, this.env, args.limit, args.threshold);
                                break;
                            default:
                                throw new Error(`Unknown tool: ${name}`);
                        }
                        
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
    
    // Process the POST request body and stream the response over SSE
    (async () => {
        try {
            const body = await request.json();
            console.log(`[${requestId}] Hybrid SSE request:`, JSON.stringify(body, null, 2));
            
            const response = await server.handle_request(body);
            console.log(`[${requestId}] Hybrid SSE response:`, JSON.stringify(response, null, 2));
            
            // If response is null (notification), send an empty SSE event
            if (response === null) {
                const event = `data: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: null })}\n\n`;
                await writer.write(new TextEncoder().encode(event));
            } else {
                // Stream the JSON-RPC response as an SSE event
                const event = `data: ${JSON.stringify(response)}\n\n`;
                await writer.write(new TextEncoder().encode(event));
            }
            
            // Close the writer after sending the response
            await writer.close();
            
        } catch (error) {
            console.log(`[${requestId}] Hybrid SSE error:`, error.message);
            const errorResponse = {
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: `Parse error: ${error.message}` }
            };
            const event = `data: ${JSON.stringify(errorResponse)}\n\n`;
            await writer.write(new TextEncoder().encode(event));
            await writer.close();
        }
    })();
    
    return new Response(readable, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version',
            'mcp-protocol-version': '2025-06-18'
        }
    });
}

// WebSocket handler for Claude web UI
async function handleWebSocket(request, env, requestId) {
    console.log(`[${requestId}] Handling WebSocket connection`);
    
    try {
        // Accept the WebSocket connection
        const webSocketPair = new WebSocketPair();
        const [client, server] = Object.values(webSocketPair);
    
    console.log(`[${requestId}] WebSocket pair created`);
    
    // Set up the server to handle MCP protocol over WebSocket
    server.accept();
    console.log(`[${requestId}] WebSocket server accepted connection`);
    
    // Set env for R2 access
    server.env = env;
    
    server.addEventListener('message', async (event) => {
        const messageId = Math.random().toString(36).substr(2, 9);
        console.log(`[${requestId}:${messageId}] WebSocket message received:`, event.data);
        
        try {
            const message = JSON.parse(event.data);
            console.log(`[${requestId}:${messageId}] Parsed WebSocket message:`, JSON.stringify(message, null, 2));
            
            // Fast response for simple methods to prevent timeout
            if (message.method === 'tools/list') {
                console.log(`[${requestId}:${messageId}] Fast path for tools/list`);
                const response = {
                    jsonrpc: "2.0",
                    id: message.id,
                    result: {
                        tools: [
                            { name: "list_snowmobile_conditions", description: "Lists weather stations relevant for snowmobile conditions, organized by region and showing both temperature and snow depth monitoring capabilities across northern Sweden and mountain regions.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                            { name: "list_temperature_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined temperature monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                            { name: "list_snow_depth_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined snow depth monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                            { name: "get_station_temperature", description: "Fetches the latest temperature reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                            { name: "get_station_snow_depth", description: "Fetches the latest snow depth reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                            { name: "get_weather_forecast", description: "Retrieves weather forecast for the given coordinates using SMHI data with optional time filtering and limit control.", inputSchema: { type: "object", properties: { "lat": { type: "number" }, "lon": { type: "number" }, "fromDate": { type: "string", description: "Start date/time for filtering (ISO 8601 format, e.g., '2025-06-30' or '2025-06-30T12:00:00Z')" }, "toDate": { type: "string", description: "End date/time for filtering (ISO 8601 format, e.g., '2025-07-05' or '2025-07-05T23:59:59Z')" }, "limit": { type: "number", description: "Number of hourly forecast periods to return. Each period = 1 hour of weather data. Examples: 8=8 hours (~today), 24=1 day, 48=2 days, 168=1 week. Default: 8, Max: 100", default: 8 } }, required: ["lat", "lon"] } },
                            { name: "get_station_precipitation", description: "Fetches precipitation data with multiple resolutions (daily, hourly, 15-min, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "period": { type: "string", description: "Data period: latest-day, latest-hour, latest-months, corrected-archive", default: "latest-day" } }, required: ["station_id"] } },
                            { name: "get_temperature_multi_resolution", description: "Fetches temperature data with multiple resolutions (hourly, daily mean/min/max, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Temperature parameter: 1=hourly, 2=daily-mean, 19=daily-min, 20=daily-max, 22=monthly", default: "1" }, "period": { type: "string", description: "Data period: latest-hour, latest-day, latest-months, corrected-archive", default: "latest-hour" } }, required: ["station_id"] } },
                            { name: "get_station_metadata", description: "Retrieves detailed metadata and available periods for a station and parameter.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code: 1=temp-hourly, 2=temp-daily-mean, 19=temp-daily-min, 20=temp-daily-max, 22=temp-monthly, 5=precip-daily, 7=precip-hourly, 14=precip-15min, 23=precip-monthly, 8=snow-depth" } }, required: ["station_id", "parameter"] } },
                            { name: "get_historical_data", description: "Fetches historical data for any parameter and period with pagination and date filtering support.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code: 1=temp-hourly, 2=temp-daily-mean, 19=temp-daily-min, 20=temp-daily-max, 22=temp-monthly, 5=precip-daily, 7=precip-hourly, 14=precip-15min, 23=precip-monthly, 8=snow-depth" }, "period": { type: "string", description: "Data period: corrected-archive, latest-months, latest-day, latest-hour" }, "limit": { type: "number", description: "Number of values per page", default: 10 }, "cursor": { type: "string", description: "Pagination cursor for next/previous page" }, "reverse": { type: "boolean", description: "Show newest data first (true) or oldest first (false)", default: true }, "fromDate": { type: "string", description: "Start date for filtering (ISO 8601 format, e.g., '2024-01-01' or '2024-01-01T12:00:00Z')" }, "toDate": { type: "string", description: "End date for filtering (ISO 8601 format, e.g., '2024-12-31' or '2024-12-31T23:59:59Z')" } }, required: ["station_id", "parameter", "period"] } },
                            { name: "list_all_temperature_stations", description: "Retrieves all SMHI stations that provide temperature data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
                            { name: "list_all_snow_depth_stations", description: "Retrieves all SMHI stations that provide snow depth data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
                            { name: "list_all_precipitation_stations", description: "Retrieves all SMHI stations that provide precipitation data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "cursor": { type: "string" } } } },
                            { name: "search_stations_by_name", description: "Search for weather stations by name using fuzzy matching within a specific parameter type.", inputSchema: { type: "object", properties: { "query": { type: "string", description: "Station name to search for" }, "parameter": { type: "string", description: "Parameter type to filter stations: 1=temperature, 5=daily-precip, 7=hourly-precip, 8=snow-depth", default: "1" }, "limit": { type: "number", description: "Maximum number of results to return", default: 10 }, "threshold": { type: "number", description: "Minimum similarity score (0.0-1.0) for fuzzy matching", default: 0.3 } }, required: ["query"] } },
                            { name: "search_stations_by_name_multi_param", description: "Search for weather stations by name across all parameter types (temperature, precipitation, snow). Useful when you don't know which parameter type a station supports.", inputSchema: { type: "object", properties: { "query": { type: "string", description: "Station name to search for" }, "limit": { type: "number", description: "Maximum number of results to return", default: 10 }, "threshold": { type: "number", description: "Minimum similarity score (0.0-1.0) for fuzzy matching", default: 0.3 } }, required: ["query"] } }
                        ]
                    }
                };
                server.send(JSON.stringify(response));
                console.log(`[${requestId}:${messageId}] Fast tools/list response sent`);
                return;
            }
            
            if (message.method === 'resources/list') {
                console.log(`[${requestId}:${messageId}] Fast path for resources/list`);
                const response = {
                    jsonrpc: "2.0",
                    id: message.id,
                    result: { resources: [] }
                };
                server.send(JSON.stringify(response));
                console.log(`[${requestId}:${messageId}] Fast resources/list response sent`);
                return;
            }
            
            if (message.method === 'prompts/list') {
                console.log(`[${requestId}:${messageId}] Fast path for prompts/list`);
                const response = {
                    jsonrpc: "2.0",
                    id: message.id,
                    result: { prompts: [] }
                };
                server.send(JSON.stringify(response));
                console.log(`[${requestId}:${messageId}] Fast prompts/list response sent`);
                return;
            }
            
            if (message.method === 'initialize') {
                console.log(`[${requestId}:${messageId}] Fast path for initialize`);
                const response = {
                    jsonrpc: "2.0",
                    id: message.id,
                    result: {
                        protocolVersion: "2025-06-18",
                        capabilities: { tools: { listChanged: true } },
                        serverInfo: { name: "smhi-mcp", version: "1.0.0" }
                    }
                };
                server.send(JSON.stringify(response));
                console.log(`[${requestId}:${messageId}] Fast initialize response sent`);
                return;
            }
            
            if (message.method === 'notifications/initialized') {
                console.log(`[${requestId}:${messageId}] WebSocket notifications/initialized received - client ready`);
                // For notifications, we may not need to send a response, but if there's an ID, send empty result
                if (message.id !== undefined) {
                    const response = {
                        jsonrpc: "2.0",
                        id: message.id,
                        result: {}
                    };
                    server.send(JSON.stringify(response));
                    console.log(`[${requestId}:${messageId}] WebSocket notifications/initialized response sent`);
                }
                return;
            }
            
            // Process the MCP request using the existing server logic
            // Use the global MCP server object (defined later in the file)
            const globalMcpServer = {
                name: "smhi-mcp",
                version: "1.0.0",
                env: env,
                get_tools() {
                    return [
                        // Snowmobile conditions tool
                        { name: "list_snowmobile_conditions", description: "Lists weather stations relevant for snowmobile conditions, organized by region and showing both temperature and snow depth monitoring capabilities across northern Sweden and mountain regions.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                        
                        // Legacy tools (deprecated but maintained for compatibility)
                        { name: "list_temperature_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined temperature monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                        { name: "list_snow_depth_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined snow depth monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
                        { name: "get_station_temperature", description: "Fetches the latest temperature reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                        { name: "get_station_snow_depth", description: "Fetches the latest snow depth reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
                        { name: "get_weather_forecast", description: "Retrieves weather forecast for the given coordinates using SMHI data with optional time filtering and limit control.", inputSchema: { type: "object", properties: { "lat": { type: "number" }, "lon": { type: "number" }, "fromDate": { type: "string", description: "Start date/time for filtering (ISO 8601 format, e.g., '2025-06-30' or '2025-06-30T12:00:00Z')" }, "toDate": { type: "string", description: "End date/time for filtering (ISO 8601 format, e.g., '2025-07-05' or '2025-07-05T23:59:59Z')" }, "limit": { type: "number", description: "Number of hourly forecast periods to return. Each period = 1 hour of weather data. Examples: 8=8 hours (~today), 24=1 day, 48=2 days, 168=1 week. Default: 8, Max: 100", default: 8 } }, required: ["lat", "lon"] } },
                        
                        // Multi-resolution precipitation tools
                        { name: "get_station_precipitation", description: "Fetches precipitation data with multiple resolutions (daily, hourly, 15-min, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "period": { type: "string", description: "Data period: latest-day, latest-hour, latest-months, corrected-archive", default: "latest-day" } }, required: ["station_id"] } },
                        
                        // Multi-resolution temperature tools
                        { name: "get_temperature_multi_resolution", description: "Fetches temperature data with multiple resolutions (hourly, daily mean/min/max, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Temperature parameter: 1=hourly, 2=daily-mean, 19=daily-min, 20=daily-max, 22=monthly", default: "1" }, "period": { type: "string", description: "Data period: latest-hour, latest-day, latest-months, corrected-archive", default: "latest-hour" } }, required: ["station_id"] } },
                        
                        // Station metadata and discovery
                        { name: "get_station_metadata", description: "Retrieves detailed metadata and available periods for a station and parameter.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code: 1=temp-hourly, 2=temp-daily-mean, 19=temp-daily-min, 20=temp-daily-max, 22=temp-monthly, 5=precip-daily, 7=precip-hourly, 14=precip-15min, 23=precip-monthly, 8=snow-depth" } }, required: ["station_id", "parameter"] } },
                        
                        // Historical data access with pagination and date filtering
                        { name: "get_historical_data", description: "Fetches historical data for any parameter and period with pagination and date filtering support.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code: 1=temp-hourly, 2=temp-daily-mean, 19=temp-daily-min, 20=temp-daily-max, 22=temp-monthly, 5=precip-daily, 7=precip-hourly, 14=precip-15min, 23=precip-monthly, 8=snow-depth" }, "period": { type: "string", description: "Data period: corrected-archive, latest-months, latest-day, latest-hour" }, "limit": { type: "number", description: "Number of values per page", default: 10 }, "cursor": { type: "string", description: "Pagination cursor for next/previous page" }, "reverse": { type: "boolean", description: "Show newest data first (true) or oldest first (false)", default: true }, "fromDate": { type: "string", description: "Start date for filtering (ISO 8601 format, e.g., '2024-01-01' or '2024-01-01T12:00:00Z')" }, "toDate": { type: "string", description: "End date for filtering (ISO 8601 format, e.g., '2024-12-31' or '2024-12-31T23:59:59Z')" } }, required: ["station_id", "parameter", "period"] } },
                        
                        // Station listing with pagination
                        { name: "list_all_temperature_stations", description: "Retrieves all SMHI stations that provide temperature data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
                        { name: "list_all_snow_depth_stations", description: "Retrieves all SMHI stations that provide snow depth data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "cursor": { type: "string" } } } },
                        { name: "list_all_precipitation_stations", description: "Retrieves all SMHI stations that provide precipitation data directly from SMHI API with pagination support.", inputSchema: { type: "object", properties: { "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "cursor": { type: "string" } } } },
                        
                        // Station search
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
                                    protocolVersion: "2025-06-18", 
                                    capabilities: { 
                                        tools: { listChanged: true } 
                                    }, 
                                    serverInfo: { 
                                        name: this.name, 
                                        version: this.version 
                                    } 
                                };
                                break;
                            case "tools/list":
                                result = { tools: this.get_tools() };
                                break;
                            case "resources/list":
                                // MCP resources endpoint - return empty resources for now
                                result = { resources: [] };
                                break;
                            case "prompts/list":
                                // MCP prompts endpoint - return empty prompts for now
                                result = { prompts: [] };
                                break;
                            case "tools/call":
                                const { name, arguments: args } = params;
                                switch (name) {
                                    // Snowmobile conditions tool
                                    case "list_snowmobile_conditions":
                                        result = { content: [await list_snowmobile_conditions()] };
                                        break;
                                        
                                    // Legacy tools (deprecated)
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
                                        result = { content: [await get_weather_forecast(args.lat, args.lon, args.fromDate, args.toDate, args.limit)] };
                                        break;
                                    
                                    // Multi-resolution tools
                                    case "get_station_precipitation":
                                        result = { content: [await get_station_precipitation(args.station_id, this.env, args.parameter, args.period)] };
                                        break;
                                    case "get_temperature_multi_resolution":
                                        result = { content: [await get_temperature_multi_resolution(args.station_id, this.env, args.parameter, args.period)] };
                                        break;
                                    case "get_station_metadata":
                                        result = { content: [await get_station_metadata(args.station_id, args.parameter)] };
                                        break;
                                    case "get_historical_data":
                                        result = { content: [await get_historical_data(args.station_id, args.parameter, args.period, args.limit, args.cursor, args.reverse, args.fromDate, args.toDate, this.env)] };
                                        break;
                                    
                                    // Station listing tools
                                    case "list_all_temperature_stations":
                                        result = { content: [await list_all_stations_for_parameter(SMHIParameter.AIR_TEMP, args.cursor)] };
                                        break;
                                    case "list_all_snow_depth_stations":
                                        result = { content: [await list_all_stations_for_parameter(SMHIParameter.SNOW_DEPTH, args.cursor)] };
                                        break;
                                    case "list_all_precipitation_stations":
                                        result = { content: [await list_all_stations_for_parameter(args.parameter || SMHIParameter.DAILY_PRECIP, args.cursor)] };
                                        break;
                                    case "search_stations_by_name":
                                        result = { content: [await search_stations_by_name(args.query, this.env, args.parameter, args.limit, args.threshold)] };
                                        break;
                                    case "search_stations_by_name_multi_param":
                                        result = { content: [await search_stations_by_name_multi_param(args.query, this.env, args.limit, args.threshold)] };
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
            
            const response = await globalMcpServer.handle_request(message);
            console.log(`[${requestId}:${messageId}] WebSocket response:`, JSON.stringify(response, null, 2));
            
            // Only send response if it's not null (notifications return null)
            if (response !== null) {
                server.send(JSON.stringify(response));
                console.log(`[${requestId}:${messageId}] WebSocket response sent`);
            } else {
                console.log(`[${requestId}:${messageId}] No response sent (notification)`);                
            }
            
        } catch (error) {
            console.log(`[${requestId}:${messageId}] WebSocket error:`, error.message);
            
            const errorResponse = {
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: `Parse error: ${error.message}` }
            };
            
            server.send(JSON.stringify(errorResponse));
        }
    });
    
    server.addEventListener('close', () => {
        console.log(`[${requestId}] WebSocket connection closed`);
    });
    
    server.addEventListener('error', (error) => {
        console.log(`[${requestId}] WebSocket error:`, error);
    });
    
    console.log(`[${requestId}] Returning WebSocket response`);
    
        return new Response(null, {
            status: 101,
            webSocket: client,
            headers: {
                'Access-Control-Allow-Origin': '*',
            }
        });
    } catch (error) {
        console.log(`[${requestId}] WebSocket error:`, error.message, error.stack);
        return new Response(`WebSocket error: ${error.message}`, { 
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

export default {
    async fetch(request, env, ctx) {
        const startTime = Date.now();
        const requestId = Math.random().toString(36).substr(2, 9);
        
        // Log all incoming requests
        console.log(`[${requestId}] === INCOMING REQUEST ===`);
        console.log(`[${requestId}] Method: ${request.method}`);
        console.log(`[${requestId}] URL: ${request.url}`);
        
        // Log all headers
        console.log(`[${requestId}] Headers:`);
        for (const [key, value] of request.headers.entries()) {
            console.log(`[${requestId}]   ${key}: ${value}`);
        }
        
        // Handle WebSocket upgrade for Claude web UI
        const upgradeHeader = request.headers.get('Upgrade');
        const connectionHeader = request.headers.get('Connection');
        const webSocketKey = request.headers.get('Sec-WebSocket-Key');
        const webSocketVersion = request.headers.get('Sec-WebSocket-Version');
        
        console.log(`[${requestId}] Upgrade header: ${upgradeHeader}`);
        console.log(`[${requestId}] Connection header: ${connectionHeader}`);
        console.log(`[${requestId}] WebSocket Key: ${webSocketKey}`);
        console.log(`[${requestId}] WebSocket Version: ${webSocketVersion}`);
        
        // Strict WebSocket detection - only upgrade if proper WebSocket headers are present
        const isWebSocketUpgrade = (
            upgradeHeader && upgradeHeader.toLowerCase().includes('websocket') &&
            connectionHeader && connectionHeader.toLowerCase().includes('upgrade') &&
            webSocketKey && webSocketVersion
        );
        
        console.log(`[${requestId}] WebSocket upgrade check: ${isWebSocketUpgrade}`);
        
        if (isWebSocketUpgrade) {
            console.log(`[${requestId}] WebSocket upgrade request detected`);
            return handleWebSocket(request, env, requestId);
        }
        
        // Handle OPTIONS preflight requests for CORS
        if (request.method === 'OPTIONS') {
            console.log(`[${requestId}] Handling OPTIONS preflight request`);
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version, User-Agent, Upgrade, Connection, Sec-WebSocket-Key, Sec-WebSocket-Version, Sec-WebSocket-Protocol',
                    'Access-Control-Expose-Headers': 'mcp-protocol-version',
                    'Access-Control-Max-Age': '86400',
                },
            });
        }
        
        // Handle SSE connections from Claude web UI - check this BEFORE generic GET
        const acceptHeader = request.headers.get('accept') || '';
        const contentType = request.headers.get('content-type') || '';
        
        // 1) Pure SSE - GET requests with SSE accept header
        if (request.method === 'GET' && acceptHeader.includes('text/event-stream')) {
            console.log(`[${requestId}] Pure SSE connection detected`);
            return handleSSE(request, env, requestId);
        }
        
        // 2) Standard HTTP/JSON-RPC - POST requests with JSON content (MCP spec compliant)
        if (request.method === 'POST' && contentType.includes('application/json')) {
            console.log(`[${requestId}] Standard HTTP JSON-RPC request detected`);
            // Process as standard MCP HTTP transport (works correctly)
            // Continue to existing HTTP handling logic below
        }
        
        // 3) WebSocket upgrade, OPTIONS, generic GET...
        // Allow GET requests for testing and potential WebSocket upgrades
        if (request.method === 'GET') {
            console.log(`[${requestId}] GET request received - might be WebSocket upgrade attempt`);
            // If this is a WebSocket upgrade attempt, handle it
            if (isWebSocketUpgrade) {
                console.log(`[${requestId}] GET WebSocket upgrade request detected`);
                return handleWebSocket(request, env, requestId);
            }
            // Otherwise return a helpful message
            return new Response(`SMHI MCP Server v1.0.0\n\nThis is an MCP (Model Context Protocol) server providing Swedish weather data.\n\nSupported protocols:\n- HTTP POST with JSON-RPC 2.0\n- WebSocket with JSON-RPC 2.0\n\nEndpoint: https://smhi-mcp.hakan-3a6.workers.dev\n\nTools available: 15 weather data tools\n\nFor Claude Code: Use HTTP POST with mcp-protocol-version header\nFor Claude Web UI: WebSocket connection supported\n\nLast updated: ${new Date().toISOString()}\nRequest ID: ${requestId}\n`, {
                headers: { 'Content-Type': 'text/plain' }
            });
        }
        
        if (request.method !== 'POST') {
            console.log(`[${requestId}] Rejecting non-POST/GET request (method: ${request.method})`);
            return new Response('Expected POST or GET', { status: 405 });
        }
        
        try {
            // Check request limits (only for non-OPTIONS requests)
            await checkRequestLimits();
            
            // Set env for R2 access
            server.env = env;
            
            const bodyText = await request.text();
            console.log(`[${requestId}] Request body: ${bodyText}`);
            
            let body;
            try {
                body = JSON.parse(bodyText);
                console.log(`[${requestId}] Parsed JSON body:`, JSON.stringify(body, null, 2));
            } catch (parseError) {
                console.log(`[${requestId}] JSON parse error:`, parseError.message);
                throw parseError;
            }
            
            // Check for MCP protocol version header
            const mcpProtocolVersion = request.headers.get('mcp-protocol-version');
            const userAgent = request.headers.get('user-agent') || '';
            const contentType = request.headers.get('content-type') || '';
            
            // Comprehensive logging
            console.log(`[${requestId}] User-Agent: ${userAgent}`);
            console.log(`[${requestId}] Content-Type: ${contentType}`);
            console.log(`[${requestId}] MCP Protocol Version: ${mcpProtocolVersion || 'MISSING'}`);
            console.log(`[${requestId}] Request method: ${body.method || 'MISSING'}`);
            console.log(`[${requestId}] Request ID: ${body.id || 'MISSING'}`);
            
            // If MCP protocol version header is missing, still process but log it
            if (!mcpProtocolVersion) {
                console.log(`[${requestId}] ⚠️  WARNING: MCP protocol version header missing, but processing request anyway for compatibility`);
            }
            
            console.log(`[${requestId}] Processing request...`);
            const response = await server.handle_request(body);
            
            const processingTime = Date.now() - startTime;
            console.log(`[${requestId}] Request processed in ${processingTime}ms`);
            console.log(`[${requestId}] Response:`, JSON.stringify(response, null, 2));
            
            // If response is null (notification), return 204 No Content
            if (response === null) {
                console.log(`[${requestId}] No response sent (notification)`);
                return new Response('', { status: 204 });
            }
            
            // Check if request is from Claude web UI and add appropriate headers
            const isClaudeWebUI = userAgent.includes('Claude') || userAgent.includes('claude');
            const responseHeaders = { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version, User-Agent, Accept',
                'Cache-Control': 'no-cache'
            };
            
            // Add MCP protocol headers for Claude web UI
            if (isClaudeWebUI) {
                responseHeaders['mcp-protocol-version'] = '2025-06-18';
            }
            
            // Add expose headers for CORS
            responseHeaders['Access-Control-Expose-Headers'] = 'mcp-protocol-version';
            
            const httpResponse = new Response(JSON.stringify(response), {
                headers: responseHeaders
            });
            
            console.log(`[${requestId}] Sending HTTP response with status 200`);
            console.log(`[${requestId}] Response headers:`);
            for (const [key, value] of httpResponse.headers.entries()) {
                console.log(`[${requestId}]   ${key}: ${value}`);
            }
            
            return httpResponse;
            
        } catch (e) {
            const processingTime = Date.now() - startTime;
            console.log(`[${requestId}] ❌ ERROR after ${processingTime}ms:`, e.message);
            console.log(`[${requestId}] Error stack:`, e.stack);
            
            if (e.message.includes('Daily request limit')) {
                const errorResponse = {
                    jsonrpc: "2.0",
                    id: null,
                    error: { code: -32603, message: e.message }
                };
                console.log(`[${requestId}] Sending 429 error response:`, JSON.stringify(errorResponse));
                return new Response(JSON.stringify(errorResponse), { 
                    status: 429, 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
            
            const errorResponse = {
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: `Parse error: ${e.message}` }
            };
            console.log(`[${requestId}] Sending 400 error response:`, JSON.stringify(errorResponse));
            return new Response(JSON.stringify(errorResponse), { 
                status: 400, 
                headers: { 'Content-Type': 'application/json' } 
            });
        }
    },
};