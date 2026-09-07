// JSON-RPC / MCP conformance tests for the request handler.
//
// Background: every failure came back as -32000, so a client could not tell an
// unknown method from a bad argument; tool failures were returned as ordinary
// result text with no isError flag, so they read as answers.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../worker.js';
import { TOOL_SCHEMAS } from '../src/config/tool-schemas.js';
import { toolHandlers } from '../src/tools/index.js';
import { installCacheStub } from './helpers/cache-stub.js';

const ENDPOINT = 'https://smhi-mcp.example/mcp';

beforeEach(() => {
    installCacheStub();
});

const rpc = async (body) => {
    const res = await worker.fetch(new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
    }), {}, { waitUntil: () => {} });
    return { res, json: res.status === 202 ? null : await res.json() };
};

describe('error codes', () => {
    it('answers an unknown method with -32601', async () => {
        const { json } = await rpc({ jsonrpc: '2.0', id: 1, method: 'does/not/exist' });
        expect(json.error.code).toBe(-32601);
    });

    it('answers an unknown tool with -32602', async () => {
        const { json } = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'nope', arguments: {} } });
        expect(json.error.code).toBe(-32602);
    });

    it('answers tools/call with no params with -32602 rather than a crash', async () => {
        const { json } = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call' });
        expect(json.error.code).toBe(-32602);
        expect(json.error.message).not.toMatch(/destructure|undefined is not/i);
    });

    it('keeps the request id on the error', async () => {
        const { json } = await rpc({ jsonrpc: '2.0', id: 'abc', method: 'does/not/exist' });
        expect(json.id).toBe('abc');
    });

    it('reports malformed JSON as -32700 with a null id', async () => {
        const res = await worker.fetch(new Request(ENDPOINT, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{ not json'
        }), {}, {});
        const json = await res.json();
        expect(json.error.code).toBe(-32700);
        expect(json.id).toBeNull();
    });
});

describe('tool results', () => {
    it('marks a failing tool with isError', async () => {
        globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 }));
        const { json } = await rpc({
            jsonrpc: '2.0', id: 4, method: 'tools/call',
            params: { name: 'get_station_temperature', arguments: { station_id: '159770' } }
        });
        expect(json.result.isError).toBe(true);
        expect(json.result.content[0].type).toBe('text');
    });

    it('does not mark a successful tool with isError', async () => {
        const { json } = await rpc({
            jsonrpc: '2.0', id: 5, method: 'tools/call',
            params: { name: 'list_snowmobile_conditions', arguments: {} }
        });
        expect(json.result.isError).toBeUndefined();
        expect(json.result.content[0].text).toContain('Snowmobile');
    });
});

describe('tool registry', () => {
    it('has a handler for every advertised tool', () => {
        const missing = TOOL_SCHEMAS.map(t => t.name).filter(name => !toolHandlers[name]);
        expect(missing).toEqual([]);
    });

    it('advertises every registered handler', () => {
        const advertised = new Set(TOOL_SCHEMAS.map(t => t.name));
        expect(Object.keys(toolHandlers).filter(n => !advertised.has(n))).toEqual([]);
    });

    it('can dispatch every advertised tool without an argument-mapping gap', async () => {
        // The dispatcher used to repeat every tool's argument order in a second
        // switch statement. A tool added to the registry but forgotten there
        // failed at call time, not at load time.
        for (const schema of TOOL_SCHEMAS) {
            const { json } = await rpc({
                jsonrpc: '2.0', id: schema.name, method: 'tools/call',
                params: { name: schema.name, arguments: {} }
            });
            expect(json.error?.code, `${schema.name} is not dispatchable`).not.toBe(-32601);
            expect(json.error?.message ?? '', schema.name).not.toMatch(/Unknown tool/);
        }
    });
});

describe('notifications', () => {
    it('accepts notifications/initialized with 202 and no body', async () => {
        const { res } = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
        expect(res.status).toBe(202);
    });
});
