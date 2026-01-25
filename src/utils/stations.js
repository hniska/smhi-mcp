// Station listing and discovery utilities
import { METOBS_BASE_URL, CACHE_TTL } from '../config/constants.js';
import { makeSmhiRequest } from '../api/smhi.js';
import { getParameterName } from './parameters.js';

/**
 * List all stations for a given parameter with pagination support
 */
export async function listAllStationsForParameter(parameter, cursor = null) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}.json`;
        const cacheKey = `all-stations-${parameter}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.metadata);

        if (!data.station || data.station.length === 0) {
            return {
                type: "text",
                text: `No stations found for parameter ${parameter}`
            };
        }

        // Sort stations by ID
        const sortedStations = data.station
            .filter(s => s.active)
            .sort((a, b) => a.id - b.id);

        // Pagination
        const pageSize = 50;
        let startIndex = 0;

        if (cursor) {
            try {
                startIndex = parseInt(atob(cursor), 10);
            } catch (e) {
                startIndex = 0;
            }
        }

        const endIndex = Math.min(startIndex + pageSize, sortedStations.length);
        const pageStations = sortedStations.slice(startIndex, endIndex);

        // Calculate cursors
        let nextCursor = null;
        let prevCursor = null;

        if (endIndex < sortedStations.length) {
            nextCursor = btoa(endIndex.toString());
        }
        if (startIndex > 0) {
            prevCursor = btoa(Math.max(0, startIndex - pageSize).toString());
        }

        const parameterName = getParameterName(parameter);

        const stationList = pageStations.map(s => {
            const lat = s.latitude?.toFixed(4) || 'N/A';
            const lon = s.longitude?.toFixed(4) || 'N/A';
            const height = s.height ? `${s.height}m` : 'N/A';
            return `${s.id}: ${s.name} (${lat}°N, ${lon}°E, ${height})`;
        }).join('\n');

        let paginationInfo = `\nShowing ${pageStations.length} of ${sortedStations.length} active stations`;
        if (nextCursor) paginationInfo += `\nNext page cursor: ${nextCursor}`;
        if (prevCursor) paginationInfo += `\nPrevious page cursor: ${prevCursor}`;

        return {
            type: "text",
            text: `${parameterName} Stations (Active)\n\n${stationList}${paginationInfo}`
        };
    } catch (error) {
        return {
            type: "text",
            text: `Error fetching stations: ${error.message}`
        };
    }
}

/**
 * Fetch all stations for a parameter (raw data for coordinate search)
 */
export async function fetchAllStationsForParameter(parameter) {
    const url = `${METOBS_BASE_URL}/parameter/${parameter}.json`;
    const cacheKey = `all-stations-${parameter}`;
    const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.metadata);
    return data.station || [];
}
