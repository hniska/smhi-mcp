// Geographic utilities for coordinate-based station search
import { getParameterName, createErrorResponse } from './parameters.js';
import { fetchAllStationsForParameter } from './stations.js';

/**
 * Calculate the great circle distance between two points using the Haversine formula.
 * @param {number} lat1 - Latitude of first point (decimal degrees)
 * @param {number} lon1 - Longitude of first point (decimal degrees)
 * @param {number} lat2 - Latitude of second point (decimal degrees)
 * @param {number} lon2 - Longitude of second point (decimal degrees)
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers

    // Convert to radians
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    // Haversine formula
    const a = Math.sin(deltaPhi / 2) ** 2 +
              Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
    const c = 2 * Math.asin(Math.sqrt(a));

    return R * c;
}

/**
 * Find nearest weather stations to given coordinates.
 * @param {number} latitude - Target latitude (WGS84 decimal degrees)
 * @param {number} longitude - Target longitude (WGS84 decimal degrees)
 * @param {string} parameter - SMHI parameter ID (1=temp, 5=precip, 8=snow)
 * @param {number} radiusKm - Maximum search radius in kilometers
 * @param {number} limit - Maximum number of stations to return
 * @param {boolean} activeOnly - Only return active stations
 * @returns {Promise<Object>} MCP tool result
 */
export async function findNearestStations(latitude, longitude, parameter = '1', radiusKm = 50, limit = 10, activeOnly = true) {
    try {
        // Validate coordinates
        if (latitude < -90 || latitude > 90) {
            return createErrorResponse(`Invalid latitude ${latitude}. Must be between -90 and 90.`);
        }
        if (longitude < -180 || longitude > 180) {
            return createErrorResponse(`Invalid longitude ${longitude}. Must be between -180 and 180.`);
        }

        // Fetch all stations for the parameter
        const stations = await fetchAllStationsForParameter(parameter);

        if (!stations || stations.length === 0) {
            return {
                type: "text",
                text: `No stations found for parameter ${parameter}`
            };
        }

        // Calculate distances and filter
        const nearbyStations = [];
        for (const station of stations) {
            // Skip inactive stations if activeOnly is true
            if (activeOnly && !station.active) {
                continue;
            }

            // Skip stations without coordinates
            if (!station.latitude || !station.longitude) {
                continue;
            }

            // Calculate distance
            const distance = haversineDistance(
                latitude, longitude,
                station.latitude, station.longitude
            );

            // Filter by radius
            if (distance > radiusKm) {
                continue;
            }

            nearbyStations.push({
                id: station.id,
                name: station.name,
                latitude: station.latitude,
                longitude: station.longitude,
                height: station.height,
                distance: distance,
                active: station.active,
                owner: station.owner
            });
        }

        // Sort by distance and limit results
        nearbyStations.sort((a, b) => a.distance - b.distance);
        const results = nearbyStations.slice(0, limit);

        if (results.length === 0) {
            return {
                type: "text",
                text: `No stations found within ${radiusKm}km of coordinates (${latitude}°N, ${longitude}°E) for parameter ${parameter}.\n\nTip: Try increasing the search radius or checking a different parameter type.`
            };
        }

        const parameterName = getParameterName(parameter);

        const stationList = results.map(s => {
            const heightStr = s.height ? `${s.height}m` : 'N/A';
            const activeStr = s.active ? '✓' : '✗';
            return `${s.id}: ${s.name}\n    Distance: ${s.distance.toFixed(1)}km\n    Location: ${s.latitude.toFixed(4)}°N, ${s.longitude.toFixed(4)}°E\n    Elevation: ${heightStr}\n    Active: ${activeStr}`;
        }).join('\n\n');

        return {
            type: "text",
            text: `${parameterName} stations near (${latitude}°N, ${longitude}°E)\nSearch radius: ${radiusKm}km\n\n${stationList}\n\nFound ${results.length} station(s) within ${radiusKm}km (${nearbyStations.length} total in radius)`
        };
    } catch (error) {
        return createErrorResponse(`Failed to find nearby stations: ${error.message}`);
    }
}
