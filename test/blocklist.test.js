// Tests for the IP blocklist.
//
// Context: 158.174.178.59 drove ~420k unwanted requests in August 2026 via an
// SSE reconnect loop. The 405 fix stopped the loop; this is defence in depth.
//
// NOTE: a block here still costs a Worker request -- the response is 403
// instead of 200, but Cloudflare has already billed it. Only a WAF rule on a
// real zone rejects traffic before billing.

import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker.js';
import { installCacheStub } from './helpers/cache-stub.js';
import { isBlocked, parseBlocklist } from '../src/middleware/blocklist.js';

const ENDPOINT = 'https://smhi-mcp.example/mcp';
const OFFENDER = '158.174.178.59';

beforeEach(() => {
    installCacheStub();
});

const from = (ip, init = {}) => new Request(ENDPOINT, {
    method: 'GET',
    headers: { 'cf-connecting-ip': ip, ...(init.headers || {}) },
    ...init
});

describe('parseBlocklist', () => {
    it('is empty when unconfigured', () => {
        expect(parseBlocklist({}).size).toBe(0);
        expect(parseBlocklist(undefined).size).toBe(0);
    });

    it('reads a comma-separated list', () => {
        const set = parseBlocklist({ BLOCKED_IPS: '1.2.3.4,5.6.7.8' });
        expect(set.has('1.2.3.4')).toBe(true);
        expect(set.has('5.6.7.8')).toBe(true);
    });

    it('tolerates whitespace and trailing commas', () => {
        const set = parseBlocklist({ BLOCKED_IPS: ' 1.2.3.4 , 5.6.7.8 ,, ' });
        expect(set.size).toBe(2);
        expect(set.has('1.2.3.4')).toBe(true);
    });
});

describe('isBlocked', () => {
    const env = { BLOCKED_IPS: OFFENDER };

    it('matches the configured address', () => {
        expect(isBlocked(from(OFFENDER), env)).toBe(true);
    });

    it('leaves everyone else alone', () => {
        expect(isBlocked(from('46.59.85.74'), env)).toBe(false);
    });

    it('does not block when the header is absent', () => {
        expect(isBlocked(new Request(ENDPOINT), env)).toBe(false);
    });
});

describe('worker integration', () => {
    const env = { BLOCKED_IPS: OFFENDER };

    it('answers 403 to a blocked address', async () => {
        const res = await worker.fetch(from(OFFENDER), env, {});
        expect(res.status).toBe(403);
    });

    it('blocks POST as well as GET', async () => {
        const res = await worker.fetch(new Request(ENDPOINT, {
            method: 'POST',
            headers: { 'cf-connecting-ip': OFFENDER, 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })
        }), env, {});
        expect(res.status).toBe(403);
    });

    it('does not leak why the request was refused', async () => {
        const res = await worker.fetch(from(OFFENDER), env, {});
        const body = await res.text();
        expect(body).not.toContain(OFFENDER);
    });

    it('still serves an unblocked address normally', async () => {
        const res = await worker.fetch(
            from('46.59.85.74', { headers: { accept: 'text/event-stream' } }), env, {}
        );
        expect(res.status).toBe(405); // the normal no-SSE-on-GET answer
    });

    it('serves everyone when no blocklist is configured', async () => {
        const res = await worker.fetch(from(OFFENDER), {}, {});
        expect(res.status).not.toBe(403);
    });
});
