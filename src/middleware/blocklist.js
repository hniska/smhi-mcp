// IP blocklist.
//
// Configured, not hardcoded: set BLOCKED_IPS in wrangler.toml as a
// comma-separated list. Residential addresses are typically dynamic, so an
// entry that is correct today may be wrong next month -- keeping this in
// config means adding or removing one is an edit, not a code change.
//
// SCOPE: a block here still costs a Worker request. Cloudflare bills the
// invocation before this code runs; the caller gets 403 instead of a response,
// but the request is already counted. Rejecting traffic *before* billing
// requires a WAF rule, which needs a real zone -- *.workers.dev cannot have
// one. See README, "Protecting the request quota".

/**
 * @param {{BLOCKED_IPS?: string}} [env]
 * @returns {Set<string>}
 */
export function parseBlocklist(env) {
    const raw = env?.BLOCKED_IPS ?? '';
    return new Set(
        raw.split(',').map((entry) => entry.trim()).filter(Boolean)
    );
}

/**
 * @param {Request} request
 * @param {{BLOCKED_IPS?: string}} [env]
 * @returns {boolean}
 */
export function isBlocked(request, env) {
    const ip = request.headers.get('cf-connecting-ip');
    if (!ip) return false;
    return parseBlocklist(env).has(ip);
}

/**
 * Deliberately terse: no echo of the address, no hint about why.
 */
export function forbiddenResponse() {
    return new Response('Forbidden', {
        status: 403,
        headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-store'
        }
    });
}
