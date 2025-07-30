// Cache management utilities for JSON responses and CSV data

import { CACHE_TTL } from '../config/constants.js';

/**
 * Get cached response using Cloudflare Cache API
 */
export async function getCachedResponse(cacheKey, ttl) {
    const cache = caches.default;
    const fullCacheUrl = `https://cache.smhi-mcp.local/${cacheKey}`;
    const cachedResponse = await cache.match(fullCacheUrl);
    
    if (cachedResponse) {
        const cacheTime = cachedResponse.headers.get('x-cache-time');
        if (cacheTime && (Date.now() - parseInt(cacheTime)) < (ttl * 1000)) {
            return await cachedResponse.json();
        }
    }
    return null;
}

/**
 * Cache a response using Cloudflare Cache API
 */
export async function setCachedResponse(cacheKey, data, ttl) {
    const cache = caches.default;
    const fullCacheUrl = `https://cache.smhi-mcp.local/${cacheKey}`;
    const response = new Response(JSON.stringify(data), {
        headers: {
            'Content-Type': 'application/json',
            'x-cache-time': Date.now().toString(),
            'Cache-Control': `max-age=${ttl}`
        }
    });
    await cache.put(fullCacheUrl, response);
    return data;
}

/**
 * Determine R2 cache TTL based on data characteristics
 */
export function getR2CacheTTL(station_id, parameter, period, fromDate = null, toDate = null) {
    // Default TTL
    let ttl = CACHE_TTL.r2_csv;
    
    // For date-filtered requests, check if data is recent or old
    if (fromDate) {
        const requestYear = new Date(fromDate).getFullYear();
        const currentYear = new Date().getFullYear();
        const yearDiff = currentYear - requestYear;
        
        if (yearDiff >= 2) {
            // Old data rarely changes, cache longer
            ttl = CACHE_TTL.r2_old_csv;
        } else if (yearDiff === 0) {
            // Current year data changes more frequently
            ttl = CACHE_TTL.r2_recent_csv;
        }
    }
    
    // Archive period data is more stable than latest periods
    if (period === 'corrected-archive') {
        ttl = Math.max(ttl, CACHE_TTL.r2_csv);
    } else {
        // Latest periods change more frequently
        ttl = Math.min(ttl, CACHE_TTL.r2_recent_csv);
    }
    
    return ttl * 1000; // Convert to milliseconds
}

/**
 * Get cached CSV data from R2 storage (matches worker.js exactly)
 */
export async function getCachedCSV(station_id, parameter, period, env, fromDate = null, toDate = null) {
    if (!env?.HISTORICAL_DATA) return null;
    
    const key = `csv/${parameter}/${station_id}/${period}.csv`;
    
    try {
        const object = await env.HISTORICAL_DATA.get(key);
        if (object) {
            // Get dynamic TTL based on data characteristics
            const ttlMs = getR2CacheTTL(station_id, parameter, period, fromDate, toDate);
            
            const metadata = object.customMetadata;
            const cacheTime = metadata?.timestamp;
            if (cacheTime && (Date.now() - parseInt(cacheTime)) < ttlMs) {
                console.log(`R2 cache HIT: ${key} (TTL: ${ttlMs/1000}s)`);
                return await object.text();
            } else {
                console.log(`R2 cache EXPIRED: ${key} (age: ${cacheTime ? Math.round((Date.now() - parseInt(cacheTime))/1000) : 'unknown'}s)`);
            }
        }
    } catch (e) {
        // Cache miss or error, continue to fetch from SMHI
        console.log(`R2 cache MISS: ${key} - ${e.message}`);
    }
    return null;
}

/**
 * Cache CSV data in R2 storage (matches worker.js exactly)  
 */
export async function setCachedCSV(csvText, station_id, parameter, period, env) {
    if (!env?.HISTORICAL_DATA || !csvText) return;
    
    const key = `csv/${parameter}/${station_id}/${period}.csv`;
    
    try {
        await env.HISTORICAL_DATA.put(key, csvText, {
            customMetadata: {
                timestamp: Date.now().toString(),
                station: station_id,
                parameter: parameter,
                period: period,
                size: csvText.length.toString()
            }
        });
        console.log(`Cached CSV to R2: ${key} (${csvText.length} bytes)`);
    } catch (e) {
        console.log(`Failed to cache CSV to R2: ${key}`, e.message);
    }
}