// The Workers runtime provides caches.default; Node does not.
// Installs an in-memory stand-in and returns handles for seeding/inspecting it.

export function installCacheStub() {
    const store = new Map();

    globalThis.caches = {
        default: {
            async match(key) {
                const hit = store.get(key);
                return hit ? hit.clone() : undefined;
            },
            async put(key, res) {
                store.set(key, res.clone());
            }
        }
    };

    return {
        store,
        /** Pre-set the counter as if `count` requests already happened today. */
        seedCount(count, now = new Date()) {
            const day = now.toISOString().split('T')[0];
            const key = `https://cache.smhi-mcp.local/daily-requests-${day}`;
            store.set(key, new Response(JSON.stringify({ count }), {
                headers: { 'Content-Type': 'application/json' }
            }));
        },
        /** Current counter value, or 0 if never written. */
        async currentCount(now = new Date()) {
            const day = now.toISOString().split('T')[0];
            const key = `https://cache.smhi-mcp.local/daily-requests-${day}`;
            const hit = store.get(key);
            if (!hit) return 0;
            return (await hit.clone().json()).count;
        }
    };
}
