// Regression tests for request accounting.
//
// Background: checkRequestLimits() was called only from the POST branch of
// worker.js. A flood of ~420k GET requests over four days went completely
// unaccounted, so the 95k guard never fired.

import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker.js';
import { installCacheStub } from './helpers/cache-stub.js';
import { DAILY_LIMIT } from '../src/middleware/limits.js';

const ENDPOINT = 'https://smhi-mcp.example/mcp';

let cache;
beforeEach(() => {
    cache = installCacheStub();
});

const sseGet = () => new Request(ENDPOINT, {
    method: 'GET',
    headers: { accept: 'text/event-stream' }
});

const plainGet = () => new Request(ENDPOINT, { method: 'GET' });

const rpcPost = () => new Request(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })
});

describe('request accounting covers every method', () => {
    it('counts an SSE GET', async () => {
        await worker.fetch(sseGet(), {}, {});
        expect(await cache.currentCount()).toBe(1);
    });

    it('counts a plain GET', async () => {
        await worker.fetch(plainGet(), {}, {});
        expect(await cache.currentCount()).toBe(1);
    });

    it('counts a POST', async () => {
        await worker.fetch(rpcPost(), {}, {});
        expect(await cache.currentCount()).toBe(1);
    });

    it('accumulates across mixed methods', async () => {
        await worker.fetch(sseGet(), {}, {});
        await worker.fetch(plainGet(), {}, {});
        await worker.fetch(rpcPost(), {}, {});
        expect(await cache.currentCount()).toBe(3);
    });
});

describe('behaviour once the daily budget is spent', () => {
    it('returns 429 instead of serving the request', async () => {
        cache.seedCount(DAILY_LIMIT);
        const res = await worker.fetch(rpcPost(), {}, {});
        expect(res.status).toBe(429);
    });

    it('tells the client when to come back', async () => {
        cache.seedCount(DAILY_LIMIT);
        const res = await worker.fetch(sseGet(), {}, {});
        const retryAfter = Number(res.headers.get('retry-after'));
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(86400);
    });

    it('does not report a limit error as a JSON-RPC parse error', async () => {
        cache.seedCount(DAILY_LIMIT);
        const res = await worker.fetch(rpcPost(), {}, {});
        expect(res.status).not.toBe(400);
    });

    it('serves normally while under budget', async () => {
        cache.seedCount(10);
        const res = await worker.fetch(rpcPost(), {}, {});
        expect(res.status).toBe(200);
    });
});

describe('CORS preflight', () => {
    it('is answered without being charged against the budget', async () => {
        const res = await worker.fetch(
            new Request(ENDPOINT, { method: 'OPTIONS' }), {}, {}
        );
        expect(res.status).toBe(200);
        expect(await cache.currentCount()).toBe(0);
    });
});
