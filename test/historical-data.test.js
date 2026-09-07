// Regression tests for get_historical_data.
//
// Background: a malformed or out-of-range cursor silently produced an empty
// page, an unparseable date bound was coerced to "no filter", and the CSV
// download was cached into R2 on the response path, adding the cost of a
// multi-megabyte write to the caller's latency.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get_historical_data } from '../src/tools/weather-tools.js';
import { installCacheStub } from './helpers/cache-stub.js';

const CSV_HREF = 'https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/1/station/159770/period/corrected-archive/data.csv';

const CSV = '﻿Stationsnamn;Stationsnummer;Stationsnät;Mäthöjd (meter över marken)\n' +
    'Glommersträsk;159770;SMHIs stationsnät;2.0\n' +
    '\n' +
    'Tidsperiod (fr.o.m);Tidsperiod (t.o.m);Höjd (meter över havet)\n' +
    '1967-12-01 00:00:00;1991-09-30 23:59:59;375.0\n' +
    '\n' +
    'Datum;Tid (UTC);Lufttemperatur;Kvalitet;;Tidsutsnitt:\n' +
    Array.from({ length: 12 }, (_, i) =>
        `2024-01-${String(i + 1).padStart(2, '0')};06:00:00;${i};G`).join('\n') + '\n';

const METADATA = {
    title: 'Lufttemperatur - Glommersträsk: data',
    data: [{ link: [{ type: 'text/plain', href: CSV_HREF, rel: 'data' }] }]
};

function stubFetch() {
    return vi.fn(async (url) => {
        if (String(url).endsWith('data.csv')) {
            return new Response(CSV, { headers: { 'Content-Type': 'text/plain' } });
        }
        return new Response(JSON.stringify(METADATA), {
            headers: { 'Content-Type': 'application/json' }
        });
    });
}

let fetchStub;
beforeEach(() => {
    installCacheStub();
    fetchStub = stubFetch();
    globalThis.fetch = fetchStub;
});

const call = (overrides = {}) => {
    const o = { station_id: '159770', parameter: '1', period: 'corrected-archive',
        limit: 5, cursor: null, reverse: true, fromDate: null, toDate: null, env: null, ...overrides };
    return get_historical_data(o.station_id, o.parameter, o.period, o.limit,
        o.cursor, o.reverse, o.fromDate, o.toDate, o.env);
};

describe('cursor handling', () => {
    it('reports a malformed cursor instead of returning a silent empty page', async () => {
        const res = await call({ cursor: 'not-base64!!' });
        expect(res.isError).toBe(true);
        expect(res.text).toMatch(/cursor/i);
    });

    it('rejects a cursor that decodes to something other than a row offset', async () => {
        const res = await call({ cursor: btoa('somewhere') });
        expect(res.isError).toBe(true);
        expect(res.text).toMatch(/cursor/i);
    });

    it('rejects a negative cursor', async () => {
        const res = await call({ cursor: btoa('-10') });
        expect(res.isError).toBe(true);
    });

    it('round-trips its own nextCursor', async () => {
        const first = await call({ limit: 5 });
        expect(first.text).toContain('2024-01-12');
        expect(first.nextCursor).toBeTruthy();

        const second = await call({ limit: 5, cursor: first.nextCursor });
        expect(second.text).toContain('2024-01-07');
        expect(second.text).not.toContain('2024-01-12');
    });
});

describe('date bounds', () => {
    it('includes the whole of the toDate day', async () => {
        const res = await call({ fromDate: '2024-01-01', toDate: '2024-01-03', reverse: false, limit: 10 });
        expect(res.totalCount).toBe(3);
    });

    it('reports an unparseable date instead of ignoring the filter', async () => {
        const res = await call({ fromDate: 'yesterday' });
        expect(res.isError).toBe(true);
        expect(res.text).toMatch(/fromDate/);
    });
});

describe('R2 caching', () => {
    it('does not block the response on the CSV write', async () => {
        let deferred = null;
        const env = {
            HISTORICAL_DATA: {
                get: async () => null,
                put: () => new Promise(() => {})   // never settles
            }
        };
        const ctx = { waitUntil: (p) => { deferred = p; } };

        const res = await Promise.race([
            get_historical_data('159770', '1', 'corrected-archive', 5, null, true, null, null, env, ctx),
            new Promise((_, reject) => setTimeout(() => reject(new Error('response blocked on R2 put')), 500))
        ]);

        expect(res.text).toContain('2024-01-12');
        expect(deferred).toBeInstanceOf(Promise);
    });
});

describe('errors', () => {
    it('flags a failed CSV download', async () => {
        globalThis.fetch = vi.fn(async (url) => {
            if (String(url).endsWith('data.csv')) return new Response('nope', { status: 503 });
            return new Response(JSON.stringify(METADATA), { headers: { 'Content-Type': 'application/json' } });
        });
        const res = await call();
        expect(res.isError).toBe(true);
    });
});
