// Enum mappings for SMHI MCP server
// Replaces magic numbers with human-readable enums

import { SMHIParameter, SMHIPeriod } from './constants.js';

// Data type enum mapping
export const DataType = {
    TEMPERATURE: 'temperature',
    PRECIPITATION: 'precipitation',
    SNOW_DEPTH: 'snow_depth'
};

// Map human-readable data types to SMHI parameter IDs
export const DATA_TYPE_TO_PARAMETER = {
    [DataType.TEMPERATURE]: SMHIParameter.AIR_TEMP,
    [DataType.PRECIPITATION]: SMHIParameter.DAILY_PRECIP,
    [DataType.SNOW_DEPTH]: SMHIParameter.SNOW_DEPTH
};

// Map for temperature resolution variants
export const TEMPERATURE_PARAMETERS = {
    hourly: SMHIParameter.AIR_TEMP,
    daily_mean: SMHIParameter.DAILY_TEMP_MEAN,
    daily_min: SMHIParameter.DAILY_TEMP_MIN,
    daily_max: SMHIParameter.DAILY_TEMP_MAX,
    monthly: SMHIParameter.MONTHLY_TEMP
};

// Map for precipitation resolution variants
export const PRECIPITATION_PARAMETERS = {
    daily: SMHIParameter.DAILY_PRECIP,
    hourly: SMHIParameter.HOURLY_PRECIP,
    '15min': SMHIParameter.PRECIPITATION_15MIN,
    monthly: SMHIParameter.MONTHLY_PRECIP
};

// Time range enum mapping
export const TimeRange = {
    CURRENT: 'current',
    TODAY: 'today',
    THIS_MONTH: 'this_month',
    HISTORICAL: 'historical'
};

// Map human-readable time ranges to SMHI periods
export const TIME_RANGE_TO_PERIOD = {
    [TimeRange.CURRENT]: SMHIPeriod.LATEST_HOUR,
    [TimeRange.TODAY]: SMHIPeriod.LATEST_DAY,
    [TimeRange.THIS_MONTH]: SMHIPeriod.LATEST_MONTHS,
    [TimeRange.HISTORICAL]: SMHIPeriod.CORRECTED_ARCHIVE
};

// Region enum for snowmobile conditions
export const Region = {
    ARCTIC_MOUNTAIN: 'arctic_mountain',
    MOUNTAIN: 'mountain',
    NORTHERN_SWEDEN: 'northern_sweden',
    COASTAL: 'coastal',
    ALL: 'all'
};

// Map region enum to internal region names
export const REGION_DISPLAY_NAMES = {
    [Region.ARCTIC_MOUNTAIN]: 'Arctic/Mountain',
    [Region.MOUNTAIN]: 'Mountain',
    [Region.NORTHERN_SWEDEN]: 'Northern Sweden',
    [Region.COASTAL]: 'Coastal',
    [Region.ALL]: 'All Regions'
};

// Search type enum for find_stations
export const SearchType = {
    NAME: 'name',
    COORDINATES: 'coordinates',
    REGION: 'region'
};

// Validation helpers

/**
 * Validate data type enum value
 */
export function isValidDataType(value) {
    return Object.values(DataType).includes(value);
}

/**
 * Validate time range enum value
 */
export function isValidTimeRange(value) {
    return Object.values(TimeRange).includes(value);
}

/**
 * Validate region enum value
 */
export function isValidRegion(value) {
    return Object.values(Region).includes(value);
}

/**
 * Get SMHI parameter from data type
 */
export function getParameterFromDataType(dataType, resolution = null) {
    if (dataType === DataType.TEMPERATURE && resolution) {
        return TEMPERATURE_PARAMETERS[resolution] || SMHIParameter.AIR_TEMP;
    }
    if (dataType === DataType.PRECIPITATION && resolution) {
        return PRECIPITATION_PARAMETERS[resolution] || SMHIParameter.DAILY_PRECIP;
    }
    return DATA_TYPE_TO_PARAMETER[dataType];
}

/**
 * Get SMHI period from time range
 */
export function getPeriodFromTimeRange(timeRange) {
    return TIME_RANGE_TO_PERIOD[timeRange] || SMHIPeriod.LATEST_HOUR;
}
