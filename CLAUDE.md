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
- All 6 outcome-oriented tools
- Structured JSON response format
- Error handling with actionable suggestions

## Architecture

### Core Components
- **worker.js** - Main MCP server implementation with JSON-RPC 2.0 protocol
- **Cloudflare Workers Runtime** - Serverless execution environment
- **SMHI Open Data APIs** - External data sources (no authentication required)

### MCP Protocol Implementation
The server implements full MCP compliance:
- `initialize` method returns proper capabilities including `{ tools: { listChanged: true } }`
- `tools/list` method returns 6 outcome-oriented tools
- `tools/call` method executes weather data operations

### Data Flow
```
MCP Client → Cloudflare Worker → SMHI APIs
    ↑              ↓
  JSON-RPC      HTTP/JSON
```

### Tools (6 Outcome-Oriented)

| Tool | Purpose | Key Features |
|------|---------|--------------|
| `check_weather` | Current conditions + 24h forecast | Accepts location name or coordinates |
| `get_snowmobile_conditions` | Snow + temperature for regions | Parallel multi-station fetch |
| `find_stations` | Search stations by name/coordinates | Unified search across all data types |
| `get_weather_history` | Historical data with pagination | Human-readable enums for data_type and time_range |
| `get_station_info` | Station metadata + current readings | Shows available data types |
| `list_regions` | Snowmobile monitoring regions | Region discovery |

### Response Format

All tools return structured JSON responses:

```javascript
{
  summary: "Human-readable summary of the result",
  data: {
    // Structured data payload
  },
  next_actions: [
    { tool: "tool_name", args: {...}, description: "What this action does" }
  ],
  warnings: ["Any warnings or alerts"],
  trace_id: "smhi-abc123"
}
```

### Enums (Human-Readable Parameters)

**Data Types:**
- `temperature` - Air temperature readings
- `precipitation` - Rainfall/snowfall amounts
- `snow_depth` - Snow depth measurements

**Time Ranges:**
- `current` - Last hour of data
- `today` - Last 24 hours
- `this_month` - Recent monthly data
- `historical` - Archived historical data

**Regions (for snowmobile conditions):**
- `arctic_mountain` - Arctic/Mountain areas
- `mountain` - Mountain regions
- `northern_sweden` - Northern Sweden
- `coastal` - Coastal areas
- `all` - All regions

## Key Constants

### SMHI Parameters (Internal)
- Temperature: `1` (hourly), `2` (daily mean), `19` (daily min), `20` (daily max), `22` (monthly)
- Precipitation: `5` (daily), `7` (hourly), `14` (15-min), `23` (monthly)
- Snow depth: `8` (daily)

### Data Periods (Internal)
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
All errors return structured responses with:
- Error code (e.g., `STATION_NOT_FOUND`, `NO_DATA_AVAILABLE`)
- Human-readable message
- Suggested next actions to resolve the issue

### Pagination
Historical data supports cursor-based pagination with `next_cursor`/`prev_cursor` fields.

### Location Resolution
The `check_weather` tool supports:
- Major Swedish cities by name (Stockholm, Kiruna, Hemavan, etc.)
- Coordinates (lat/lon)
- Automatic nearest-station lookup

## File Structure

```
src/
├── config/
│   ├── constants.js    - SMHI API config, cache TTLs
│   ├── enums.js        - Human-readable enum mappings
│   └── tool-schemas.js - MCP tool definitions
├── tools/
│   ├── index.js        - Tool handler registry
│   └── outcome-tools.js - All 6 tool implementations
├── utils/
│   ├── response.js     - Response builders (buildResponse, buildErrorResponse)
│   ├── geo.js          - Haversine distance calculations
│   ├── search.js       - Station search utilities
│   └── ...
├── api/
│   └── smhi.js         - SMHI API client with caching
└── data/
    └── stations.js     - Snowmobile monitoring stations
```

## Deployment

Live deployment: https://smhi-mcp.hakan-3a6.workers.dev

The server is configured via `wrangler.toml` for Cloudflare Workers deployment with automatic HTTPS and global edge distribution.
