// Tool handler registry for SMHI MCP server
import * as weatherTools from './weather-tools.js';
import { get_station_temperature, get_station_snow_depth, get_weather_forecast } from '../services/weather.js';
import { findNearestStations } from '../utils/geo.js';

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
    search_stations_by_name_multi_param: weatherTools.search_stations_by_name_multi_param,

    // Geographic search
    get_stations_near_location: findNearestStations
};

/**
 * Positional argument order for each handler.
 *
 * The handlers take positional arguments while MCP delivers a named object, so
 * something has to bridge the two. This table is that bridge. It replaces a
 * second switch statement in worker.js that repeated every signature by hand --
 * a tool added to the registry and forgotten there failed only when called.
 * `test/rpc.test.js` now asserts the two stay in step.
 *
 * `ENV` and `CTX` stand for the Worker bindings and execution context.
 */
export const ENV = Symbol('env');
export const CTX = Symbol('ctx');

export const toolArguments = {
    list_snowmobile_conditions: [],
    list_temperature_stations: [],
    list_snow_depth_stations: [],

    get_station_temperature: ['station_id'],
    get_station_snow_depth: ['station_id'],
    get_weather_forecast: ['lat', 'lon', 'fromDate', 'toDate', 'limit'],

    get_station_precipitation: ['station_id', 'parameter', 'period'],
    get_temperature_multi_resolution: ['station_id', 'parameter', 'period'],
    get_station_metadata: ['station_id', 'parameter'],
    get_historical_data: ['station_id', 'parameter', 'period', 'limit', 'cursor',
        'reverse', 'fromDate', 'toDate', ENV, CTX],

    list_all_temperature_stations: ['cursor'],
    list_all_snow_depth_stations: ['cursor'],
    list_all_precipitation_stations: ['parameter', 'cursor'],

    search_stations_by_name: ['query', 'parameter', 'limit', 'threshold', 'active_only'],
    search_stations_by_name_multi_param: ['query', 'limit', 'threshold', 'active_only'],

    get_stations_near_location: ['latitude', 'longitude', 'parameter', 'radius_km',
        'limit', 'active_only']
};
