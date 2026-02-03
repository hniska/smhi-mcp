// Response builder utilities for SMHI MCP server
// Provides structured responses with summary, data, next_actions, warnings, and trace_id

/**
 * Generate a unique trace ID for request tracking
 */
export function generateTraceId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
        id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `smhi-${id}`;
}

/**
 * Create a next action suggestion
 * @param {string} tool - Tool name to suggest
 * @param {Object} args - Arguments for the tool
 * @param {string} description - Human-readable description
 */
export function createNextAction(tool, args, description) {
    return { tool, args, description };
}

/**
 * Build a structured success response
 * @param {Object} options - Response options
 * @param {string} options.summary - Human-readable summary (required)
 * @param {Object} options.data - Structured data payload
 * @param {Array} options.nextActions - Suggested follow-up actions
 * @param {Array} options.warnings - Warning messages
 * @param {string} options.traceId - Request trace ID (auto-generated if not provided)
 */
export function buildResponse({ summary, data = {}, nextActions = [], warnings = [], traceId = null }) {
    const response = {
        summary,
        data,
        next_actions: nextActions,
        warnings,
        trace_id: traceId || generateTraceId()
    };

    return {
        type: "text",
        text: JSON.stringify(response, null, 2)
    };
}

/**
 * Build a structured error response with actionable suggestions
 * @param {Object} options - Error options
 * @param {string} options.code - Error code (e.g., 'STATION_NOT_FOUND')
 * @param {string} options.message - Error message
 * @param {string} options.summary - Human-readable summary
 * @param {Array} options.nextActions - Suggested actions to resolve the error
 * @param {string} options.traceId - Request trace ID
 */
export function buildErrorResponse({ code, message, summary = null, nextActions = [], traceId = null }) {
    const response = {
        summary: summary || `Error: ${message}`,
        error: {
            code,
            message
        },
        next_actions: nextActions,
        trace_id: traceId || generateTraceId()
    };

    return {
        type: "text",
        text: JSON.stringify(response, null, 2)
    };
}

/**
 * Common error codes for SMHI MCP
 */
export const ErrorCode = {
    STATION_NOT_FOUND: 'STATION_NOT_FOUND',
    LOCATION_NOT_FOUND: 'LOCATION_NOT_FOUND',
    NO_DATA_AVAILABLE: 'NO_DATA_AVAILABLE',
    INVALID_PARAMETER: 'INVALID_PARAMETER',
    INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
    API_ERROR: 'API_ERROR',
    INVALID_COORDINATES: 'INVALID_COORDINATES',
    NO_STATIONS_IN_RANGE: 'NO_STATIONS_IN_RANGE'
};

/**
 * Format temperature with unit
 */
export function formatTemperature(value) {
    if (value === null || value === undefined) return 'N/A';
    return `${value}°C`;
}

/**
 * Format snow depth with unit
 */
export function formatSnowDepth(value) {
    if (value === null || value === undefined) return 'N/A';
    // SMHI reports snow depth in meters
    return `${value}m`;
}

/**
 * Format precipitation with unit
 */
export function formatPrecipitation(value) {
    if (value === null || value === undefined) return 'N/A';
    return `${value}mm`;
}

/**
 * Format wind speed with unit
 */
export function formatWindSpeed(value) {
    if (value === null || value === undefined) return 'N/A';
    return `${value}m/s`;
}

/**
 * Format date for display
 */
export function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Format coordinates for display
 */
export function formatCoordinates(lat, lon) {
    if (lat === null || lat === undefined || lon === null || lon === undefined) {
        return 'N/A';
    }
    return `${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`;
}

/**
 * Generate temperature warning based on value
 */
export function getTemperatureWarning(temp) {
    if (temp === null || temp === undefined) return null;
    if (temp <= -25) return `Extreme cold warning: ${temp}°C - Risk of frostbite, limit outdoor exposure`;
    if (temp <= -15) return `Cold warning: ${temp}°C - Dress warmly, risk of frostbite on exposed skin`;
    if (temp >= 30) return `Heat warning: ${temp}°C - Stay hydrated, seek shade`;
    return null;
}

/**
 * Generate snow depth warning based on value
 */
export function getSnowDepthWarning(depth) {
    if (depth === null || depth === undefined) return null;
    if (depth < 0.1) return `Low snow warning: Only ${depth}m of snow - May not be suitable for snowmobiling`;
    if (depth > 1.5) return `Deep snow: ${depth}m - Be aware of avalanche risk in mountainous terrain`;
    return null;
}
