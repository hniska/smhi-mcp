// Tool handler registry for SMHI MCP server
import * as outcomeTools from './outcome-tools.js';

export const toolHandlers = {
    // Outcome-oriented tools (new)
    check_weather: outcomeTools.check_weather,
    get_snowmobile_conditions: outcomeTools.get_snowmobile_conditions,
    find_stations: outcomeTools.find_stations,
    get_weather_history: outcomeTools.get_weather_history,
    get_station_info: outcomeTools.get_station_info,
    list_regions: outcomeTools.list_regions
};
