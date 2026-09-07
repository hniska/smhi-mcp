// Weather tool implementations for SMHI MCP server
import { SMHIParameter, SMHIPeriod, CACHE_TTL, METOBS_BASE_URL } from '../config/constants.js';
import { getCachedCSV, setCachedCSV } from '../utils/cache.js';
import { makeSmhiRequest } from '../api/smhi.js';
import { getParameterDescription, getParameterUnit, getParameterName, createErrorResponse } from '../utils/parameters.js';
import { searchStationsByParameter, searchStationsMultiParameter } from '../utils/search.js';
import { listAllStationsForParameter } from '../utils/stations.js';
import { parseObservationPage } from '../utils/csv.js';
import { formatObservationTime } from '../utils/time.js';
import { snowmobileConditionsStations, temperatureStations, snowDepthStations } from '../data/stations.js';

export async function list_snowmobile_conditions() {
    const regionOrder = ["Arctic/Mountain", "Mountain", "Northern Sweden", "Coastal"];
    const stationsByRegion = new Map(regionOrder.map((region) => [region, []]));

    let dualCapability = 0;
    let temperatureOnly = 0;
    let snowDepthOnly = 0;

    for (const [id, info] of Object.entries(snowmobileConditionsStations)) {
        const capabilities = [];
        if (info.hasTemperature) capabilities.push("Temperature");
        if (info.hasSnowDepth) capabilities.push("Snow Depth");

        if (info.hasTemperature && info.hasSnowDepth) dualCapability++;
        else if (info.hasTemperature) temperatureOnly++;
        else if (info.hasSnowDepth) snowDepthOnly++;

        // A station whose region is not one of the four known ones used to
        // throw here rather than simply being listed.
        const region = info.region || "Other";
        if (!stationsByRegion.has(region)) stationsByRegion.set(region, []);
        stationsByRegion.get(region).push({
            id,
            name: info.name,
            capabilities: capabilities.join(" + ") || "None"
        });
    }

    const totalStations = Object.keys(snowmobileConditionsStations).length;

    const regionOutput = [...stationsByRegion.entries()]
        .filter(([, stations]) => stations.length > 0)
        .map(([region, stations]) => {
            stations.sort((a, b) => a.id.localeCompare(b.id));
            return `📍 ${region} (${stations.length} stations):\n` +
                stations.map(s => `  ${s.id}: ${s.name} (${s.capabilities})`).join('\n');
        }).join('\n\n');

    return {
        type: "text",
        text: `🛷 Snowmobile Conditions Monitoring Stations\n\n` +
               `${regionOutput}\n\n` +
               `📊 Summary:\n` +
               `• Total stations: ${totalStations}\n` +
               `• Dual capability (temp + snow): ${dualCapability}\n` +
               `• Temperature only: ${temperatureOnly}\n` +
               `• Snow depth only: ${snowDepthOnly}\n\n` +
               `💡 Use get_station_temperature or get_station_snow_depth with station IDs above.\n` +
               `🔍 Use search_stations_by_name_multi_param to find additional stations.`
    };
}

// Legacy functions for backward compatibility (deprecated)
export async function list_temperature_stations() {
    return {
        type: "text",
        text: `⚠️  DEPRECATED: Use list_snowmobile_conditions instead.\n\nAvailable temperature stations:\n${JSON.stringify(temperatureStations, null, 2)}`
    };
}

export async function list_snow_depth_stations() {
    return {
        type: "text",
        text: `⚠️  DEPRECATED: Use list_snowmobile_conditions instead.\n\nAvailable snow depth stations:\n${JSON.stringify(snowDepthStations, null, 2)}`
    };
}

export async function get_station_precipitation(station_id, parameter = SMHIParameter.DAILY_PRECIP, period = SMHIPeriod.LATEST_DAY) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}/data.json`;
        const cacheKey = `precipitation-${station_id}-${parameter}-${period}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.precipitation);
        
        if (!data.value || data.value.length === 0) {
            return {
                type: "text",
                text: `No precipitation data available for station ${station_id} (parameter ${parameter}, period ${period})`
            };
        }
        
        const latestValue = data.value[data.value.length - 1];
        
        const description = getParameterDescription(parameter);
        const unit = getParameterUnit(parameter);
        
        return {
            type: "text",
            text: `Station ${data.station?.name || station_id} (${station_id}): ${latestValue.value}${unit} ${description} at ${formatObservationTime(latestValue)}`
        };
    } catch (error) {
        return createErrorResponse(error.message, { station_id, parameter, operation: 'fetching precipitation data' });
    }
}

export async function get_temperature_multi_resolution(station_id, parameter = SMHIParameter.AIR_TEMP, period = SMHIPeriod.LATEST_HOUR) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}/data.json`;
        const cacheKey = `temp-multi-${station_id}-${parameter}-${period}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.temperature);
        
        if (!data.value || data.value.length === 0) {
            return {
                type: "text",
                text: `No temperature data available for station ${station_id} (parameter ${parameter}, period ${period})`
            };
        }
        
        const latestValue = data.value[data.value.length - 1];
        
        const description = getParameterDescription(parameter);
        const unit = getParameterUnit(parameter);
        
        return {
            type: "text",
            text: `Station ${data.station?.name || station_id} (${station_id}): ${latestValue.value}${unit} ${description} at ${formatObservationTime(latestValue)}`
        };
    } catch (error) {
        return createErrorResponse(error.message, { station_id, parameter, operation: 'fetching temperature data' });
    }
}

export async function get_station_metadata(station_id, parameter) {
    try {
        const url = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}.json`;
        const cacheKey = `metadata-${station_id}-${parameter}`;
        const data = await makeSmhiRequest(url, cacheKey, CACHE_TTL.metadata);
        
        // Extract station name from title (format: "Parameter - StationName: ...")
        const stationName = data.title?.split(' - ')[1]?.split(':')[0] || 'Unknown';
        
        // Get latest position data (last entry in position array)
        const position = data.position?.[data.position.length - 1] || {};
        
        // Format periods with proper date formatting
        const periods = data.period?.map(p => {
            // Use main data from/to dates for periods since periods don't have their own dates
            const fromDate = data.from ? new Date(data.from).toISOString().split('T')[0] : 'N/A';
            const toDate = data.to ? new Date(data.to).toISOString().split('T')[0] : 'N/A';
            return {
                key: p.key,
                from: fromDate,
                to: toDate,
                summary: p.summary || p.title || ''
            };
        }) || [];
        
        return {
            type: "text",
            text: `Station Metadata\n\n` +
                   `ID: ${data.key}\n` +
                   `Name: ${stationName}\n` +
                   `Parameter: ${parameter}\n` +
                   `Position: ${position.latitude?.toFixed(4)}°N, ${position.longitude?.toFixed(4)}°E\n` +
                   `Height: ${position.height}m\n` +
                   `Owner: ${data.owner}\n\n` +
                   `Available Periods:\n` +
                   periods.map(p => `  • ${p.key}: ${p.from} to ${p.to} (${p.summary})`).join('\n')
        };
    } catch (error) {
        return createErrorResponse(error.message, { station_id, parameter, operation: 'fetching metadata' });
    }
}

/**
 * Decode a pagination cursor into a row offset.
 *
 * Returns `{ offset }` or `{ error }`. The previous version swallowed every
 * decoding failure and fell back to offset 0, or let NaN through, so a bad
 * cursor came back as a confusing empty page instead of a stated problem.
 */
function decodeCursor(cursor) {
    if (cursor === null || cursor === undefined || cursor === '') return { offset: 0 };

    let decoded;
    try {
        decoded = atob(String(cursor));
    } catch {
        return { error: `Invalid cursor "${cursor}". Pass a cursor from a previous response, or omit it to start at the first page.` };
    }

    const offset = Number(decoded);
    if (!Number.isInteger(offset) || offset < 0) {
        return { error: `Invalid cursor "${cursor}". Pass a cursor from a previous response, or omit it to start at the first page.` };
    }
    return { offset };
}

/**
 * Page a decoded `value[]` array from the metobs JSON feed.
 *
 * Mirrors `parseObservationPage` so both feeds produce the same page shape.
 */
function pageJsonObservations(values, { fromDate, toDate, limit, offset, reverse }) {
    const bound = (input, label) => {
        if (input === null || input === undefined || input === '') return null;
        const day = String(input).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) {
            throw new Error(`Invalid ${label}: "${input}". Use ISO 8601, for example 2024-01-31.`);
        }
        return day;
    };
    const from = bound(fromDate, 'fromDate');
    const to = bound(toDate, 'toDate');

    const rows = [];
    for (const value of values) {
        const numeric = Number.parseFloat(value.value);
        if (Number.isNaN(numeric)) continue;
        const date = formatObservationTime(value);
        // toDate covers the whole of its day, matching the CSV path.
        const day = date.slice(0, 10);
        if (from && day < from) continue;
        if (to && day > to) continue;
        rows.push({ date, value: numeric, quality: value.quality || 'Unknown' });
    }

    const total = rows.length;
    const pageStart = reverse ? Math.max(0, total - offset - limit) : offset;
    const pageEnd = reverse ? Math.max(0, total - offset) : Math.min(total, offset + limit);
    const page = rows.slice(pageStart, pageEnd);
    if (reverse) page.reverse();

    return {
        rows: page,
        total,
        unfilteredTotal: values.length,
        hasMore: reverse ? pageStart > 0 : pageEnd < total
    };
}

export async function get_historical_data(station_id, parameter, period, limit = 10, cursor = null, reverse = true, fromDate = null, toDate = null, env = null, ctx = null) {
    const { offset, error: cursorError } = decodeCursor(cursor);
    if (cursorError) {
        return createErrorResponse(cursorError, { station_id, parameter });
    }

    try {
        // First get metadata to find CSV download URL (cache metadata)
        const metadataUrl = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}/period/${period}.json`;
        const metadataCacheKey = `hist-meta-${station_id}-${parameter}-${period}`;
        let metadata;

        try {
            metadata = await makeSmhiRequest(metadataUrl, metadataCacheKey, CACHE_TTL.metadata, ctx);
        } catch (e) {
            // If the specific parameter/period combination fails, check what's available for this station
            try {
                const stationUrl = `${METOBS_BASE_URL}/parameter/${parameter}/station/${station_id}.json`;
                const stationInfo = await makeSmhiRequest(stationUrl);
                const availablePeriods = stationInfo.period?.map(p => p.key) || [];

                return createErrorResponse(
                    `No data available for period ${period}.\n` +
                    `Available periods for this parameter: ${availablePeriods.join(', ') || 'none'}\n` +
                    `Station: ${stationInfo.title || 'Unknown'}`,
                    { station_id, parameter }
                );
            } catch (stationError) {
                // If station doesn't support this parameter at all, suggest checking what parameters are available
                return createErrorResponse(
                    `Station ${station_id} does not support parameter ${parameter}.\n` +
                    `Use search_stations_by_name_multi_param to find what parameters this station supports, or try a different parameter:\n` +
                    `• 1 = hourly temperature\n` +
                    `• 2 = daily mean temperature\n` +
                    `• 5 = daily precipitation\n` +
                    `• 8 = snow depth`
                );
            }
        }

        const links = metadata.data?.[0]?.link ?? [];
        const csvLink = links.find(link =>
            link.type === 'text/plain' && link.href?.includes('data.csv')
        );
        const jsonLink = links.find(link =>
            link.type === 'application/json' && link.href?.includes('data.json')
        );

        // SMHI publishes data.csv only for corrected-archive. The latest-hour,
        // latest-day and latest-months links are advertised in the metadata but
        // answer 406, so those periods read the JSON feed instead. Without this
        // the tool failed for three of the four periods it documents.
        const useCsv = period === SMHIPeriod.CORRECTED_ARCHIVE && Boolean(csvLink);

        if (!useCsv && !jsonLink) {
            return createErrorResponse(`No downloadable data for period ${period}`, { station_id, parameter });
        }

        let page;
        try {
            if (useCsv) {
                // Try R2 cache first for CSV data
                let csvText = await getCachedCSV(station_id, parameter, period, env, fromDate);

                if (!csvText) {
                    const csvResponse = await fetch(csvLink.href, {
                        headers: {
                            'accept': 'text/csv',
                            'referer': 'https://opendata.smhi.se/',
                            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)'
                        }
                    });

                    if (!csvResponse.ok) {
                        throw new Error(`CSV download failed: ${csvResponse.status} ${csvResponse.statusText}`);
                    }

                    csvText = await csvResponse.text();

                    // Archives run to several megabytes. Writing one to R2 on
                    // the response path added the whole put to the caller's
                    // latency, so hand it to the runtime to finish afterwards.
                    const write = setCachedCSV(csvText, station_id, parameter, period, env);
                    if (ctx?.waitUntil) ctx.waitUntil(write);
                    else await write;
                }

                // Reads one page out of the raw text. Building an object per row
                // cost ~82ms CPU and ~40MB of heap on the largest archives; see
                // utils/csv.js.
                page = parseObservationPage(csvText, { fromDate, toDate, limit, offset, reverse });
            } else {
                const observations = await makeSmhiRequest(
                    jsonLink.href,
                    `hist-json-${station_id}-${parameter}-${period}`,
                    CACHE_TTL.current,
                    ctx
                );
                page = pageJsonObservations(observations.value ?? [], { fromDate, toDate, limit, offset, reverse });
            }
        } catch (e) {
            return createErrorResponse(e.message, { station_id, parameter });
        }

        if (page.unfilteredTotal === 0) {
            return createErrorResponse('No valid data points found', { station_id, parameter });
        }

        if (page.total === 0) {
            return createErrorResponse(
                `No data between ${fromDate || 'beginning'} and ${toDate || 'end'}`,
                { station_id, parameter }
            );
        }

        const nextCursor = page.hasMore ? btoa(String(offset + limit)) : null;
        const prevCursor = offset > 0 ? btoa(String(Math.max(0, offset - limit))) : null;

        const parameterName = getParameterName(parameter);
        const unit = getParameterUnit(parameter);

        const dataPoints = page.rows.map(v => `${v.date}: ${v.value}${unit} (${v.quality})`).join('\n');

        let paginationInfo = `\nShowing ${page.rows.length} of ${page.total} total values`;
        if (fromDate || toDate) {
            paginationInfo += `\nFiltered between: ${fromDate || 'beginning'} and ${toDate || 'end'}`;
            paginationInfo += `\nOriginal dataset: ${page.unfilteredTotal} values`;
        }
        if (nextCursor) paginationInfo += `\nNext page cursor: ${nextCursor}`;
        if (prevCursor) paginationInfo += `\nPrevious page cursor: ${prevCursor}`;

        // Extract station name from metadata title (format: "Parameter - StationName: ...")
        let stationName = metadata.station?.name || metadata.name || 'Unknown';
        if (metadata.title && metadata.title.includes(' - ') && metadata.title.includes(':')) {
            const titleParts = metadata.title.split(' - ')[1];
            if (titleParts) {
                stationName = titleParts.split(':')[0].trim();
            }
        }

        return {
            type: "text",
            text: `Historical ${parameterName.toLowerCase()} for station ${station_id}:\n` +
                   `Period: ${period}\n` +
                   `Station: ${stationName}\n` +
                   `Order: ${reverse ? 'Newest first' : 'Oldest first'}\n\n` +
                   `${dataPoints}${paginationInfo}`,
            nextCursor: nextCursor,
            prevCursor: prevCursor,
            totalCount: page.total,
            originalCount: page.unfilteredTotal,
            filtered: !!(fromDate || toDate)
        };
    } catch (e) {
        return createErrorResponse(`Failed to fetch historical data from SMHI: ${e.message}`, { station_id, parameter });
    }
}

export async function list_all_temperature_stations(cursor) {
    return await listAllStationsForParameter(SMHIParameter.AIR_TEMP, cursor);
}

export async function list_all_snow_depth_stations(cursor) {
    return await listAllStationsForParameter(SMHIParameter.SNOW_DEPTH, cursor);
}

export async function list_all_precipitation_stations(parameter = SMHIParameter.DAILY_PRECIP, cursor) {
    return await listAllStationsForParameter(parameter, cursor);
}

export async function search_stations_by_name_multi_param(query, limit = 10, threshold = 0.3, active_only = true) {
    const parameters = [SMHIParameter.AIR_TEMP, SMHIParameter.DAILY_PRECIP, SMHIParameter.HOURLY_PRECIP, SMHIParameter.SNOW_DEPTH];
    return await searchStationsMultiParameter(query, parameters, limit, threshold, active_only);
}

export async function search_stations_by_name(query, parameter = SMHIParameter.AIR_TEMP, limit = 10, threshold = 0.3, active_only = true) {
    return await searchStationsByParameter(query, parameter, limit, threshold, active_only);
}