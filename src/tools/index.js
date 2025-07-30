// Tool handler registry for SMHI MCP server
import * as weatherTools from './weather-tools.js';
import { get_station_temperature, get_station_snow_depth, get_weather_forecast } from '../services/weather.js';

export const toolHandlers = {
    // Core weather services
    get_station_temperature,
    get_station_snow_depth, 
    get_weather_forecast,
    
    // Snowmobile and legacy station listings
    list_snowmobile_conditions: weatherTools.list_snowmobile_conditions,
    list_temperature_stations: weatherTools.list_temperature_stations,
    list_snow_depth_stations: weatherTools.list_snow_depth_stations,
    
    // Multi-resolution data access
    get_station_precipitation: weatherTools.get_station_precipitation,
    get_temperature_multi_resolution: weatherTools.get_temperature_multi_resolution,
    get_station_metadata: weatherTools.get_station_metadata,
    get_historical_data: weatherTools.get_historical_data,
    
    // Station discovery and pagination
    list_all_temperature_stations: weatherTools.list_all_temperature_stations,
    list_all_snow_depth_stations: weatherTools.list_all_snow_depth_stations,
    list_all_precipitation_stations: weatherTools.list_all_precipitation_stations,
    
    // Station search functionality
    search_stations_by_name: weatherTools.search_stations_by_name,
    search_stations_by_name_multi_param: weatherTools.search_stations_by_name_multi_param
};