// String manipulation utilities for search and matching

/**
 * Levenshtein edit distance.
 *
 * Keeps two rows rather than the full (m+1)x(n+1) matrix: a search scores every
 * station name in the parameter list, so the per-call allocation mattered.
 */
export function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    if (m === 0) return n;
    if (n === 0) return m;

    let previous = new Array(m + 1);
    let current = new Array(m + 1);
    for (let j = 0; j <= m; j++) previous[j] = j;

    for (let i = 1; i <= n; i++) {
        current[0] = i;
        const c2 = str2.charCodeAt(i - 1);
        for (let j = 1; j <= m; j++) {
            const cost = str1.charCodeAt(j - 1) === c2 ? 0 : 1;
            const substitution = previous[j - 1] + cost;
            const insertion = current[j - 1] + 1;
            const deletion = previous[j] + 1;
            current[j] = substitution < insertion
                ? (substitution < deletion ? substitution : deletion)
                : (insertion < deletion ? insertion : deletion);
        }
        const swap = previous;
        previous = current;
        current = swap;
    }

    return previous[m];
}

/**
 * Similarity score in [0, 1], where 1 means identical.
 */
export function calculateSimilarity(str1, str2) {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1.0;

    // The distance is at least the length difference, so a name that can never
    // clear a caller's threshold need not be scored at all.
    const minDistance = Math.abs(str1.length - str2.length);
    if (minDistance >= maxLen) return 0;

    const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return 1.0 - (distance / maxLen);
}

/**
 * Normalize Swedish characters for better matching
 */
export function normalizeSwedish(str) {
    return String(str ?? '').toLowerCase()
        .replace(/[åä]/g, 'a')
        .replace(/ö/g, 'o')
        .replace(/[éè]/g, 'e');
}