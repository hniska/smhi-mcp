// SMHI API configuration and constants

export const SMHIParameter = {
    AIR_TEMP: '1',        // Air temperature (hourly)
    AVG_TEMP: '2',        // Air temperature (daily mean)
    DAILY_PRECIP: '5',    // Precipitation (daily)
    HOURLY_PRECIP: '7',   // Precipitation (hourly)
    SNOW_DEPTH: '8',      // Snow depth (daily)
    MIN_TEMP: '19',       // Air temperature (daily minimum)
    MAX_TEMP: '20',       // Air temperature (daily maximum)
    MONTHLY_TEMP: '22',   // Air temperature (monthly mean)
    MONTHLY_PRECIP: '23', // Precipitation (monthly)
    PRECIP_15MIN: '14'    // Precipitation (15-minute)
};

export const SMHIPeriod = {
    LATEST_HOUR: 'latest-hour',
    LATEST_DAY: 'latest-day', 
    LATEST_MONTHS: 'latest-months',
    CORRECTED_ARCHIVE: 'corrected-archive'
};

export const METOBS_BASE_URL = 'https://opendata-download-metobs.smhi.se/api/version/1.0';
export const METFCST_BASE_URL = 'https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2';

// Cache TTL settings (in seconds)  
export const CACHE_TTL = {
    current: 900,     // 15 minutes for current data
    historical: 86400, // 24 hours for historical data
    metadata: 604800,  // 1 week for station metadata
    forecast: 1800,    // 30 minutes for forecasts
    
    // R2 cache times (in seconds)
    r2_csv: 86400,     // 24 hours for CSV files
    r2_recent_csv: 3600, // 1 hour for recent year data
    r2_old_csv: 604800,   // 1 week for data older than 2 years
    
    // Additional cache settings
    LATEST_DATA: 300   // 5 minutes (used in some places)
};

// Request limits for free tier
export const REQUEST_LIMITS = {
    MAX_REQUESTS_PER_MINUTE: 30,
    COUNTER_KEY: 'request_counter'
};

// MCP Protocol configuration
export const MCP_CONFIG = {
    PROTOCOL_VERSION: '2025-06-18',
    SERVER_NAME: 'smhi-mcp',
    SERVER_VERSION: '1.0.0'
};