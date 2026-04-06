// Request accounting for the SMHI MCP server.
//
// SCOPE, stated honestly: this CANNOT protect the Cloudflare daily request
// quota. By the time this code runs the request has already been counted
// against the account -- a 429 costs exactly as much quota as a 200. What it
// does buy is (a) shedding load off the upstream SMHI APIs and (b) failing
// loudly instead of silently when traffic goes abnormal.
//
// To actually protect the request quota, traffic must be rejected *before* it
// reaches the Worker: put the service on a real zone and add a WAF rate-limit
// rule. See README, "Protecting the request quota".
//
// Backing store is caches.default, which is per-colo, so the count is a
// per-edge-location figure rather than a global one. It is a smoke alarm, not
// an accountant.

export const DAILY_LIMIT = 95000; // 95% of the 100k/day free tier

const counterKey = (day) => `https://cache.smhi-mcp.local/daily-requests-${day}`;

const utcDay = (now) => now.toISOString().split('T')[0]; // YYYY-MM-DD

function secondsUntilUtcMidnight(now) {
    const midnight = Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
    );
    return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}

/**
 * Count this request and report whether the daily budget is spent.
 *
 * Applies to every method. The previous version was invoked only from the POST
 * branch of worker.js, so a sustained flood of GETs went entirely unaccounted.
 *
 * @returns {Promise<{count: number, exceeded: boolean, retryAfter: number}>}
 */
export async function checkRequestLimits(now = new Date()) {
    const retryAfter = secondsUntilUtcMidnight(now);

    // `caches` is absent outside the Workers runtime. Degrade to a no-op rather
    // than taking the whole server down.
    if (typeof caches === 'undefined' || !caches?.default) {
        return { count: 0, exceeded: false, retryAfter };
    }

    const key = counterKey(utcDay(now));
    const cache = caches.default;

    let count = 0;
    const hit = await cache.match(key);
    if (hit) {
        try {
            count = Number((await hit.json()).count) || 0;
        } catch {
            count = 0; // corrupt entry: restart the count rather than throw
        }
    }

    count++;

    await cache.put(key, new Response(JSON.stringify({ count }), {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `max-age=${retryAfter}`
        }
    }));

    return { count, exceeded: count > DAILY_LIMIT, retryAfter };
}

/**
 * Response served once the daily budget is spent.
 */
export function tooManyRequestsResponse({ count, retryAfter }) {
    return new Response(
        `Daily request budget reached (${count} requests seen at this edge location). Service resumes at 00:00 UTC.`,
        {
            status: 429,
            headers: {
                'Retry-After': String(retryAfter),
                'Content-Type': 'text/plain',
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*'
            }
        }
    );
}
