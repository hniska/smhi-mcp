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
- All 19 available tools
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
- `tools/list` method returns 19 available tools
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
All functions return structured responses with `type: "text"` and appropriate error messages for failed SMHI API calls.

### Pagination
Historical data tools support cursor-based pagination with `nextCursor`/`prevCursor` fields and configurable limits.

### Date Filtering
Historical data can be filtered by date range using ISO 8601 format (`fromDate`/`toDate` parameters).

### Station Search
Two fuzzy search tools are available:
- `search_stations_by_name` - Search within a specific parameter type
- `search_stations_by_name_multi_param` - Search across all parameter types

**Important**: Station names can vary by parameter type. For example, station 155940 is called "Hemavan" for temperature data but "Mosekälla" for precipitation/snow data. Use the multi-parameter search when unsure which parameter type a station name appears in.

## Deployment

Live deployment: https://smhi-mcp.hakan-3a6.workers.dev

The server is configured via `wrangler.toml` for Cloudflare Workers deployment with automatic HTTPS and global edge distribution.