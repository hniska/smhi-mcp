// Station search utilities
import { METOBS_BASE_URL, CACHE_TTL } from '../config/constants.js';
import { makeSmhiRequest } from '../api/smhi.js';
import { getParameterName, createErrorResponse } from './parameters.js';
import { calculateSimilarity, normalizeSwedish } from './string.js';

/**
 * Search for stations by name within a specific parameter type
 */
export async function searchStationsByParameter(query, parameter, limit = 10, threshold = 0.3, activeOnly = true) {
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

        const normalizedQuery = normalizeSwedish(query);

        // Calculate similarity scores for all stations
        const scoredStations = data.station
            .filter(s => !activeOnly || s.active)
            .map(station => {
                const normalizedName = normalizeSwedish(station.name);
                // A substring match already scores 1.0, so the edit distance --
                // the expensive half of the loop -- is only worth computing for
                // names that did not match outright.
                const score = normalizedName.includes(normalizedQuery)
                    ? 1.0
                    : calculateSimilarity(normalizedQuery, normalizedName);
                return { ...station, score };
            })
            .filter(s => s.score >= threshold)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        if (scoredStations.length === 0) {
            return {
                type: "text",
                text: `No stations matching "${query}" found for parameter ${parameter}`
            };
        }

        const parameterName = getParameterName(parameter);

        const results = scoredStations.map(s => {
            const lat = s.latitude?.toFixed(4) || 'N/A';
            const lon = s.longitude?.toFixed(4) || 'N/A';
            const height = s.height ? `${s.height}m` : 'N/A';
            const active = s.active ? '✓' : '✗';
            return `${s.id}: ${s.name} (${lat}°N, ${lon}°E, ${height}) [${active}] score: ${s.score.toFixed(2)}`;
        }).join('\n');

        return {
            type: "text",
            text: `Search results for "${query}" in ${parameterName} stations:\n\n${results}`
        };
    } catch (error) {
        return createErrorResponse(`Failed to search stations: ${error.message}`);
    }
}

/**
 * Search for stations by name across multiple parameter types
 */
export async function searchStationsMultiParameter(query, parameters, limit = 10, threshold = 0.3, activeOnly = true) {
    try {
        const normalizedQuery = normalizeSwedish(query);
        const allResults = [];

        // Search across all specified parameters
        for (const parameter of parameters) {
            const url = `${METOBS_BASE_URL}/parameter/${parameter}.json`;
            const cacheKey = `all-stations-${parameter}`;

            try {
                const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.metadata);

                if (data.station) {
                    const parameterName = getParameterName(parameter);

                    const scoredStations = data.station
                        .filter(s => !activeOnly || s.active)
                        .map(station => {
                            const normalizedName = normalizeSwedish(station.name);
                            const score = normalizedName.includes(normalizedQuery)
                                ? 1.0
                                : calculateSimilarity(normalizedQuery, normalizedName);
                            return {
                                ...station,
                                parameter: parameter,
                                parameterName: parameterName,
                                score
                            };
                        })
                        .filter(s => s.score >= threshold);

                    allResults.push(...scoredStations);
                }
            } catch (e) {
                // Continue to next parameter if this one fails
                console.log(`Failed to search parameter ${parameter}: ${e.message}`);
            }
        }

        if (allResults.length === 0) {
            return {
                type: "text",
                text: `No stations matching "${query}" found across any parameter type`
            };
        }

        // Sort by score and deduplicate by station ID (keep highest score)
        const stationMap = new Map();
        for (const station of allResults.sort((a, b) => b.score - a.score)) {
            const key = `${station.id}-${station.parameter}`;
            if (!stationMap.has(key)) {
                stationMap.set(key, station);
            }
        }

        const uniqueResults = Array.from(stationMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        const results = uniqueResults.map(s => {
            const lat = s.latitude?.toFixed(4) || 'N/A';
            const lon = s.longitude?.toFixed(4) || 'N/A';
            const height = s.height ? `${s.height}m` : 'N/A';
            const active = s.active ? '✓' : '✗';
            return `${s.id}: ${s.name} [${s.parameterName}] (${lat}°N, ${lon}°E, ${height}) [${active}] score: ${s.score.toFixed(2)}`;
        }).join('\n');

        return {
            type: "text",
            text: `Search results for "${query}" across all parameter types:\n\n${results}`
        };
    } catch (error) {
        return createErrorResponse(`Failed to search stations: ${error.message}`);
    }
}
