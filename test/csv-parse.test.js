// Regression tests for SMHI observation CSV parsing.
//
// Background: the parser materialised every row of the archive as an object
// before returning a page of 10. Stockholm's temperature archive is 5.2 MB /
// 204k rows, which cost ~82ms CPU and ~40MB of heap per request -- over the
// Workers free-tier CPU limit. It also could not find the data section in
// archives that start before 2020, and dropped the last day of a date range.

import { describe, it, expect } from 'vitest';
import { parseObservationPage } from '../src/utils/csv.js';

// A CSV shaped like the real SMHI export: BOM, metadata blocks, blank lines,
// then a "Datum;Tid (UTC)" header, then rows with a trailing comment column.
const withHeader = (rows) => '﻿Stationsnamn;Stationsnummer;Stationsnät;Mäthöjd (meter över marken)\n' +
    'Glommersträsk;159770;SMHIs stationsnät;2.0\n' +
    '\n' +
    'Parameternamn;Beskrivning;Enhet\n' +
    'Lufttemperatur;momentanvärde, 1 gång/tim;celsius\n' +
    '\n' +
    'Tidsperiod (fr.o.m);Tidsperiod (t.o.m);Höjd (meter över havet);Latitud (decimalgrader);Longitud (decimalgrader)\n' +
    '1967-12-01 00:00:00;1991-09-30 23:59:59;375.0;65.2653;19.6458\n' +
    '\n' +
    'Datum;Tid (UTC);Lufttemperatur;Kvalitet;;Tidsutsnitt:\n' +
    rows.join('\n') + '\n';

const day = (d, v) => `${d};06:00:00;${v};G`;

describe('data section detection', () => {
    it('finds rows dated before 2020', () => {
        const csv = withHeader(['1967-12-01;06:00:00;0.2;G', '1967-12-02;06:00:00;-2.0;G']);
        const page = parseObservationPage(csv, { limit: 10, reverse: false });
        expect(page.total).toBe(2);
        expect(page.rows[0]).toMatchObject({ date: '1967-12-01 06:00:00', value: 0.2, quality: 'G' });
    });

    it('finds rows dated after 2029', () => {
        const csv = withHeader([day('2031-03-04', 1.5)]);
        const page = parseObservationPage(csv, { limit: 10, reverse: false });
        expect(page.total).toBe(1);
        expect(page.rows[0].value).toBe(1.5);
    });

    it('falls back to row sniffing when the header line is absent', () => {
        // corrected-archive exports without the Datum;Tid header still carry rows.
        const csv = 'Stationsnamn;Stationsnummer\nGlommersträsk;159770\n\n1961-01-01;06:00:00;-9.9;G\n';
        const page = parseObservationPage(csv, { limit: 10, reverse: false });
        expect(page.total).toBe(1);
        expect(page.rows[0].date).toBe('1961-01-01 06:00:00');
    });

    it('does not mistake the position block for observation rows', () => {
        const csv = withHeader([day('2024-01-01', 1)]);
        // The position block contains "1967-12-01 00:00:00;..." lines, which are
        // dates but use a space, not ';', as the 11th character.
        expect(parseObservationPage(csv, { limit: 10, reverse: false }).total).toBe(1);
    });
});

describe('date filtering', () => {
    const csv = withHeader([
        day('2023-12-31', -5), day('2024-01-01', 1), day('2024-06-15', 15), day('2024-12-31', -2), day('2025-01-01', 0)
    ]);

    it('includes the whole of the toDate day', () => {
        const page = parseObservationPage(csv, { fromDate: '2024-01-01', toDate: '2024-12-31', limit: 10, reverse: false });
        expect(page.total).toBe(3);
        expect(page.rows.map(r => r.value)).toEqual([1, 15, -2]);
    });

    it('accepts full ISO timestamps as bounds', () => {
        const page = parseObservationPage(csv, { fromDate: '2024-06-15T00:00:00Z', toDate: '2024-06-15T23:59:59Z', limit: 10, reverse: false });
        expect(page.total).toBe(1);
    });

    it('reports the unfiltered total alongside the filtered one', () => {
        const page = parseObservationPage(csv, { fromDate: '2024-01-01', limit: 10, reverse: false });
        expect(page.unfilteredTotal).toBe(5);
        expect(page.total).toBe(4);
    });

    it('rejects an unparseable date bound', () => {
        expect(() => parseObservationPage(csv, { fromDate: 'last tuesday', limit: 10 }))
            .toThrow(/fromDate/);
    });
});

describe('pagination', () => {
    const csv = withHeader(Array.from({ length: 25 }, (_, i) =>
        day(`2024-01-${String(i + 1).padStart(2, '0')}`, i)));

    it('returns newest first in reverse mode', () => {
        const page = parseObservationPage(csv, { limit: 10, reverse: true });
        expect(page.rows.map(r => r.value)).toEqual([24, 23, 22, 21, 20, 19, 18, 17, 16, 15]);
    });

    it('walks reverse pages without gaps or repeats', () => {
        const first = parseObservationPage(csv, { limit: 10, reverse: true, offset: 0 });
        const second = parseObservationPage(csv, { limit: 10, reverse: true, offset: 10 });
        const third = parseObservationPage(csv, { limit: 10, reverse: true, offset: 20 });
        expect(second.rows.map(r => r.value)).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
        expect(third.rows.map(r => r.value)).toEqual([4, 3, 2, 1, 0]);
        expect(third.hasMore).toBe(false);
        expect(first.hasMore).toBe(true);
    });

    it('walks forward pages', () => {
        const page = parseObservationPage(csv, { limit: 10, reverse: false, offset: 20 });
        expect(page.rows.map(r => r.value)).toEqual([20, 21, 22, 23, 24]);
        expect(page.hasMore).toBe(false);
    });

    it('returns an empty page past the end rather than wrapping around', () => {
        const page = parseObservationPage(csv, { limit: 10, reverse: true, offset: 100 });
        expect(page.rows).toEqual([]);
        expect(page.total).toBe(25);
    });
});

describe('malformed rows', () => {
    it('skips rows with an empty value field', () => {
        const csv = withHeader(['2024-01-01;06:00:00;;G', day('2024-01-02', 3)]);
        const page = parseObservationPage(csv, { limit: 10, reverse: false });
        expect(page.total).toBe(1);
        expect(page.rows[0].value).toBe(3);
    });

    it('handles CRLF line endings', () => {
        const csv = withHeader([day('2024-01-01', 7)]).replace(/\n/g, '\r\n');
        const page = parseObservationPage(csv, { limit: 10, reverse: false });
        expect(page.total).toBe(1);
        expect(page.rows[0].quality).toBe('G');
    });

    it('defaults a missing quality flag', () => {
        const csv = withHeader(['2024-01-01;06:00:00;7']);
        const page = parseObservationPage(csv, { limit: 10, reverse: false });
        expect(page.rows[0].quality).toBe('Unknown');
    });
});

describe('cost on a full-size archive', () => {
    // 204k rows is the real size of Stockholm's temperature archive.
    const rows = [];
    for (let y = 1950; y < 2026; y++) {
        for (let d = 1; d <= 28; d++) {
            rows.push(day(`${y}-01-${String(d).padStart(2, '0')}`, d));
            rows.push(day(`${y}-02-${String(d).padStart(2, '0')}`, d));
        }
    }
    const csv = withHeader(rows);

    it('reads a page without materialising every row', () => {
        const started = performance.now();
        const page = parseObservationPage(csv, { limit: 10, reverse: true });
        const elapsed = performance.now() - started;
        expect(page.total).toBe(rows.length);
        expect(page.rows).toHaveLength(10);
        // The object-per-row parser took ~80ms for this shape. Allow generous
        // headroom for CI noise while still failing if it regresses.
        expect(elapsed).toBeLessThan(30);
    });
});
