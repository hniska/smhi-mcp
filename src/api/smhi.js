// SMHI API client functions

import { getCachedResponse, setCachedResponse } from '../utils/cache.js';

/**
 * Make an HTTP request to the SMHI API, reading through the edge cache.
 *
 * @param {string} url
 * @param {string} [cacheKey] Omit to bypass the cache.
 * @param {number} [ttl] Seconds.
 * @param {{waitUntil?: (p: Promise<unknown>) => void}} [ctx] Worker execution
 *   context. When present the cache write is handed to the runtime instead of
 *   being awaited, which kept every cache miss waiting on a write it did not
 *   need the result of.
 */
export async function makeSmhiRequest(url, cacheKey = null, ttl = null, ctx = null) {
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
        const write = setCachedResponse(cacheKey, data, ttl);
        if (ctx?.waitUntil) {
            ctx.waitUntil(write);
        } else {
            await write;
        }
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