// Timestamp rendering for SMHI observation values.
//
// The metobs API reports instants as epoch milliseconds, and the shape of a
// value depends on the parameter:
//
//   instantaneous (hourly temp, snow depth):  { date, value, quality }
//   aggregate (daily mean/min/max, monthly):  { from, to, ref, value, quality }
//
// Reading `.date` for both printed the epoch number for the first and
// "undefined" for the second.

/**
 * Human-readable time for one SMHI observation value.
 *
 * @param {{date?: number|string, from?: number|string, to?: number|string, ref?: string}} [value]
 * @returns {string} ISO 8601 instant, an ISO day for aggregates, or
 *   "unknown time" when the value carries no usable timestamp.
 */
export function formatObservationTime(value) {
    if (!value || typeof value !== 'object') return 'unknown time';

    // `ref` is the day an aggregate belongs to, and is already formatted.
    if (typeof value.ref === 'string' && value.ref) return value.ref;

    const instant = value.date ?? value.from ?? value.to;
    if (instant === null || instant === undefined || instant === '') return 'unknown time';

    // Anything already textual is passed through: SMHI's CSV exports and some
    // endpoints hand back formatted strings rather than epoch numbers.
    if (typeof instant === 'string' && !/^\d+$/.test(instant)) return instant;

    const millis = Number(instant);
    if (!Number.isFinite(millis)) return String(instant);

    const iso = new Date(millis).toISOString();
    return Number.isNaN(new Date(millis).getTime()) ? String(instant) : iso.replace('.000Z', 'Z');
}
