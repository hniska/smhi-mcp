// Transport-level regression tests for the MCP endpoint.
//
// Background: a GET on /mcp used to return a *finite* text/event-stream body.
// EventSource clients treat a closed stream as a dropped connection and
// reconnect after ~1s, forever. Three concurrent clients doing that burned
// ~250k Worker requests/day against a 100k/day account limit.

import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../worker.js';
import { installCacheStub } from './helpers/cache-stub.js';

const ENDPOINT = 'https://smhi-mcp.example/mcp';

beforeEach(() => {
    installCacheStub();
});

const sseGet = () => new Request(ENDPOINT, {
    method: 'GET',
    headers: {
        accept: 'text/event-stream',
        'mcp-protocol-version': '2025-06-18'
    }
});

describe('GET /mcp (server-initiated SSE stream)', () => {
    it('returns 405 so conforming clients stop reconnecting', async () => {
        const res = await worker.fetch(sseGet(), {}, {});
        expect(res.status).toBe(405);
    });

    it('advertises the methods it does support', async () => {
        const res = await worker.fetch(sseGet(), {}, {});
        expect(res.headers.get('allow')).toContain('POST');
    });

    it('does not hand back a finite event-stream that triggers retry', async () => {
        const res = await worker.fetch(sseGet(), {}, {});
        expect(res.headers.get('content-type') ?? '').not.toContain('text/event-stream');
    });
});

describe('POST /mcp (JSON-RPC) still works', () => {
    const rpc = (body) => new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    });

    it('answers initialize', async () => {
        const res = await worker.fetch(
            rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }), {}, {}
        );
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.result.serverInfo.name).toBe('smhi-mcp');
        expect(json.result.capabilities.tools.listChanged).toBe(true);
    });

    it('answers tools/list', async () => {
        const res = await worker.fetch(
            rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), {}, {}
        );
        const json = await res.json();
        expect(Array.isArray(json.result.tools)).toBe(true);
        expect(json.result.tools.length).toBeGreaterThan(0);
    });
});
