// Shared parameter utilities for SMHI MCP server
import { SMHIParameter } from '../config/constants.js';

/**
 * Get human-readable description for SMHI parameter codes
 */
export function getParameterDescription(parameter, includeUnit = false) {
    const descriptions = {
        [SMHIParameter.AIR_TEMP]: "hourly temperature",
        [SMHIParameter.DAILY_TEMP_MEAN]: "daily mean temperature",
        [SMHIParameter.DAILY_TEMP_MIN]: "daily minimum temperature", 
        [SMHIParameter.DAILY_TEMP_MAX]: "daily maximum temperature",
        [SMHIParameter.MONTHLY_TEMP]: "monthly temperature",
        [SMHIParameter.DAILY_PRECIP]: "daily precipitation",
        [SMHIParameter.HOURLY_PRECIP]: "hourly precipitation", 
        [SMHIParameter.PRECIPITATION_15MIN]: "15-minute precipitation",
        [SMHIParameter.MONTHLY_PRECIP]: "monthly precipitation",
        [SMHIParameter.SNOW_DEPTH]: "snow depth"
    };
    
    const description = descriptions[parameter] || `parameter ${parameter}`;
    
    if (includeUnit) {
        const unit = getParameterUnit(parameter);
        return unit ? `${description} (${unit})` : description;
    }
    
    return description;
}

/**
 * Get unit for SMHI parameter codes
 */
export function getParameterUnit(parameter) {
    const paramStr = String(parameter);

    // Temperature parameters
    if ([SMHIParameter.AIR_TEMP, SMHIParameter.DAILY_TEMP_MEAN,
         SMHIParameter.DAILY_TEMP_MIN, SMHIParameter.DAILY_TEMP_MAX,
         SMHIParameter.MONTHLY_TEMP].includes(paramStr)) {
        return "°C";
    }

    // Precipitation parameters
    if ([SMHIParameter.DAILY_PRECIP, SMHIParameter.HOURLY_PRECIP,
         SMHIParameter.PRECIPITATION_15MIN, SMHIParameter.MONTHLY_PRECIP].includes(paramStr)) {
        return "mm";
    }

    // Snow depth
    if (paramStr === SMHIParameter.SNOW_DEPTH) {
        return "m";
    }

    return "";
}

/**
 * Get friendly name for SMHI parameter codes (for display purposes)
 */
export function getParameterName(parameter) {
    const names = {
        [SMHIParameter.AIR_TEMP]: "Temperature",
        [SMHIParameter.DAILY_TEMP_MEAN]: "Daily mean temperature",
        [SMHIParameter.DAILY_TEMP_MIN]: "Daily minimum temperature", 
        [SMHIParameter.DAILY_TEMP_MAX]: "Daily maximum temperature",
        [SMHIParameter.MONTHLY_TEMP]: "Monthly mean temperature",
        [SMHIParameter.DAILY_PRECIP]: "Daily precipitation",
        [SMHIParameter.HOURLY_PRECIP]: "Hourly precipitation",
        [SMHIParameter.PRECIPITATION_15MIN]: "15-minute precipitation",
        [SMHIParameter.MONTHLY_PRECIP]: "Monthly precipitation",
        [SMHIParameter.SNOW_DEPTH]: "Snow depth"
    };
    
    return names[parameter] || `Parameter ${parameter}`;
}

/**
 * Standard error response formatter.
 *
 * Sets `isError` so the transport can mark the tool result as failed. Without
 * it every failure reached the client as ordinary text and read as an answer.
 */
export function createErrorResponse(message, context = {}) {
    const { station_id, parameter, operation } = context;

    let fullMessage = message;
    if (station_id) {
        fullMessage = `Error for station ${station_id}`;
        if (parameter) {
            fullMessage += `, parameter ${parameter}`;
        }
        if (operation) {
            fullMessage += ` (${operation})`;
        }
        fullMessage += `: ${message}`;
    } else if (!/^Error\b/.test(fullMessage)) {
        fullMessage = `Error: ${fullMessage}`;
    }

    return {
        type: "text",
        text: fullMessage,
        isError: true
    };
}
