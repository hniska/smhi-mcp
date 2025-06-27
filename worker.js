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

const METOBS_BASE_URL = "https://opendata-download-metobs.smhi.se/api/version/1.0";
const METFCST_BASE_URL = "https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2";

const SMHIParameter = {
    // Temperature parameters
    AIR_TEMP: "1",              // Hourly temperature
    AVG_TEMP: "2",              // Daily mean temperature
    MIN_TEMP: "19",             // Daily minimum temperature
    MAX_TEMP: "20",             // Daily maximum temperature
    MONTHLY_TEMP: "22",         // Monthly mean temperature
    
    // Precipitation parameters
    DAILY_PRECIP: "5",          // Daily precipitation (06:00)
    HOURLY_PRECIP: "7",         // Hourly precipitation
    PRECIP_15MIN: "14",         // 15-minute precipitation
    MONTHLY_PRECIP: "23",       // Monthly precipitation
    
    // Snow depth
    SNOW_DEPTH: "8",            // Daily snow depth (06:00)
    
    // Legacy support
    MAX_TEMP_OLD: "27"          // Legacy max temp parameter
};

const SMHIPeriod = {
    CORRECTED_ARCHIVE: "corrected-archive",
    LATEST_MONTHS: "latest-months", 
    LATEST_DAY: "latest-day",
    LATEST_HOUR: "latest-hour"
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

async function get_station_precipitation(station_id, parameter = SMHIParameter.DAILY_PRECIP, period = SMHIPeriod.LATEST_DAY) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}/data.json`;
        const data = await makeSmhiRequest(url);
        
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

async function get_temperature_multi_resolution(station_id, parameter = SMHIParameter.AIR_TEMP, period = SMHIPeriod.LATEST_HOUR) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}/data.json`;
        const data = await makeSmhiRequest(url);
        
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
        const data = await makeSmhiRequest(url);
        
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

async function get_historical_data(station_id, parameter, period, limit = 10, cursor = null, reverse = true, fromDate = null, toDate = null) {
    try {
        // First get metadata to find CSV download URL
        const metadataUrl = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}.json`;
        let metadata;
        
        try {
            metadata = await makeSmhiRequest(metadataUrl);
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
        
        // Download and parse CSV data
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
        
        const csvText = await csvResponse.text();
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
        
        // Find the line that starts the actual data (contains "Från Datum Tid" or similar timestamp pattern)
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.includes('Från Datum Tid') || line.includes('Datum Tid (UTC)')) {
                dataStartIndex = i + 1; // Data starts after this header line
                break;
            }
        }
        
        // If we didn't find the header, try to detect data lines by pattern
        if (dataStartIndex === -1) {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                const parts = line.split(';');
                // Look for lines that start with a date pattern (YYYY-MM-DD)
                if (parts.length >= 4 && parts[0].match(/^\d{4}-\d{2}-\d{2}/)) {
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
            if (!line) continue;
            
            const parts = line.split(';');
            if (parts.length >= 4) {
                // CSV format: Från Datum Tid;Till Datum Tid;Representativt dygn;Value;Quality
                const fromDate = parts[0];
                const toDate = parts[1];
                const reprDate = parts[2];
                const value = parseFloat(parts[3]);
                const quality = parts[4];
                
                // Use the representative date as the main date
                const dateToUse = reprDate || fromDate;
                
                // Only include valid data points
                if (!isNaN(value) && dateToUse) {
                    values.push({
                        date: dateToUse,
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

// Levenshtein distance algorithm for fuzzy string matching
function levenshteinDistance(str1, str2) {
    const matrix = [];
    const len1 = str1.length;
    const len2 = str2.length;

    // Initialize matrix
    for (let i = 0; i <= len2; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len1; j++) {
        matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len2; i++) {
        for (let j = 1; j <= len1; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }

    return matrix[len2][len1];
}

// Calculate similarity score (0-1) between two strings
function calculateSimilarity(str1, str2) {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    
    const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return 1 - (distance / maxLength);
}

// Normalize Swedish characters for better matching
function normalizeSwedish(str) {
    return str.toLowerCase()
        .replace(/å/g, 'a')
        .replace(/ä/g, 'a')
        .replace(/ö/g, 'o')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function search_stations_by_name_multi_param(query, limit = 10, threshold = 0.3) {
    const parameters = [SMHIParameter.AIR_TEMP, SMHIParameter.DAILY_PRECIP, SMHIParameter.HOURLY_PRECIP, SMHIParameter.SNOW_DEPTH];
    const allResults = [];
    
    try {
        // Search across all major parameters
        for (const parameter of parameters) {
            try {
                const url = `${METOBS_BASE_URL}/parameter/${parameter}.json`;
                const data = await makeSmhiRequest(url);
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

async function search_stations_by_name(query, parameter = SMHIParameter.AIR_TEMP, limit = 10, threshold = 0.3) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}.json`;
        const data = await makeSmhiRequest(url);
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
            // Snowmobile conditions tool
            { name: "list_snowmobile_conditions", description: "Lists weather stations relevant for snowmobile conditions, organized by region and showing both temperature and snow depth monitoring capabilities across northern Sweden and mountain regions.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
            
            // Legacy tools (deprecated but maintained for compatibility)
            { name: "list_temperature_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined temperature monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
            { name: "list_snow_depth_stations", description: "[DEPRECATED] Use list_snowmobile_conditions instead. Retrieves a list of predefined snow depth monitoring stations from SMHI.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
            { name: "get_station_temperature", description: "Fetches the latest temperature reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
            { name: "get_station_snow_depth", description: "Fetches the latest snow depth reading for a specific SMHI weather station.", inputSchema: { type: "object", properties: { "station_id": { type: "string" } }, required: ["station_id"] } },
            { name: "get_weather_forecast", description: "Retrieves a daily summarized weather forecast for the given coordinates using SMHI data.", inputSchema: { type: "object", properties: { "lat": { type: "number" }, "lon": { type: "number" } }, required: ["lat", "lon"] } },
            
            // Multi-resolution precipitation tools
            { name: "get_station_precipitation", description: "Fetches precipitation data with multiple resolutions (daily, hourly, 15-min, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Precipitation parameter: 5=daily, 7=hourly, 14=15min, 23=monthly", default: "5" }, "period": { type: "string", description: "Data period: latest-day, latest-hour, latest-months, corrected-archive", default: "latest-day" } }, required: ["station_id"] } },
            
            // Multi-resolution temperature tools
            { name: "get_temperature_multi_resolution", description: "Fetches temperature data with multiple resolutions (hourly, daily mean/min/max, monthly).", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "Temperature parameter: 1=hourly, 2=daily-mean, 19=daily-min, 20=daily-max, 22=monthly", default: "1" }, "period": { type: "string", description: "Data period: latest-hour, latest-day, latest-months, corrected-archive", default: "latest-hour" } }, required: ["station_id"] } },
            
            // Station metadata and discovery
            { name: "get_station_metadata", description: "Retrieves detailed metadata and available periods for a station and parameter.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code (e.g., 1, 2, 5, 7, 8, etc.)" } }, required: ["station_id", "parameter"] } },
            
            // Historical data access with pagination and date filtering
            { name: "get_historical_data", description: "Fetches historical data for any parameter and period with pagination and date filtering support.", inputSchema: { type: "object", properties: { "station_id": { type: "string" }, "parameter": { type: "string", description: "SMHI parameter code" }, "period": { type: "string", description: "Data period: corrected-archive, latest-months, latest-day, latest-hour" }, "limit": { type: "number", description: "Number of values per page", default: 10 }, "cursor": { type: "string", description: "Pagination cursor for next/previous page" }, "reverse": { type: "boolean", description: "Show newest data first (true) or oldest first (false)", default: true }, "fromDate": { type: "string", description: "Start date for filtering (ISO 8601 format, e.g., '2024-01-01' or '2024-01-01T12:00:00Z')" }, "toDate": { type: "string", description: "End date for filtering (ISO 8601 format, e.g., '2024-12-31' or '2024-12-31T23:59:59Z')" } }, required: ["station_id", "parameter", "period"] } },
            
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
                        protocolVersion: "2024-11-05", 
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
                            result = { content: [await get_weather_forecast(args.lat, args.lon)] };
                            break;
                        
                        // Multi-resolution tools
                        case "get_station_precipitation":
                            result = { content: [await get_station_precipitation(args.station_id, args.parameter, args.period)] };
                            break;
                        case "get_temperature_multi_resolution":
                            result = { content: [await get_temperature_multi_resolution(args.station_id, args.parameter, args.period)] };
                            break;
                        case "get_station_metadata":
                            result = { content: [await get_station_metadata(args.station_id, args.parameter)] };
                            break;
                        case "get_historical_data":
                            result = { content: [await get_historical_data(args.station_id, args.parameter, args.period, args.limit, args.cursor, args.reverse, args.fromDate, args.toDate)] };
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
                            result = { content: [await search_stations_by_name(args.query, args.parameter, args.limit, args.threshold)] };
                            break;
                        case "search_stations_by_name_multi_param":
                            result = { content: [await search_stations_by_name_multi_param(args.query, args.limit, args.threshold)] };
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