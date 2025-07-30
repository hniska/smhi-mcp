// SMHI API client functions

import { CACHE_TTL } from '../config/constants.js';
import { getCachedResponse, setCachedResponse } from '../utils/cache.js';

/**
 * Make HTTP request to SMHI API with caching (matches worker.js exactly)
 */
export async function makeSmhiRequest(url, cacheKey = null, ttl = null) {
    // Try cache first if caching is enabled
    if (cacheKey && ttl) {
        const cachedData = await getCachedResponse(cacheKey, ttl);
        if (cachedData) {
            return cachedData;
        }
    }

    const headers = {
        'accept': 'application/json',
        'referer': 'https://opendata.smhi.se/',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)'
    };
    const response = await fetch(url, { headers });
    if (!response.ok) {
        throw new Error(`SMHI API request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Cache the response if caching is enabled
    if (cacheKey && ttl) {
        await setCachedResponse(cacheKey, data, ttl);
    }
    
    return data;
}

/**
 * Convert SMHI weather symbol to description (matches worker.js exactly)
 */
export function getWeatherDescription(symbol) {
    const descriptions = {
        1: "Clear sky",
        2: "Nearly clear sky", 
        3: "Variable cloudiness",
        4: "Halfclear sky",
        5: "Cloudy sky",
        6: "Overcast",
        7: "Fog",
        8: "Light rain showers",
        9: "Moderate rain showers", 
        10: "Heavy rain showers",
        11: "Thunderstorm",
        12: "Light sleet showers",
        13: "Moderate sleet showers",
        14: "Heavy sleet showers", 
        15: "Light snow showers",
        16: "Moderate snow showers",
        17: "Heavy snow showers",
        18: "Light rain",
        19: "Moderate rain",
        20: "Heavy rain",
        21: "Thunder",
        22: "Light sleet",
        23: "Moderate sleet", 
        24: "Heavy sleet",
        25: "Light snowfall",
        26: "Moderate snowfall",
        27: "Heavy snowfall"
    };
    return descriptions[symbol] || `Weather code ${symbol}`;
}