// Regression tests for how SMHI observation values are read and rendered.
//
// Three faults found against the live API on 2026-09-07:
//
//  1. SMHI returns timestamps as epoch milliseconds. They were interpolated
//     straight into the answer, so a reading came back as "at 1788742800000".
//  2. Aggregate parameters (daily mean/min/max, monthly, daily precipitation)
//     carry `ref` + `from`/`to` instead of `date`. Reading `.date` gave
//     "at undefined".
//  3. SMHI serves data.csv only for corrected-archive. The latest-hour,
//     latest-day and latest-months links are advertised in the metadata but
//     answer 406, so get_historical_data failed for three of the four periods
//     its own schema documents.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatObservationTime } from '../src/utils/time.js';
import { get_temperature_multi_resolution, get_historical_data } from '../src/tools/weather-tools.js';
import { get_station_temperature } from '../src/services/weather.js';
import { installCacheStub } from './helpers/cache-stub.js';

beforeEach(() => {
    installCacheStub();
});

describe('formatObservationTime', () => {
    it('renders an epoch-millisecond instant as ISO 8601', () => {
        expect(formatObservationTime({ date: 1788742800000 })).toBe('2026-09-07T01:00:00Z');
    });

    it('prefers the ref day of an aggregate value', () => {
        expect(formatObservationTime({ from: 1788652801000, to: 1788739200000, ref: '2026-09-06' }))
            .toBe('2026-09-06');
    });

    it('falls back to the interval start when there is no ref', () => {
        expect(formatObservationTime({ from: 1788652801000, to: 1788739200000 }))
            .toContain('2026-09-0');
    });

    it('passes an already-formatted string through', () => {
        expect(formatObservationTime({ date: '2026-09-06T09:00:00Z' })).toBe('2026-09-06T09:00:00Z');
    });

    it('says so rather than printing undefined', () => {
        expect(formatObservationTime({})).toBe('unknown time');
        expect(formatObservationTime(null)).toBe('unknown time');
    });
});

const stubJson = (payload) => vi.fn(async () => new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' }
}));

describe('latest readings', () => {
    it('renders an hourly temperature time readably', async () => {
        globalThis.fetch = stubJson({
            station: { name: 'Arvidsjaur A' },
            value: [{ date: 1788742800000, value: '4.7', quality: 'G' }]
        });
        const res = await get_station_temperature('159880');
        expect(res.text).not.toMatch(/\d{13}/);
        expect(res.text).toContain('2026-09-07T01:00:00Z');
    });

    it('renders an aggregate parameter that has no date field', async () => {
        globalThis.fetch = stubJson({
            station: { name: 'Arvidsjaur A' },
            value: [{ from: 1788652801000, to: 1788739200000, ref: '2026-09-06', value: '6.2', quality: 'Y' }]
        });
        const res = await get_temperature_multi_resolution('159880', '2', 'latest-day');
        expect(res.text).not.toContain('undefined');
        expect(res.text).toContain('2026-09-06');
    });
});

describe('get_historical_data across periods', () => {
    const METADATA = {
        title: 'Lufttemperatur - Arvidsjaur A: data',
        data: [{
            link: [
                { type: 'application/json', href: 'https://smhi.example/latest-day/data.json' },
                { type: 'text/plain', href: 'https://smhi.example/latest-day/data.csv' }
            ]
        }]
    };
    const OBSERVATIONS = {
        station: { name: 'Arvidsjaur A' },
        value: Array.from({ length: 25 }, (_, i) => ({
            date: Date.UTC(2026, 8, 6, i) , value: String(i), quality: 'G'
        }))
    };

    it('uses the JSON feed for latest-day, which is all SMHI serves there', async () => {
        globalThis.fetch = vi.fn(async (url) => {
            if (String(url).endsWith('.csv')) {
                // What SMHI actually answers for the latest-* periods.
                return new Response('Not Acceptable', { status: 406 });
            }
            if (String(url).endsWith('data.json')) {
                return new Response(JSON.stringify(OBSERVATIONS), { headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify(METADATA), { headers: { 'Content-Type': 'application/json' } });
        });

        const res = await get_historical_data('159880', '1', 'latest-day', 3, null, true);
        expect(res.isError).toBeUndefined();
        expect(res.text).toContain('Showing 3 of 25');
        expect(res.totalCount).toBe(25);
    });

    it('paginates and filters the JSON feed like the CSV one', async () => {
        globalThis.fetch = vi.fn(async (url) => {
            if (String(url).endsWith('.csv')) return new Response('Not Acceptable', { status: 406 });
            if (String(url).endsWith('data.json')) {
                return new Response(JSON.stringify(OBSERVATIONS), { headers: { 'Content-Type': 'application/json' } });
            }
            return new Response(JSON.stringify(METADATA), { headers: { 'Content-Type': 'application/json' } });
        });

        const first = await get_historical_data('159880', '1', 'latest-day', 3, null, true);
        const second = await get_historical_data('159880', '1', 'latest-day', 3, first.nextCursor, true);
        expect(first.text).toContain('24');
        expect(second.text).toContain('21');
        expect(second.text).toContain('Previous page cursor');
    });
});
