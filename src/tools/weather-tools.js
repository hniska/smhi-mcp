// Weather tool implementations for SMHI MCP server
import { SMHIParameter, SMHIPeriod, CACHE_TTL, METOBS_BASE_URL } from '../config/constants.js';
import { getCachedResponse, setCachedResponse, getCachedCSV, setCachedCSV } from '../utils/cache.js';
import { levenshteinDistance, calculateSimilarity, normalizeSwedish } from '../utils/string.js';
import { makeSmhiRequest } from '../api/smhi.js';
import { snowmobileConditionsStations, temperatureStations, snowDepthStations } from '../data/stations.js';

export async function list_snowmobile_conditions() {
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
export async function list_temperature_stations() {
    return {
        type: "text",
        text: `⚠️  DEPRECATED: Use list_snowmobile_conditions instead.\n\nAvailable temperature stations:\n${JSON.stringify(temperatureStations, null, 2)}`
    };
}

export async function list_snow_depth_stations() {
    return {
        type: "text",
        text: `⚠️  DEPRECATED: Use list_snowmobile_conditions instead.\n\nAvailable snow depth stations:\n${JSON.stringify(snowDepthStations, null, 2)}`
    };
}

export async function get_station_precipitation(station_id, env, parameter = SMHIParameter.DAILY_PRECIP, period = SMHIPeriod.LATEST_DAY) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}/data.json`;
        const cacheKey = `precipitation-${station_id}-${parameter}-${period}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.precipitation);
        
        if (!data.value || data.value.length === 0) {
            return {
                type: "text",
                text: `No precipitation data available for station ${station_id} (parameter ${parameter}, period ${period})`
            };
        }
        
        const latestValue = data.value[data.value.length - 1];
        
        // Map parameter codes to descriptions
        const parameterDescriptions = {
            [SMHIParameter.DAILY_PRECIP]: "daily precipitation",
            [SMHIParameter.HOURLY_PRECIP]: "hourly precipitation", 
            [SMHIParameter.PRECIPITATION_15MIN]: "15-minute precipitation",
            [SMHIParameter.MONTHLY_PRECIP]: "monthly precipitation"
        };
        
        const description = parameterDescriptions[parameter] || `parameter ${parameter}`;
        
        return {
            type: "text",
            text: `Station ${data.station.name} (${station_id}): ${latestValue.value}mm ${description} at ${latestValue.date}`
        };
    } catch (error) {
        return {
            type: "text",
            text: `Error fetching precipitation data for station ${station_id}: ${error.message}`
        };
    }
}

export async function get_temperature_multi_resolution(station_id, env, parameter = SMHIParameter.AIR_TEMP, period = SMHIPeriod.LATEST_HOUR) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}/data.json`;
        const cacheKey = `temp-multi-${station_id}-${parameter}-${period}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.temperature);
        
        if (!data.value || data.value.length === 0) {
            return {
                type: "text",
                text: `No temperature data available for station ${station_id} (parameter ${parameter}, period ${period})`
            };
        }
        
        const latestValue = data.value[data.value.length - 1];
        
        // Map parameter codes to descriptions
        const parameterDescriptions = {
            [SMHIParameter.AIR_TEMP]: "hourly temperature",
            [SMHIParameter.DAILY_TEMP_MEAN]: "daily mean temperature",
            [SMHIParameter.DAILY_TEMP_MIN]: "daily minimum temperature", 
            [SMHIParameter.DAILY_TEMP_MAX]: "daily maximum temperature",
            [SMHIParameter.MONTHLY_TEMP]: "monthly temperature"
        };
        
        const description = parameterDescriptions[parameter] || `parameter ${parameter}`;
        
        return {
            type: "text",
            text: `Station ${data.station.name} (${station_id}): ${latestValue.value}°C ${description} at ${latestValue.date}`
        };
    } catch (error) {
        return {
            type: "text",
            text: `Error fetching temperature data for station ${station_id}: ${error.message}`
        };
    }
}

export async function get_station_metadata(station_id, parameter) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}.json`;
        const cacheKey = `metadata-${station_id}-${parameter}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.metadata);
        
        const periods = data.period?.map(p => ({
            key: p.key,
            from: p.from,
            to: p.to,
            summary: p.summary
        })) || [];
        
        return {
            type: "text",
            text: `📊 Station Metadata\n\n` +
                   `🏷️  ID: ${data.id}\n` +
                   `📍 Name: ${data.name}\n` +
                   `🔢 Parameter: ${parameter}\n` +
                   `🌍 Position: ${data.latitude}°N, ${data.longitude}°E\n` +
                   `📏 Height: ${data.height}m\n` +
                   `🏢 Owner: ${data.owner}\n\n` +
                   `📅 Available Periods:\n` +
                   periods.map(p => `  • ${p.key}: ${p.from} to ${p.to} (${p.summary})`).join('\n')
        };
    } catch (error) {
        return {
            type: "text",
            text: `Error fetching metadata for station ${station_id}, parameter ${parameter}: ${error.message}`
        };
    }
}

export async function get_historical_data(station_id, parameter, period, limit = 10, cursor = null, reverse = true, fromDate = null, toDate = null, env = null) {
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

// Station listing functions with pagination
export async function list_all_stations_for_parameter(parameter, cursor) {
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

export async function list_all_temperature_stations(env, cursor) {
    return await list_all_stations_for_parameter(SMHIParameter.AIR_TEMP, cursor);
}

export async function list_all_snow_depth_stations(env, cursor) {
    return await list_all_stations_for_parameter(SMHIParameter.SNOW_DEPTH, cursor);
}

export async function list_all_precipitation_stations(env, parameter = SMHIParameter.DAILY_PRECIP, cursor) {
    return await list_all_stations_for_parameter(parameter, cursor);
}

export async function search_stations_by_name_multi_param(query, env, limit = 10, threshold = 0.3, active_only = true) {
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
                        // Filter by active status if requested
                        if (active_only && !station.active) {
                            continue;
                        }
                        
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

export async function search_stations_by_name(query, env, parameter = SMHIParameter.AIR_TEMP, limit = 10, threshold = 0.3, active_only = true) {
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
                // Filter by active status if requested
                if (active_only && !station.active) {
                    continue;
                }
                
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
            text: `${parameterName} station search results for "${query}":\n` +
                   `Found ${limitedResults.length} of ${results.length} matches (threshold: ${threshold})\n\n` +
                   resultsText
        };

    } catch (e) {
        return {
            type: "text",
            text: `Error: Failed to search stations by name: ${e.message}`
        };
    }
}