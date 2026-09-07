# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SMHI MCP Server is a Model Context Protocol (MCP) server that provides Swedish weather data through SMHI's open APIs. It's deployed as a Cloudflare Worker for global edge distribution.

## Development Commands

### Package Scripts
- `npm run dev` - Start local development server with Wrangler
- `npm run deploy` - Deploy to Cloudflare Workers

### Makefile Commands (Comprehensive)
- `make install` - Install dependencies
- `make dev` - Start local development server
- `make deploy` - Deploy worker to Cloudflare
- `make logs` - Tail worker logs
- `make status` - Show worker deployment status
- `make test-mcp` - Test MCP endpoints
- `make test-forecast` - Test weather forecast functionality
- `make test-stations` - Test temperature stations
- `make test-all` - Run comprehensive test suite
- `make clean` - Clean dependencies and reinstall
- `make secrets` - Set up required secrets interactively
- `make env` - Show environment configuration

### Testing
Use `make test-mcp` to run the full test suite which validates:
- MCP protocol compliance (including capabilities check)
- All 16 available tools
- Pagination functionality
- Date filtering
- Multi-resolution data access
- Station search capabilities

## Architecture

### Core Components
- **worker.js** - Main MCP server implementation with JSON-RPC 2.0 protocol
- **Cloudflare Workers Runtime** - Serverless execution environment
- **SMHI Open Data APIs** - External data sources (no authentication required)

### MCP Protocol Implementation
The server implements full MCP compliance:
- `initialize` method returns proper capabilities including `{ tools: { listChanged: true } }`
- `tools/list` method returns 16 available tools
- `tools/call` method executes weather data operations

### Data Flow
```
MCP Client → Cloudflare Worker → SMHI APIs
    ↑              ↓
  JSON-RPC      HTTP/JSON
```

### Tool Categories
1. **Snowmobile Conditions Tools** (4): Region-organized stations for snowmobile conditions
2. **Legacy Tools** (2): Deprecated individual temperature/snow station lists
3. **Multi-Resolution Tools** (7): Advanced data access with multiple time resolutions
4. **Station Discovery** (3): Paginated station listings from SMHI API
5. **Historical Data** (2): Pagination and date filtering support
6. **Station Search** (2): Fuzzy name-based station search capabilities

## Key Constants

### SMHI Parameters
- Temperature: `1` (hourly), `2` (daily mean), `19` (daily min), `20` (daily max), `22` (monthly)
- Precipitation: `5` (daily), `7` (hourly), `14` (15-min), `23` (monthly)
- Snow depth: `8` (daily)

### Data Periods
- `latest-hour` - Most recent hourly data
- `latest-day` - Most recent daily data
- `latest-months` - Recent monthly data
- `corrected-archive` - Historical corrected data

## Important Implementation Details

### MCP Capabilities
The server must return proper capabilities in the `initialize` response:
```javascript
capabilities: { tools: { listChanged: true } }
```

### Error Handling
All functions return structured responses with `type: "text"`. A failure also
sets `isError: true` (via `createErrorResponse` in `src/utils/parameters.js`),
which the transport lifts onto the MCP tool result so a client can tell a
failure from an answer. JSON-RPC problems use the standard codes: -32601 for an
unknown method, -32602 for an unknown tool or bad arguments.

### Pagination
Historical data tools support cursor-based pagination with `nextCursor`/`prevCursor` fields and configurable limits. A cursor is a base64 row offset; a malformed one is refused rather than silently treated as page one.

### Date Filtering
Historical data can be filtered by date range using ISO 8601 format (`fromDate`/`toDate` parameters). Both bounds are inclusive and `toDate` covers the whole of its day. An unparseable bound is reported, not ignored.

### Historical data sources
SMHI publishes `data.csv` only for `corrected-archive`. The `latest-hour`,
`latest-day` and `latest-months` links appear in the metadata but answer 406, so
`get_historical_data` reads the JSON feed for those periods.

Archive CSVs are large -- Stockholm's temperature archive is 5.2 MB over 204k
rows. `src/utils/csv.js` reads a page straight out of the raw text instead of
building a row object per line, which is what keeps the request inside the
Workers CPU limit.

### Logging
One line per request by default. Set `DEBUG_LOGS = "1"` in `wrangler.toml` to
log headers and bodies while diagnosing something.

### Station Search
Two fuzzy search tools are available:
- `search_stations_by_name` - Search within a specific parameter type
- `search_stations_by_name_multi_param` - Search across all parameter types

**Important**: Station names can vary by parameter type. For example, station 155940 is called "Hemavan" for temperature data but "Mosekälla" for precipitation/snow data. Use the multi-parameter search when unsure which parameter type a station name appears in.

## Deployment

Live deployment: https://smhi-mcp.hakan-3a6.workers.dev

The server is configured via `wrangler.toml` for Cloudflare Workers deployment with automatic HTTPS and global edge distribution.