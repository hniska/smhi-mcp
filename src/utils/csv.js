// Parser for SMHI observation CSV exports.
//
// These files are large: Stockholm's hourly temperature archive is 5.2 MB over
// 204k rows, and a caller normally wants ten of them. The parser therefore
// walks the raw text and materialises objects only for the requested page.
// Splitting into lines and building a row object per line cost ~82ms CPU and
// ~40MB of heap for that file -- above the Workers free-tier CPU limit -- while
// scanning in place costs ~7ms and allocates nothing per row.
//
// Export shape (semicolon separated, UTF-8 BOM, CRLF in places):
//
//     Stationsnamn;Stationsnummer;...        <- metadata blocks
//     Tidsperiod (fr.o.m);...                <- position history, dates use a
//     1967-12-01 00:00:00;1991-09-30 ...        SPACE at offset 10
//     Datum;Tid (UTC);Lufttemperatur;Kvalitet;;Tidsutsnitt:
//     1967-12-01;06:00:00;0.2;G;;<comment>   <- observations, ';' at offset 10

const SEMICOLON = 59;
const HYPHEN = 45;
const PLUS = 43;
const DOT = 46;
const ZERO = 48;
const NINE = 57;
const CARRIAGE_RETURN = 13;

/**
 * True when the text at `start` begins `YYYY-MM-DD;`.
 *
 * The trailing semicolon is what separates an observation row from the
 * position-history block above it, whose dates are followed by a space.
 */
function isObservationRow(text, start, end) {
    if (end - start < 11 || text.charCodeAt(start + 10) !== SEMICOLON) return false;
    for (let i = 0; i < 10; i++) {
        const code = text.charCodeAt(start + i);
        if (i === 4 || i === 7) {
            if (code !== HYPHEN) return false;
        } else if (code < ZERO || code > NINE) {
            return false;
        }
    }
    return true;
}

/**
 * End offset of the value field on an observation row, or -1 when the row has
 * no usable measurement.
 *
 * Rows with an empty value column appear in real exports. They must be rejected
 * in the counting pass as well as the page pass, otherwise `total` and the row
 * indices used for pagination disagree and pages come back short.
 *
 * The numeric check runs on character codes so the counting pass allocates
 * nothing per row.
 */
function valueFieldEnd(text, start, end) {
    const timeEnd = text.indexOf(';', start + 11);
    if (timeEnd === -1 || timeEnd >= end) return -1;

    let valueEnd = text.indexOf(';', timeEnd + 1);
    if (valueEnd === -1 || valueEnd > end) valueEnd = end;

    let i = timeEnd + 1;
    if (i >= valueEnd) return -1;

    const sign = text.charCodeAt(i);
    if (sign === HYPHEN || sign === PLUS) i++;

    let digits = 0;
    while (i < valueEnd && text.charCodeAt(i) >= ZERO && text.charCodeAt(i) <= NINE) { i++; digits++; }
    if (i < valueEnd && text.charCodeAt(i) === DOT) {
        i++;
        while (i < valueEnd && text.charCodeAt(i) >= ZERO && text.charCodeAt(i) <= NINE) { i++; digits++; }
    }
    if (digits === 0 || i !== valueEnd) return -1;

    return valueEnd;
}

/** Offset of the first observation row, or `text.length` if there is none. */
function findDataStart(text) {
    // Preferred: the column header that introduces the observation block.
    const header = text.indexOf('Datum;Tid');
    if (header !== -1) {
        const eol = text.indexOf('\n', header);
        if (eol !== -1) return eol + 1;
    }

    // Some exports omit the header. Sniff for the first line that looks like an
    // observation row. The previous implementation matched /^202[0-9]-/ here,
    // which missed every archive starting before 2020 and would have broken
    // outright in 2030.
    let pos = 0;
    while (pos < text.length) {
        let eol = text.indexOf('\n', pos);
        if (eol === -1) eol = text.length;
        if (isObservationRow(text, pos, eol)) return pos;
        pos = eol + 1;
    }
    return text.length;
}

/** `YYYY-MM-DD` from a date-only or full ISO 8601 bound. */
function toDayBound(value, label) {
    if (value === null || value === undefined || value === '') return null;
    const text = value instanceof Date ? value.toISOString() : String(value);
    const day = text.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) {
        throw new Error(`Invalid ${label}: "${text}". Use ISO 8601, for example 2024-01-31.`);
    }
    return day;
}

/**
 * Turn one observation line into a row object.
 *
 * Only ever called for rows on the requested page, so the cost of splitting is
 * paid `limit` times rather than once per row in the file.
 */
function parseRow(text, start, end) {
    const valueEnd = valueFieldEnd(text, start, end);
    if (valueEnd === -1) return null;

    const date = text.slice(start, start + 10);
    const timeEnd = text.indexOf(';', start + 11);
    const time = text.slice(start + 11, timeEnd);
    const value = Number.parseFloat(text.slice(timeEnd + 1, valueEnd));

    let quality = 'Unknown';
    if (valueEnd < end) {
        let qualityEnd = text.indexOf(';', valueEnd + 1);
        if (qualityEnd === -1 || qualityEnd > end) qualityEnd = end;
        quality = text.slice(valueEnd + 1, qualityEnd).trim() || 'Unknown';
    }

    return {
        date: time ? `${date} ${time}` : date,
        value,
        quality
    };
}

/**
 * Read one page of observations out of an SMHI CSV export.
 *
 * @param {string} csvText Raw export.
 * @param {object} [options]
 * @param {string|Date} [options.fromDate] Inclusive lower bound (ISO 8601).
 * @param {string|Date} [options.toDate] Inclusive upper bound; a date-only
 *   value covers the whole of that day.
 * @param {number} [options.limit=10] Rows per page.
 * @param {number} [options.offset=0] Rows to skip from the near end.
 * @param {boolean} [options.reverse=true] Newest first.
 * @returns {{rows: Array<{date: string, value: number, quality: string}>,
 *            total: number, unfilteredTotal: number, hasMore: boolean}}
 *   `total` counts rows matching the date filter, `unfilteredTotal` all rows.
 * @throws {Error} If a date bound cannot be parsed.
 */
export function parseObservationPage(csvText, options = {}) {
    const {
        fromDate = null,
        toDate = null,
        limit = 10,
        offset = 0,
        reverse = true
    } = options;

    const from = toDayBound(fromDate, 'fromDate');
    const to = toDayBound(toDate, 'toDate');
    const filtering = from !== null || to !== null;
    const pageSize = Math.max(1, Math.floor(limit) || 10);
    const skip = Math.max(0, Math.floor(offset) || 0);

    const text = csvText;
    const length = text.length;

    // Forward pages are a known index window. Reverse pages are relative to the
    // newest row, whose index is only known once the scan ends, so keep a ring
    // buffer of the last `skip + pageSize` matching rows and take the window
    // from it afterwards. Either way the file is scanned once.
    const windowStart = reverse ? 0 : skip;
    const windowEnd = reverse ? skip + pageSize : skip + pageSize;
    const ring = [];

    let unfilteredTotal = 0;
    let total = 0;
    let pos = findDataStart(text);

    while (pos < length) {
        let eol = text.indexOf('\n', pos);
        if (eol === -1) eol = length;
        const rowEnd = eol > pos && text.charCodeAt(eol - 1) === CARRIAGE_RETURN ? eol - 1 : eol;

        if (isObservationRow(text, pos, rowEnd)) {
            const valueEnd = valueFieldEnd(text, pos, rowEnd);
            if (valueEnd !== -1) {
                unfilteredTotal++;

                let inRange = true;
                if (filtering) {
                    const day = text.slice(pos, pos + 10);
                    inRange = (!from || day >= from) && (!to || day <= to);
                }

                if (inRange) {
                    if (reverse) {
                        // Keep the tail; the wanted window is inside it.
                        ring.push(pos);
                        if (ring.length > windowEnd) ring.shift();
                    } else if (total >= windowStart && total < windowEnd) {
                        ring.push(pos);
                    }
                    total++;
                }
            }
        }
        pos = eol + 1;
    }

    // Reverse: the ring holds indices [total - ring.length, total). Drop the
    // `skip` newest, then present newest first.
    let offsets = ring;
    if (reverse) {
        const end = Math.max(0, ring.length - skip);
        offsets = ring.slice(Math.max(0, end - pageSize), end).reverse();
    }

    const rows = [];
    for (const rowStart of offsets) {
        let eol = text.indexOf('\n', rowStart);
        if (eol === -1) eol = length;
        const rowEnd = eol > rowStart && text.charCodeAt(eol - 1) === CARRIAGE_RETURN ? eol - 1 : eol;
        const row = parseRow(text, rowStart, rowEnd);
        if (row) rows.push(row);
    }

    const pageStart = reverse ? Math.max(0, total - skip - pageSize) : skip;
    const pageEnd = reverse ? Math.max(0, total - skip) : Math.min(total, skip + pageSize);

    return {
        rows,
        total,
        unfilteredTotal,
        hasMore: reverse ? pageStart > 0 : pageEnd < total
    };
}
