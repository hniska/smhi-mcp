// Structured tool output (MCP outputSchema / structuredContent).
//
// Background: get_weather_forecast returned its JSON only as pretty-printed
// text, so a client had to parse a string to use it, and an empty date range
// came back as a sentence instead of data. The two legacy list tools had the
// same problem.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../worker.js';
import { TOOL_SCHEMAS } from '../src/config/tool-schemas.js';
import { installCacheStub } from './helpers/cache-stub.js';

const ENDPOINT = 'https://smhi-mcp.example/mcp';

const call = async (name, args = {}) => {
    const res = await worker.fetch(new Request(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
    }), {}, { waitUntil: () => {} });
    return (await res.json()).result;
};

// Minimal SNOW1gv1 point forecast: two hourly entries.
const SNOW1G = {
    timeSeries: [
        { time: '2026-10-13T10:00:00Z', data: { air_temperature: 4.2, wind_speed: 3.1, symbol_code: 3, precipitation_amount_mean: 0 } },
        { time: '2026-10-13T11:00:00Z', data: { air_temperature: 4.8, wind_speed: 3.4, symbol_code: 1 } }
    ]
};

const schemaFor = (name) => TOOL_SCHEMAS.find(t => t.name === name).outputSchema;

beforeEach(() => {
    installCacheStub();
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(SNOW1G), {
        headers: { 'Content-Type': 'application/json' }
    }));
});

describe('get_weather_forecast', () => {
    it('declares an outputSchema', () => {
        expect(schemaFor('get_weather_forecast')?.required).toEqual(['location', 'forecast', 'meta']);
    });

    it('returns structuredContent next to a compact JSON text block', async () => {
        const result = await call('get_weather_forecast', { lat: 59.33, lon: 18.07 });

        expect(result.structuredContent.forecast).toHaveLength(2);
        expect(result.structuredContent.forecast[0]).toMatchObject({ validTime: '2026-10-13T10:00:00Z', temperature: 4.2 });
        expect(result.structuredContent.meta).toMatchObject({ totalPeriods: 2, returnedPeriods: 2 });

        // The text block is the same data, serialised without indentation.
        expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
        expect(result.content[0].text).not.toMatch(/\n/);
        expect(result.content[0]).not.toHaveProperty('structured');
    });

    it('answers an empty date range with an empty forecast, not an error sentence', async () => {
        const result = await call('get_weather_forecast', { lat: 59.33, lon: 18.07, fromDate: '2030-01-01' });

        expect(result.isError).toBeUndefined();
        expect(result.structuredContent.forecast).toEqual([]);
        expect(result.structuredContent.meta).toMatchObject({ totalPeriods: 0, returnedPeriods: 0, fromDate: '2030-01-01' });
    });

    it('sends no structuredContent on failure', async () => {
        globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 }));
        const result = await call('get_weather_forecast', { lat: 59.33, lon: 18.07 });

        expect(result.isError).toBe(true);
        expect(result).not.toHaveProperty('structuredContent');
    });
});

describe.each([
    ['list_temperature_stations'],
    ['list_snow_depth_stations']
])('%s', (name) => {
    it('returns the stations as structuredContent that matches its outputSchema', async () => {
        const result = await call(name);

        expect(schemaFor(name)?.required).toEqual(['deprecated', 'replacedBy', 'stations']);
        expect(result.structuredContent.deprecated).toBe(true);
        expect(result.structuredContent.replacedBy).toBe('list_snowmobile_conditions');
        expect(result.structuredContent.stations.length).toBeGreaterThan(0);
        for (const station of result.structuredContent.stations) {
            expect(typeof station.id).toBe('string');
            expect(typeof station.name).toBe('string');
        }
        expect(result.content[0].text).toMatch(/DEPRECATED/);
    });
});

describe('tools without structured output', () => {
    it('send no structuredContent', async () => {
        const result = await call('list_snowmobile_conditions');
        expect(result).not.toHaveProperty('structuredContent');
    });
});
