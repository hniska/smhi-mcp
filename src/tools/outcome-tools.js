// Outcome-oriented tools for SMHI MCP server
// These tools orchestrate multiple API calls to provide complete answers

import { SMHIParameter, SMHIPeriod, METOBS_BASE_URL, METFCST_BASE_URL, CACHE_TTL } from '../config/constants.js';
import {
    DataType, TimeRange, Region,
    DATA_TYPE_TO_PARAMETER, TIME_RANGE_TO_PERIOD, REGION_DISPLAY_NAMES,
    isValidDataType, isValidTimeRange, isValidRegion,
    getParameterFromDataType, getPeriodFromTimeRange
} from '../config/enums.js';
import {
    buildResponse, buildErrorResponse, createNextAction,
    ErrorCode, generateTraceId,
    formatTemperature, formatSnowDepth, formatPrecipitation, formatWindSpeed,
    formatDate, formatCoordinates,
    getTemperatureWarning, getSnowDepthWarning
} from '../utils/response.js';
import { makeSmhiRequest, getWeatherDescription } from '../api/smhi.js';
import { searchStationsMultiParameter } from '../utils/search.js';
import { fetchAllStationsForParameter } from '../utils/stations.js';
import { haversineDistance } from '../utils/geo.js';
import { snowmobileConditionsStations } from '../data/stations.js';
import { getParameterName, getParameterUnit } from '../utils/parameters.js';

// Swedish cities with approximate coordinates for location search
const SWEDISH_LOCATIONS = {
    'stockholm': { lat: 59.3293, lon: 18.0686 },
    'göteborg': { lat: 57.7089, lon: 11.9746 },
    'gothenburg': { lat: 57.7089, lon: 11.9746 },
    'malmö': { lat: 55.6050, lon: 13.0038 },
    'malmo': { lat: 55.6050, lon: 13.0038 },
    'uppsala': { lat: 59.8586, lon: 17.6389 },
    'linköping': { lat: 58.4109, lon: 15.6216 },
    'linkoping': { lat: 58.4109, lon: 15.6216 },
    'örebro': { lat: 59.2753, lon: 15.2134 },
    'orebro': { lat: 59.2753, lon: 15.2134 },
    'västerås': { lat: 59.6162, lon: 16.5528 },
    'vasteras': { lat: 59.6162, lon: 16.5528 },
    'norrköping': { lat: 58.5942, lon: 16.1826 },
    'norrkoping': { lat: 58.5942, lon: 16.1826 },
    'helsingborg': { lat: 56.0465, lon: 12.6945 },
    'jönköping': { lat: 57.7826, lon: 14.1618 },
    'jonkoping': { lat: 57.7826, lon: 14.1618 },
    'umeå': { lat: 63.8258, lon: 20.2630 },
    'umea': { lat: 63.8258, lon: 20.2630 },
    'lund': { lat: 55.7047, lon: 13.1910 },
    'borås': { lat: 57.7210, lon: 12.9401 },
    'boras': { lat: 57.7210, lon: 12.9401 },
    'sundsvall': { lat: 62.3908, lon: 17.3069 },
    'gävle': { lat: 60.6749, lon: 17.1413 },
    'gavle': { lat: 60.6749, lon: 17.1413 },
    'luleå': { lat: 65.5848, lon: 22.1547 },
    'lulea': { lat: 65.5848, lon: 22.1547 },
    'kiruna': { lat: 67.8558, lon: 20.2253 },
    'karlstad': { lat: 59.3793, lon: 13.5036 },
    'växjö': { lat: 56.8777, lon: 14.8091 },
    'vaxjo': { lat: 56.8777, lon: 14.8091 },
    'halmstad': { lat: 56.6745, lon: 12.8574 },
    'kalmar': { lat: 56.6616, lon: 16.3616 },
    'trollhättan': { lat: 58.2838, lon: 12.2886 },
    'trollhattan': { lat: 58.2838, lon: 12.2886 },
    'östersund': { lat: 63.1792, lon: 14.6357 },
    'ostersund': { lat: 63.1792, lon: 14.6357 },
    'eskilstuna': { lat: 59.3666, lon: 16.5077 },
    'falun': { lat: 60.6065, lon: 15.6355 },
    'visby': { lat: 57.6348, lon: 18.2948 },
    'skellefteå': { lat: 64.7507, lon: 20.9528 },
    'skelleftea': { lat: 64.7507, lon: 20.9528 },
    'tärnaby': { lat: 65.7261, lon: 15.3119 },
    'tarnaby': { lat: 65.7261, lon: 15.3119 },
    'hemavan': { lat: 65.8164, lon: 15.0853 },
    'riksgränsen': { lat: 68.4261, lon: 18.1261 },
    'riksgransen': { lat: 68.4261, lon: 18.1261 },
    'abisko': { lat: 68.3497, lon: 18.8303 },
    'arvidsjaur': { lat: 65.5917, lon: 19.1742 },
    'jokkmokk': { lat: 66.6064, lon: 19.8256 },
    'gällivare': { lat: 67.1337, lon: 20.6508 },
    'gallivare': { lat: 67.1337, lon: 20.6508 },
    'storlien': { lat: 63.3147, lon: 12.1017 },
    'åre': { lat: 63.3986, lon: 13.0811 },
    'are': { lat: 63.3986, lon: 13.0811 },
    'sälen': { lat: 61.1581, lon: 13.2611 },
    'salen': { lat: 61.1581, lon: 13.2611 }
};

/**
 * Resolve a location name to coordinates
 */
function resolveLocation(location) {
    if (!location) return null;
    const normalized = location.toLowerCase().trim();
    return SWEDISH_LOCATIONS[normalized] || null;
}

/**
 * Find nearest temperature station to coordinates
 */
async function findNearestStation(lat, lon, parameter = SMHIParameter.AIR_TEMP) {
    const stations = await fetchAllStationsForParameter(parameter);

    let nearest = null;
    let minDistance = Infinity;

    for (const station of stations) {
        if (!station.active || !station.latitude || !station.longitude) continue;

        const distance = haversineDistance(lat, lon, station.latitude, station.longitude);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = { ...station, distance };
        }
    }

    return nearest;
}

/**
 * Fetch current temperature for a station
 */
async function fetchStationTemperature(stationId) {
    try {
        // Try latest-hour first
        let url = `${METOBS_BASE_URL}/parameter/${SMHIParameter.AIR_TEMP}/station/${stationId}/period/latest-hour/data.json`;
        let data = await makeSmhiRequest(url, `temp-${stationId}-latest-hour`, CACHE_TTL.current);

        if (!data.value || data.value.length === 0) {
            // Fall back to latest-day
            url = `${METOBS_BASE_URL}/parameter/${SMHIParameter.AIR_TEMP}/station/${stationId}/period/latest-day/data.json`;
            data = await makeSmhiRequest(url, `temp-${stationId}-latest-day`, CACHE_TTL.current);
        }

        if (!data.value || data.value.length === 0) {
            return null;
        }

        const latest = data.value[data.value.length - 1];
        return {
            value: latest.value,
            timestamp: latest.date,
            stationName: data.station?.name || 'Unknown'
        };
    } catch (e) {
        return null;
    }
}

/**
 * Fetch current snow depth for a station
 */
async function fetchStationSnowDepth(stationId) {
    try {
        let url = `${METOBS_BASE_URL}/parameter/${SMHIParameter.SNOW_DEPTH}/station/${stationId}/period/latest-day/data.json`;
        let data = await makeSmhiRequest(url, `snow-${stationId}-latest-day`, CACHE_TTL.current);

        if (!data.value || data.value.length === 0) {
            url = `${METOBS_BASE_URL}/parameter/${SMHIParameter.SNOW_DEPTH}/station/${stationId}/period/latest-months/data.json`;
            data = await makeSmhiRequest(url, `snow-${stationId}-latest-months`, CACHE_TTL.current);
        }

        if (!data.value || data.value.length === 0) {
            return null;
        }

        const latest = data.value[data.value.length - 1];
        return {
            value: latest.value,
            timestamp: latest.date,
            stationName: data.station?.name || 'Unknown'
        };
    } catch (e) {
        return null;
    }
}

/**
 * Fetch weather forecast for coordinates
 */
async function fetchForecast(lat, lon, hours = 24) {
    try {
        const url = `${METFCST_BASE_URL}/geotype/point/lon/${lon}/lat/${lat}/data.json`;
        const data = await makeSmhiRequest(url, `forecast-${lat}-${lon}`, CACHE_TTL.forecast);

        const limited = data.timeSeries.slice(0, hours);

        return limited.map(entry => {
            const params = Object.fromEntries(entry.parameters.map(p => [p.name, p.values[0]]));
            return {
                time: entry.validTime,
                temperature: params.t || null,
                precipitation: params.pmean || 0,
                windSpeed: params.ws || 0,
                windDirection: params.wd || null,
                cloudCover: params.tcc_mean || null,
                weatherSymbol: params.Wsymb2 || 0,
                weatherDescription: getWeatherDescription(params.Wsymb2 || 0)
            };
        });
    } catch (e) {
        return null;
    }
}

// ============================================================================
// TOOL: check_weather
// ============================================================================

/**
 * Get current weather and 24h forecast for any location in Sweden
 * Orchestrates: station search + temperature fetch + forecast fetch
 */
export async function check_weather(args) {
    const { location, lat, lon } = args;
    const traceId = generateTraceId();

    let targetLat, targetLon, locationName;

    // Resolve coordinates
    if (lat !== undefined && lon !== undefined) {
        targetLat = lat;
        targetLon = lon;
        locationName = `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`;
    } else if (location) {
        const resolved = resolveLocation(location);
        if (resolved) {
            targetLat = resolved.lat;
            targetLon = resolved.lon;
            locationName = location;
        } else {
            // Try to find a station with this name
            const searchResult = await searchStationsMultiParameter(location, [SMHIParameter.AIR_TEMP], 1, 0.4, true);

            // Parse the search result to extract coordinates
            if (searchResult.text && !searchResult.text.includes('No stations matching')) {
                // Search found something, but we need coordinates
                // For now, return an error suggesting coordinates
                return buildErrorResponse({
                    code: ErrorCode.LOCATION_NOT_FOUND,
                    message: `Could not find coordinates for "${location}". Try using lat/lon coordinates or a major city name.`,
                    summary: `Location "${location}" not found`,
                    nextActions: [
                        createNextAction('find_stations', { query: location }, `Search for stations named "${location}"`),
                        createNextAction('check_weather', { location: 'Stockholm' }, 'Try a major city like Stockholm')
                    ],
                    traceId
                });
            }

            return buildErrorResponse({
                code: ErrorCode.LOCATION_NOT_FOUND,
                message: `Unknown location "${location}". Supported locations include major Swedish cities and ski resorts.`,
                summary: `Location "${location}" not found`,
                nextActions: [
                    createNextAction('find_stations', { query: location }, `Search for weather stations near "${location}"`),
                    createNextAction('check_weather', { lat: 59.33, lon: 18.07 }, 'Use coordinates instead')
                ],
                traceId
            });
        }
    } else {
        return buildErrorResponse({
            code: ErrorCode.INVALID_PARAMETER,
            message: 'Either location name or lat/lon coordinates are required',
            summary: 'Missing location parameter',
            nextActions: [
                createNextAction('check_weather', { location: 'Stockholm' }, 'Check weather in Stockholm'),
                createNextAction('check_weather', { lat: 59.33, lon: 18.07 }, 'Use coordinates')
            ],
            traceId
        });
    }

    // Find nearest temperature station
    const nearestStation = await findNearestStation(targetLat, targetLon, SMHIParameter.AIR_TEMP);

    if (!nearestStation) {
        return buildErrorResponse({
            code: ErrorCode.NO_STATIONS_IN_RANGE,
            message: `No weather stations found near ${locationName}`,
            summary: `No stations near ${locationName}`,
            nextActions: [
                createNextAction('find_stations', { lat: targetLat, lon: targetLon, radius_km: 100 }, 'Search wider area for stations')
            ],
            traceId
        });
    }

    // Fetch current temperature and forecast in parallel
    const [currentTemp, forecast] = await Promise.all([
        fetchStationTemperature(nearestStation.id),
        fetchForecast(targetLat, targetLon, 24)
    ]);

    const warnings = [];

    // Check for temperature warnings
    if (currentTemp) {
        const tempWarning = getTemperatureWarning(currentTemp.value);
        if (tempWarning) warnings.push(tempWarning);
    }

    // Build summary
    let summary = `${locationName}: `;
    if (currentTemp) {
        summary += `${formatTemperature(currentTemp.value)}`;
    } else {
        summary += 'Temperature unavailable';
    }

    if (forecast && forecast.length > 0) {
        const temps = forecast.map(f => f.temperature).filter(t => t !== null);
        if (temps.length > 0) {
            const minTemp = Math.min(...temps);
            const maxTemp = Math.max(...temps);
            summary += `. Next 24h: ${formatTemperature(minTemp)} to ${formatTemperature(maxTemp)}`;
        }
        // Add current weather description
        if (forecast[0].weatherDescription) {
            summary += `, ${forecast[0].weatherDescription.toLowerCase()}`;
        }
    }

    return buildResponse({
        summary,
        data: {
            location: {
                name: locationName,
                latitude: targetLat,
                longitude: targetLon
            },
            current: currentTemp ? {
                temperature: currentTemp.value,
                station_id: nearestStation.id,
                station_name: nearestStation.name,
                station_distance_km: nearestStation.distance.toFixed(1),
                measured_at: currentTemp.timestamp
            } : null,
            forecast: forecast || []
        },
        nextActions: [
            createNextAction('get_weather_history', { station_id: nearestStation.id, data_type: 'temperature', time_range: 'today' }, 'See temperature trends'),
            createNextAction('get_snowmobile_conditions', { region: 'all' }, 'Check snowmobile conditions')
        ],
        warnings,
        traceId
    });
}

// ============================================================================
// TOOL: get_snowmobile_conditions
// ============================================================================

/**
 * Get combined temperature and snow conditions for snowmobiling
 * Orchestrates: multi-station temperature + snow depth fetches in parallel
 */
export async function get_snowmobile_conditions(args) {
    const { region = 'all' } = args;
    const traceId = generateTraceId();

    // Validate region
    if (!isValidRegion(region)) {
        return buildErrorResponse({
            code: ErrorCode.INVALID_PARAMETER,
            message: `Invalid region "${region}". Valid regions: arctic_mountain, mountain, northern_sweden, coastal, all`,
            summary: `Invalid region: ${region}`,
            nextActions: [
                createNextAction('list_regions', {}, 'See available regions'),
                createNextAction('get_snowmobile_conditions', { region: 'all' }, 'Check all regions')
            ],
            traceId
        });
    }

    // Filter stations by region
    const targetRegion = region === 'all' ? null : REGION_DISPLAY_NAMES[region];
    const stationEntries = Object.entries(snowmobileConditionsStations)
        .filter(([id, info]) => !targetRegion || info.region === targetRegion);

    if (stationEntries.length === 0) {
        return buildErrorResponse({
            code: ErrorCode.NO_DATA_AVAILABLE,
            message: `No monitoring stations in region "${region}"`,
            summary: `No stations in ${REGION_DISPLAY_NAMES[region] || region}`,
            nextActions: [
                createNextAction('list_regions', {}, 'See available regions'),
                createNextAction('get_snowmobile_conditions', { region: 'all' }, 'Check all regions')
            ],
            traceId
        });
    }

    // Fetch data for all stations in parallel
    const fetchPromises = stationEntries.map(async ([id, info]) => {
        const result = {
            station_id: id,
            name: info.name,
            region: info.region,
            temperature: null,
            snow_depth: null
        };

        const promises = [];

        if (info.hasTemperature) {
            promises.push(
                fetchStationTemperature(id).then(data => {
                    if (data) result.temperature = { value: data.value, measured_at: data.timestamp };
                })
            );
        }

        if (info.hasSnowDepth) {
            promises.push(
                fetchStationSnowDepth(id).then(data => {
                    if (data) result.snow_depth = { value: data.value, measured_at: data.timestamp };
                })
            );
        }

        await Promise.all(promises);
        return result;
    });

    const stationData = await Promise.all(fetchPromises);

    // Group by region
    const byRegion = {};
    for (const station of stationData) {
        if (!byRegion[station.region]) {
            byRegion[station.region] = [];
        }
        byRegion[station.region].push(station);
    }

    // Generate warnings
    const warnings = [];
    const temps = stationData.filter(s => s.temperature !== null && s.temperature.value !== null).map(s => parseFloat(s.temperature.value));
    const snowDepths = stationData.filter(s => s.snow_depth !== null && s.snow_depth.value !== null).map(s => parseFloat(s.snow_depth.value));

    if (temps.length > 0) {
        const minTemp = Math.min(...temps);
        const tempWarning = getTemperatureWarning(minTemp);
        if (tempWarning) warnings.push(tempWarning);
    }

    if (snowDepths.length > 0) {
        const minSnow = Math.min(...snowDepths);
        const snowWarning = getSnowDepthWarning(minSnow);
        if (snowWarning) warnings.push(snowWarning);
    }

    // Build summary
    const tempRange = temps.length > 0 ? `${Math.min(...temps)}°C to ${Math.max(...temps)}°C` : 'N/A';
    const snowRange = snowDepths.length > 0 ? `${Math.min(...snowDepths)}m to ${Math.max(...snowDepths)}m` : 'N/A';
    const regionLabel = region === 'all' ? 'All regions' : REGION_DISPLAY_NAMES[region];

    const summary = `${regionLabel}: Temperature ${tempRange}, Snow depth ${snowRange}. ${stationData.length} stations reporting.`;

    return buildResponse({
        summary,
        data: {
            region: region,
            region_display: regionLabel,
            stations: stationData,
            by_region: byRegion,
            statistics: {
                total_stations: stationData.length,
                stations_with_temperature: stationData.filter(s => s.temperature !== null).length,
                stations_with_snow: stationData.filter(s => s.snow_depth !== null).length,
                temperature_range: temps.length > 0 ? { min: Math.min(...temps), max: Math.max(...temps) } : null,
                snow_depth_range: snowDepths.length > 0 ? { min: Math.min(...snowDepths), max: Math.max(...snowDepths) } : null
            }
        },
        nextActions: [
            createNextAction('check_weather', { location: 'Hemavan' }, 'Get detailed forecast for Hemavan'),
            createNextAction('get_weather_history', { station_id: '159770', data_type: 'snow_depth', time_range: 'this_month' }, 'See snow depth trends')
        ],
        warnings,
        traceId
    });
}

// ============================================================================
// TOOL: find_stations
// ============================================================================

/**
 * Unified station search by name, coordinates, or data type
 */
export async function find_stations(args) {
    const { query, lat, lon, data_type = 'temperature', radius_km = 50, limit = 10, active_only = true } = args;
    const traceId = generateTraceId();

    // Determine search type based on provided arguments
    const isCoordinateSearch = lat !== undefined && lon !== undefined;
    const isNameSearch = query !== undefined && query !== null;

    if (!isCoordinateSearch && !isNameSearch) {
        return buildErrorResponse({
            code: ErrorCode.INVALID_PARAMETER,
            message: 'Either query (station name) or lat/lon coordinates are required',
            summary: 'Missing search parameters',
            nextActions: [
                createNextAction('find_stations', { query: 'Stockholm' }, 'Search by name'),
                createNextAction('find_stations', { lat: 59.33, lon: 18.07 }, 'Search by coordinates')
            ],
            traceId
        });
    }

    // Validate data type
    if (!isValidDataType(data_type)) {
        return buildErrorResponse({
            code: ErrorCode.INVALID_PARAMETER,
            message: `Invalid data_type "${data_type}". Valid types: temperature, precipitation, snow_depth`,
            summary: `Invalid data type: ${data_type}`,
            nextActions: [
                createNextAction('find_stations', { ...args, data_type: 'temperature' }, 'Search temperature stations'),
                createNextAction('find_stations', { ...args, data_type: 'snow_depth' }, 'Search snow depth stations')
            ],
            traceId
        });
    }

    const parameter = getParameterFromDataType(data_type);
    const dataTypeName = data_type.replace('_', ' ');

    if (isCoordinateSearch) {
        // Coordinate-based search
        const stations = await fetchAllStationsForParameter(parameter);

        const nearbyStations = [];
        for (const station of stations) {
            if (active_only && !station.active) continue;
            if (!station.latitude || !station.longitude) continue;

            const distance = haversineDistance(lat, lon, station.latitude, station.longitude);
            if (distance <= radius_km) {
                nearbyStations.push({
                    id: String(station.id),
                    name: station.name,
                    latitude: station.latitude,
                    longitude: station.longitude,
                    height: station.height,
                    distance_km: parseFloat(distance.toFixed(1)),
                    active: station.active,
                    data_type: data_type
                });
            }
        }

        nearbyStations.sort((a, b) => a.distance_km - b.distance_km);
        const results = nearbyStations.slice(0, limit);

        if (results.length === 0) {
            return buildErrorResponse({
                code: ErrorCode.NO_STATIONS_IN_RANGE,
                message: `No ${dataTypeName} stations found within ${radius_km}km of (${lat}, ${lon})`,
                summary: `No stations within ${radius_km}km`,
                nextActions: [
                    createNextAction('find_stations', { lat, lon, radius_km: radius_km * 2, data_type }, `Search wider radius (${radius_km * 2}km)`),
                    createNextAction('find_stations', { lat, lon, data_type: 'temperature' }, 'Try temperature stations')
                ],
                traceId
            });
        }

        const summary = `Found ${results.length} ${dataTypeName} station(s) within ${radius_km}km of (${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E). Nearest: ${results[0].name} (${results[0].distance_km}km)`;

        return buildResponse({
            summary,
            data: {
                search_type: 'coordinates',
                center: { latitude: lat, longitude: lon },
                radius_km,
                data_type,
                results
            },
            nextActions: results.length > 0 ? [
                createNextAction('get_station_info', { station_id: results[0].id }, `Get details for ${results[0].name}`),
                createNextAction('check_weather', { lat, lon }, 'Check weather at these coordinates')
            ] : [],
            traceId
        });
    } else {
        // Name-based search - search across all parameter types
        const parameters = [SMHIParameter.AIR_TEMP, SMHIParameter.DAILY_PRECIP, SMHIParameter.SNOW_DEPTH];
        const allResults = [];

        for (const param of parameters) {
            try {
                const url = `${METOBS_BASE_URL}/parameter/${param}.json`;
                const data = await makeSmhiRequest(url, `all-stations-${param}`, CACHE_TTL.metadata);

                if (data.station) {
                    const paramName = getParameterName(param);
                    const normalizedQuery = query.toLowerCase();

                    for (const station of data.station) {
                        if (active_only && !station.active) continue;

                        const normalizedName = station.name.toLowerCase();
                        const isMatch = normalizedName.includes(normalizedQuery);

                        if (isMatch) {
                            allResults.push({
                                id: String(station.id),
                                name: station.name,
                                latitude: station.latitude,
                                longitude: station.longitude,
                                height: station.height,
                                active: station.active,
                                data_type: param === SMHIParameter.AIR_TEMP ? 'temperature' :
                                           param === SMHIParameter.DAILY_PRECIP ? 'precipitation' : 'snow_depth',
                                data_type_display: paramName
                            });
                        }
                    }
                }
            } catch (e) {
                // Continue with other parameters
            }
        }

        // Deduplicate by station ID + data type, prefer exact matches
        const seen = new Set();
        const uniqueResults = allResults.filter(station => {
            const key = `${station.id}-${station.data_type}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, limit);

        if (uniqueResults.length === 0) {
            return buildErrorResponse({
                code: ErrorCode.STATION_NOT_FOUND,
                message: `No stations matching "${query}" found`,
                summary: `No matches for "${query}"`,
                nextActions: [
                    createNextAction('find_stations', { query: query.slice(0, 3) }, 'Try partial name'),
                    createNextAction('list_regions', {}, 'Browse monitoring regions')
                ],
                traceId
            });
        }

        const summary = `Found ${uniqueResults.length} station(s) matching "${query}"`;

        return buildResponse({
            summary,
            data: {
                search_type: 'name',
                query,
                results: uniqueResults
            },
            nextActions: uniqueResults.length > 0 ? [
                createNextAction('get_station_info', { station_id: uniqueResults[0].id }, `Get details for ${uniqueResults[0].name}`),
                createNextAction('check_weather', { lat: uniqueResults[0].latitude, lon: uniqueResults[0].longitude }, `Check weather at ${uniqueResults[0].name}`)
            ] : [],
            traceId
        });
    }
}

// ============================================================================
// TOOL: get_weather_history
// ============================================================================

/**
 * Retrieve historical weather data with human-readable enums
 */
export async function get_weather_history(args) {
    const { station_id, data_type, time_range, from_date, to_date, limit = 20, cursor } = args;
    const traceId = generateTraceId();

    // Validate required parameters
    if (!station_id) {
        return buildErrorResponse({
            code: ErrorCode.INVALID_PARAMETER,
            message: 'station_id is required',
            summary: 'Missing station_id',
            nextActions: [
                createNextAction('find_stations', { query: 'Stockholm' }, 'Find a station first')
            ],
            traceId
        });
    }

    if (!isValidDataType(data_type)) {
        return buildErrorResponse({
            code: ErrorCode.INVALID_PARAMETER,
            message: `Invalid data_type "${data_type}". Valid types: temperature, precipitation, snow_depth`,
            summary: `Invalid data type: ${data_type}`,
            nextActions: [
                createNextAction('get_weather_history', { ...args, data_type: 'temperature' }, 'Get temperature history'),
                createNextAction('get_weather_history', { ...args, data_type: 'snow_depth' }, 'Get snow depth history')
            ],
            traceId
        });
    }

    if (!isValidTimeRange(time_range)) {
        return buildErrorResponse({
            code: ErrorCode.INVALID_PARAMETER,
            message: `Invalid time_range "${time_range}". Valid ranges: current, today, this_month, historical`,
            summary: `Invalid time range: ${time_range}`,
            nextActions: [
                createNextAction('get_weather_history', { ...args, time_range: 'today' }, 'Get today\'s data'),
                createNextAction('get_weather_history', { ...args, time_range: 'this_month' }, 'Get this month\'s data')
            ],
            traceId
        });
    }

    const parameter = getParameterFromDataType(data_type);
    const period = getPeriodFromTimeRange(time_range);
    const parameterName = getParameterName(parameter);
    const unit = getParameterUnit(parameter);

    try {
        // Fetch metadata first to validate station and get CSV URL
        const metadataUrl = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}.json`;
        let metadata;

        try {
            metadata = await makeSmhiRequest(metadataUrl, `hist-meta-${station_id}-${parameter}-${period}`, CACHE_TTL.metadata);
        } catch (e) {
            // Try to get station info to provide better error
            try {
                const stationUrl = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}.json`;
                const stationInfo = await makeSmhiRequest(stationUrl);
                const availablePeriods = stationInfo.period?.map(p => p.key) || [];

                return buildErrorResponse({
                    code: ErrorCode.NO_DATA_AVAILABLE,
                    message: `No ${time_range} data for station ${station_id}. Available periods: ${availablePeriods.join(', ')}`,
                    summary: `No ${time_range} data available`,
                    nextActions: availablePeriods.map(p => {
                        const tr = Object.entries(TIME_RANGE_TO_PERIOD).find(([k, v]) => v === p)?.[0] || p;
                        return createNextAction('get_weather_history', { station_id, data_type, time_range: tr }, `Try ${tr}`);
                    }).slice(0, 3),
                    traceId
                });
            } catch (stationError) {
                return buildErrorResponse({
                    code: ErrorCode.STATION_NOT_FOUND,
                    message: `Station ${station_id} does not have ${data_type} data`,
                    summary: `Station ${station_id} not found for ${data_type}`,
                    nextActions: [
                        createNextAction('find_stations', { query: station_id }, 'Search for this station'),
                        createNextAction('get_station_info', { station_id }, 'Get station details')
                    ],
                    traceId
                });
            }
        }

        // Get JSON data URL
        const dataSection = metadata.data?.[0];
        const jsonLink = dataSection?.link?.find(link =>
            link.type === 'application/json' && link.href?.includes('data.json')
        );

        if (!jsonLink) {
            return buildErrorResponse({
                code: ErrorCode.NO_DATA_AVAILABLE,
                message: `No downloadable data for station ${station_id}, ${data_type}, ${time_range}`,
                summary: 'Data not available',
                traceId
            });
        }

        // Fetch the actual data
        const dataResponse = await makeSmhiRequest(jsonLink.href, `hist-data-${station_id}-${parameter}-${period}`, CACHE_TTL.current);

        if (!dataResponse.value || dataResponse.value.length === 0) {
            return buildErrorResponse({
                code: ErrorCode.NO_DATA_AVAILABLE,
                message: `No data values for station ${station_id}`,
                summary: 'No data values',
                traceId
            });
        }

        let values = dataResponse.value;

        // Apply date filtering
        if (from_date || to_date) {
            const fromTs = from_date ? new Date(from_date).getTime() : 0;
            const toTs = to_date ? new Date(to_date).getTime() : Infinity;

            values = values.filter(v => {
                const ts = new Date(v.date).getTime();
                return ts >= fromTs && ts <= toTs;
            });
        }

        // Apply pagination
        let startIndex = 0;
        if (cursor) {
            try {
                startIndex = parseInt(atob(cursor), 10);
            } catch (e) {
                startIndex = 0;
            }
        }

        const totalCount = values.length;
        const endIndex = Math.min(startIndex + limit, totalCount);
        const pageValues = values.slice(startIndex, endIndex).reverse(); // Newest first

        // Calculate cursors
        let nextCursor = endIndex < totalCount ? btoa(endIndex.toString()) : null;
        let prevCursor = startIndex > 0 ? btoa(Math.max(0, startIndex - limit).toString()) : null;

        // Calculate statistics
        const numericValues = pageValues.map(v => parseFloat(v.value)).filter(v => !isNaN(v));
        const stats = numericValues.length > 0 ? {
            min: Math.min(...numericValues),
            max: Math.max(...numericValues),
            avg: parseFloat((numericValues.reduce((a, b) => a + b, 0) / numericValues.length).toFixed(2))
        } : null;

        const stationName = dataResponse.station?.name || metadata.title?.split(' - ')[1]?.split(':')[0] || 'Unknown';

        const summary = `${stationName} ${parameterName.toLowerCase()}: ${pageValues.length} readings (${time_range}). ${stats ? `Range: ${stats.min}${unit} to ${stats.max}${unit}, Avg: ${stats.avg}${unit}` : ''}`;

        return buildResponse({
            summary,
            data: {
                station_id,
                station_name: stationName,
                data_type,
                time_range,
                unit,
                readings: pageValues.map(v => ({
                    timestamp: v.date,
                    value: v.value,
                    formatted: `${v.value}${unit}`
                })),
                statistics: stats,
                pagination: {
                    total_count: totalCount,
                    returned_count: pageValues.length,
                    next_cursor: nextCursor,
                    prev_cursor: prevCursor
                }
            },
            nextActions: [
                nextCursor ? createNextAction('get_weather_history', { station_id, data_type, time_range, limit, cursor: nextCursor }, 'Load more data') : null,
                createNextAction('check_weather', { location: stationName }, `Check current weather at ${stationName}`),
                createNextAction('get_station_info', { station_id }, 'Get station details')
            ].filter(Boolean),
            traceId
        });
    } catch (e) {
        return buildErrorResponse({
            code: ErrorCode.API_ERROR,
            message: `Failed to fetch historical data: ${e.message}`,
            summary: 'API error',
            nextActions: [
                createNextAction('find_stations', { query: station_id }, 'Verify station exists')
            ],
            traceId
        });
    }
}

// ============================================================================
// TOOL: get_station_info
// ============================================================================

/**
 * Get station metadata and current readings
 */
export async function get_station_info(args) {
    const { station_id } = args;
    const traceId = generateTraceId();

    if (!station_id) {
        return buildErrorResponse({
            code: ErrorCode.INVALID_PARAMETER,
            message: 'station_id is required',
            summary: 'Missing station_id',
            nextActions: [
                createNextAction('find_stations', { query: 'Stockholm' }, 'Find a station')
            ],
            traceId
        });
    }

    // Try to fetch metadata for different parameter types
    const parameters = [
        { id: SMHIParameter.AIR_TEMP, type: 'temperature' },
        { id: SMHIParameter.DAILY_PRECIP, type: 'precipitation' },
        { id: SMHIParameter.SNOW_DEPTH, type: 'snow_depth' }
    ];

    let stationMetadata = null;
    const availableDataTypes = [];
    const currentReadings = {};

    for (const param of parameters) {
        try {
            const url = `${METOBS_BASE_URL}/parameter/${param.id}/station/${station_id}.json`;
            const data = await makeSmhiRequest(url, `metadata-${station_id}-${param.id}`, CACHE_TTL.metadata);

            if (!stationMetadata && data) {
                // Extract station info from first successful response
                const position = data.position?.[data.position.length - 1] || {};
                stationMetadata = {
                    id: station_id,
                    name: data.title?.split(' - ')[1]?.split(':')[0] || 'Unknown',
                    latitude: position.latitude,
                    longitude: position.longitude,
                    height: position.height,
                    owner: data.owner
                };
            }

            availableDataTypes.push({
                type: param.type,
                parameter_id: param.id,
                periods: data.period?.map(p => p.key) || []
            });

            // Try to fetch current reading
            if (param.type === 'temperature') {
                const temp = await fetchStationTemperature(station_id);
                if (temp) currentReadings.temperature = temp;
            } else if (param.type === 'snow_depth') {
                const snow = await fetchStationSnowDepth(station_id);
                if (snow) currentReadings.snow_depth = snow;
            }
        } catch (e) {
            // This parameter type is not available for this station
        }
    }

    if (!stationMetadata) {
        return buildErrorResponse({
            code: ErrorCode.STATION_NOT_FOUND,
            message: `Station ${station_id} not found`,
            summary: `Station ${station_id} not found`,
            nextActions: [
                createNextAction('find_stations', { query: station_id }, 'Search for stations')
            ],
            traceId
        });
    }

    // Generate warnings based on current readings
    const warnings = [];
    if (currentReadings.temperature) {
        const tempWarning = getTemperatureWarning(currentReadings.temperature.value);
        if (tempWarning) warnings.push(tempWarning);
    }
    if (currentReadings.snow_depth) {
        const snowWarning = getSnowDepthWarning(currentReadings.snow_depth.value);
        if (snowWarning) warnings.push(snowWarning);
    }

    // Build summary
    let summary = `${stationMetadata.name} (${station_id}): `;
    const summaryParts = [];
    if (currentReadings.temperature) {
        summaryParts.push(`${formatTemperature(currentReadings.temperature.value)}`);
    }
    if (currentReadings.snow_depth) {
        summaryParts.push(`Snow: ${formatSnowDepth(currentReadings.snow_depth.value)}`);
    }
    summary += summaryParts.length > 0 ? summaryParts.join(', ') : 'No current readings';
    summary += `. Data types: ${availableDataTypes.map(d => d.type).join(', ')}`;

    return buildResponse({
        summary,
        data: {
            station: stationMetadata,
            available_data_types: availableDataTypes,
            current_readings: currentReadings
        },
        nextActions: [
            createNextAction('get_weather_history', { station_id, data_type: availableDataTypes[0]?.type || 'temperature', time_range: 'today' }, 'Get historical data'),
            createNextAction('check_weather', { lat: stationMetadata.latitude, lon: stationMetadata.longitude }, 'Get forecast for this location')
        ],
        warnings,
        traceId
    });
}

// ============================================================================
// TOOL: list_regions
// ============================================================================

/**
 * List available snowmobile monitoring regions
 */
export async function list_regions(args) {
    const traceId = generateTraceId();

    // Count stations per region
    const regionStats = {};
    for (const [id, info] of Object.entries(snowmobileConditionsStations)) {
        if (!regionStats[info.region]) {
            regionStats[info.region] = { total: 0, temperature: 0, snow_depth: 0 };
        }
        regionStats[info.region].total++;
        if (info.hasTemperature) regionStats[info.region].temperature++;
        if (info.hasSnowDepth) regionStats[info.region].snow_depth++;
    }

    // Map to enum values
    const regions = Object.entries(REGION_DISPLAY_NAMES)
        .filter(([key]) => key !== 'all')
        .map(([key, displayName]) => ({
            id: key,
            name: displayName,
            station_count: regionStats[displayName]?.total || 0,
            temperature_stations: regionStats[displayName]?.temperature || 0,
            snow_depth_stations: regionStats[displayName]?.snow_depth || 0
        }));

    const totalStations = Object.keys(snowmobileConditionsStations).length;
    const summary = `${regions.length} snowmobile monitoring regions with ${totalStations} total stations`;

    return buildResponse({
        summary,
        data: {
            regions,
            total_stations: totalStations
        },
        nextActions: [
            createNextAction('get_snowmobile_conditions', { region: 'mountain' }, 'Check mountain region conditions'),
            createNextAction('get_snowmobile_conditions', { region: 'all' }, 'Check all regions')
        ],
        traceId
    });
}
