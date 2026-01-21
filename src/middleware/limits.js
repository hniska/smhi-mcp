// Request limiting middleware for SMHI MCP server

const DAILY_LIMIT = 95000; // 95% of 100k free tier

export async function checkRequestLimits() {
    const cache = caches.default;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const countKey = `https://cache.smhi-mcp.local/daily-requests-${today}`;

    let response = await cache.match(countKey);
    let count = 0;

    if (response) {
        const data = await response.json();
        count = data.count || 0;
    }

    if (count >= DAILY_LIMIT) {
        throw new Error('Daily request limit reached. Service temporarily unavailable.');
    }
    
    // Increment counter
    count++;
    const newResponse = new Response(JSON.stringify({ count }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'max-age=86400' // 24 hours
        }
    });
    await cache.put(countKey, newResponse);
    
    return count;
}