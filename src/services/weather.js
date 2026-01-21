// Weather data service functions

import { SMHIParameter, SMHIPeriod, METOBS_BASE_URL, METFCST_BASE_URL, CACHE_TTL } from '../config/constants.js';
import { makeSmhiRequest, getWeatherDescription } from '../api/smhi.js';

/**
 * Get current temperature for a weather station (matches worker.js exactly)
 */
export async function get_station_temperature(station_id) {
    try {
        // First try latest-hour data
        let url = `${METOBS_BASE_URL}/parameter/${SMHIParameter.AIR_TEMP}/station/${station_id}/period/latest-hour/data.json`;
        let cacheKey = `temp-${station_id}-latest-hour`;
        let data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.current);

        // If no hourly data, try latest-day
        if (!data.value || data.value.length === 0) {
            console.log(`No hourly data for station ${station_id}, trying daily data`);
            url = `${METOBS_BASE_URL}/parameter/${SMHIParameter.AIR_TEMP}/station/${station_id}/period/latest-day/data.json`;
            cacheKey = `temp-${station_id}-latest-day`;
            data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.current);
        }
        
        // If still no data, return error
        if (!data.value || data.value.length === 0) {
            return {
                type: "text",
                text: `No temperature data available for station ${station_id} (${data.station?.name || 'Unknown station'})`
            };
        }
        
        const latestValue = data.value[data.value.length - 1]; // Get most recent value
        const stationName = data.station?.name || station_id;
        
        return {
            type: "text",
            text: `Station ${stationName} (${station_id}): ${latestValue.value}°C at ${latestValue.date}`
        };
    } catch (e) {
        return {
            type: "text",
            text: `Error fetching temperature for station ${station_id}: ${e.message}`
        };
    }
}

/**
 * Get current snow depth for a weather station (matches worker.js exactly)
 */
export async function get_station_snow_depth(station_id) {
    try {
        // First try latest-day data
        let url = `${METOBS_BASE_URL}/parameter/${SMHIParameter.SNOW_DEPTH}/station/${station_id}/period/latest-day/data.json`;
        let cacheKey = `snow-${station_id}-latest-day`;
        let data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.current);

        // If no daily data, try latest-months
        if (!data.value || data.value.length === 0) {
            console.log(`No daily snow depth data for station ${station_id}, trying latest-months`);
            url = `${METOBS_BASE_URL}/parameter/${SMHIParameter.SNOW_DEPTH}/station/${station_id}/period/latest-months/data.json`;
            cacheKey = `snow-${station_id}-latest-months`;
            data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.current);
        }

        // If still no data, return error
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

/**
 * Get weather forecast for coordinates (matches worker.js exactly)
 * @param {number} lat - Latitude coordinate
 * @param {number} lon - Longitude coordinate  
 * @param {string} fromDate - Start date for filtering (ISO 8601)
 * @param {string} toDate - End date for filtering (ISO 8601)
 * @param {number} limit - Number of hourly forecast periods (each = 1 hour of data). Examples: 8=8hrs, 24=1day, 168=1week
 */
export async function get_weather_forecast(lat, lon, fromDate = null, toDate = null, limit = 8) {
    try {
        const url = `${METFCST_BASE_URL}/geotype/point/lon/${lon}/lat/${lat}/data.json`;
        const cacheKey = `forecast-${lat}-${lon}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.forecast);
        
        // Apply time filtering if specified
        let filteredTimeSeries = data.timeSeries;

        // Helper to parse date string to timestamp
        const parseDate = (dateInput, endOfDay = false) => {
            if (!dateInput) return null;

            // Convert to string if needed
            const dateStr = dateInput instanceof Date
                ? dateInput.toISOString()
                : String(dateInput);

            // Skip invalid values
            if (!dateStr || dateStr === 'null' || dateStr === 'undefined') return null;

            // If date-only format (YYYY-MM-DD), adjust for start/end of day
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                const suffix = endOfDay ? 'T23:59:59Z' : 'T00:00:00Z';
                return new Date(dateStr + suffix).getTime();
            }

            const timestamp = new Date(dateStr).getTime();
            return isNaN(timestamp) ? null : timestamp;
        };

        const fromTimestamp = parseDate(fromDate, false);
        const toTimestamp = parseDate(toDate, true);

        if (fromTimestamp) {
            filteredTimeSeries = filteredTimeSeries.filter(entry =>
                new Date(entry.validTime).getTime() >= fromTimestamp
            );
        }

        if (toTimestamp) {
            filteredTimeSeries = filteredTimeSeries.filter(entry =>
                new Date(entry.validTime).getTime() <= toTimestamp
            );
        }

        // Normalize date strings for response metadata
        const fromDateStr = fromDate ? String(fromDate) : null;
        const toDateStr = toDate ? String(toDate) : null;
        
        // If no valid time series after filtering, show basic error without showing malformed dates
        if (filteredTimeSeries.length === 0) {
            return {
                type: "text",
                text: `No forecast data available for ${lat}°N, ${lon}°E in the requested time range`
            };
        }
        
        // Apply limit (default 8, max 100 to prevent excessive output)
        const maxLimit = Math.min(limit || 8, 100);
        const limitedTimeSeries = filteredTimeSeries.slice(0, maxLimit);
        
        const forecastData = limitedTimeSeries.map(entry => {
            const params = Object.fromEntries(entry.parameters.map(p => [p.name, p.values[0]]));
            
            return {
                validTime: entry.validTime,
                temperature: params.t || null,
                precipitation: params.pmean || 0,
                windSpeed: params.ws || 0,
                windDirection: params.wd || null,
                cloudCover: params.tcc_mean || null,
                visibility: params.vis || null,
                humidity: params.r || null,
                weatherSymbol: params.Wsymb2 || 0,
                weatherDescription: getWeatherDescription(params.Wsymb2 || 0)
            };
        });

        return {
            type: "text",
            text: JSON.stringify({
                location: {
                    latitude: lat,
                    longitude: lon
                },
                forecast: forecastData,
                meta: {
                    totalPeriods: filteredTimeSeries.length,
                    returnedPeriods: limitedTimeSeries.length,
                    fromDate: fromDateStr,
                    toDate: toDateStr
                }
            }, null, 2)
        };
    } catch (e) {
        return {
            type: "text",
            text: `Error: Failed to fetch forecast from SMHI: ${e.message}`
        };
    }
}