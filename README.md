# SMHI MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides Swedish weather data through SMHI's open APIs, deployed as a Cloudflare Worker.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/yourusername/smhi-mcp)

## 🌤️ Features

- **Real-time Weather Data**: Access current weather conditions from SMHI weather stations
- **Weather Forecasts**: Get detailed forecasts for any location in Sweden
- **Station Search**: Find weather stations by name using fuzzy matching
- **Multi-Resolution Data**: Access hourly, daily, and monthly weather data
- **Historical Data**: Query past weather records with pagination and date filtering
- **MCP Protocol**: Full compatibility with Claude and other MCP clients
- **Serverless**: Runs on Cloudflare Workers with global edge deployment
- **No API Keys Required**: Uses SMHI's free open data APIs

## 🚀 Live Demo

**Deployed Server:** https://smhi-mcp.hakan-3a6.workers.dev

## 📋 Available Tools (19 Total)

### Legacy Simple Tools
| Tool | Description | Parameters |
|------|-------------|------------|
| `list_temperature_stations` | List predefined temperature monitoring stations | None |
| `list_snow_depth_stations` | List predefined snow depth monitoring stations | None |
| `get_station_temperature` | Get latest temperature reading from a specific station | `station_id` (string) |
| `get_station_snow_depth` | Get latest snow depth reading from a specific station | `station_id` (string) |
| `get_weather_forecast` | Get weather forecast for coordinates | `lat` (number), `lon` (number) |

### Multi-Resolution Data Tools
| Tool | Description | Parameters |
|------|-------------|------------|
| `get_station_precipitation` | Get precipitation data with multiple resolutions | `station_id`, `parameter` (5=daily, 7=hourly, 14=15min, 23=monthly), `period` |
| `get_temperature_multi_resolution` | Get temperature data with multiple resolutions | `station_id`, `parameter` (1=hourly, 2=daily-mean, 19=min, 20=max, 22=monthly), `period` |
| `get_station_metadata` | Get detailed station metadata and available periods | `station_id`, `parameter` |

### Historical Data & Pagination
| Tool | Description | Parameters |
|------|-------------|------------|
| `get_historical_data` | Get historical data with pagination and date filtering | `station_id`, `parameter`, `period`, `limit`, `cursor`, `reverse`, `fromDate`, `toDate` |
| `list_all_temperature_stations` | Get all temperature stations with pagination | `cursor` (optional) |
| `list_all_snow_depth_stations` | Get all snow depth stations with pagination | `cursor` (optional) |
| `list_all_precipitation_stations` | Get all precipitation stations with pagination | `parameter`, `cursor` |

### Station Search Tools
| Tool | Description | Parameters |
|------|-------------|------------|
| `search_stations_by_name` | Search stations by name within a specific parameter type | `query`, `parameter` (1=temp, 5=precip, 8=snow), `limit`, `threshold` |
| `search_stations_by_name_multi_param` | Search stations by name across all parameter types | `query`, `limit`, `threshold` |

## 🛠️ Quick Start

### Option 1: Use the Deployed Server

Connect your MCP client to: `https://smhi-mcp.hakan-3a6.workers.dev`

### Option 2: Deploy Your Own

```bash
# Clone the repository
git clone https://github.com/yourusername/smhi-mcp.git
cd smhi-mcp

# Install dependencies
npm install

# Deploy to Cloudflare Workers
npm run deploy
```

### Option 3: Local Development

```bash
# Start local development server
npm run dev

# The server will be available at http://localhost:8787
```

## 📡 MCP Protocol Examples

### Initialize Connection
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {}
  }
}
```

### List Available Tools
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

### Get Weather Forecast (Stockholm)
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "get_weather_forecast",
    "arguments": {
      "lat": 59.3293,
      "lon": 18.0686
    }
  }
}
```

### Get Station Temperature
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "get_station_temperature",
    "arguments": {
      "station_id": "159880"
    }
  }
}
```

### Search for Weather Stations
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "search_stations_by_name_multi_param",
    "arguments": {
      "query": "Stockholm",
      "limit": 5,
      "threshold": 0.3
    }
  }
}
```

### Get Historical Data with Pagination
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "tools/call",
  "params": {
    "name": "get_historical_data",
    "arguments": {
      "station_id": "159880",
      "parameter": "1",
      "period": "corrected-archive",
      "limit": 20,
      "fromDate": "2024-01-01",
      "toDate": "2024-01-31"
    }
  }
}
```

## 🧪 Testing

### Using cURL

```bash
# Test MCP initialization
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}}}' \
  https://smhi-mcp.hakan-3a6.workers.dev

# Test weather forecast for Stockholm
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "get_weather_forecast", "arguments": {"lat": 59.3293, "lon": 18.0686}}}' \
  https://smhi-mcp.hakan-3a6.workers.dev

# Search for weather stations
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "search_stations_by_name_multi_param", "arguments": {"query": "Stockholm", "limit": 3}}}' \
  https://smhi-mcp.hakan-3a6.workers.dev
```

### Using Make Commands

```bash
# Run built-in tests
make test-mcp
make test-forecast
make test-stations
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Client    │    │  Cloudflare     │    │   SMHI APIs     │
│   (Claude)      │◄──►│    Worker       │◄──►│  (opendata)     │
│                 │    │  (smhi-mcp)     │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

The server acts as a bridge between MCP clients and SMHI's weather APIs:

1. **MCP Client** sends JSON-RPC requests
2. **Cloudflare Worker** processes requests and calls SMHI APIs
3. **SMHI APIs** provide real-time weather data
4. **Worker** formats response according to MCP protocol

## 📊 Data Sources

All weather data comes from [SMHI (Swedish Meteorological and Hydrological Institute)](https://www.smhi.se/):

- **Observations API**: Real-time weather station data
- **Forecast API**: Weather predictions up to 10 days
- **Station Metadata**: Information about monitoring stations

### Sample Weather Stations

| Station ID | Name | Location | Note |
|------------|------|----------|------|
| 159880 | Arvidsjaur | Northern Sweden | Temperature & precipitation |
| 155960 | Tärnaby/Hemavan | Mountain region | Temperature data |
| 155940 | Mosekälla/Hemavan | Mountain region | Same location, different parameter names |
| 132170 | Storlien-Storvallen | Norwegian border | Alpine weather station |
| 188850 | Katterjåkk/Riksgränsen | Arctic region | Northernmost station |

**Note**: Some stations have different names depending on the parameter type. Use `search_stations_by_name_multi_param` to find stations across all data types.

## 🔧 Configuration

### Environment Variables

The worker can be configured with these optional environment variables:

```toml
# wrangler.toml
[env.production.vars]
# Add public configuration here

# Optional secrets for authentication
[[env.production.secrets]]
API_KEY = "your-api-key-for-auth"
```

### Authentication (Optional)

To enable API key authentication, set the `API_KEY` secret:

```bash
wrangler secret put API_KEY
```

## 📋 Development Commands

```bash
# Install dependencies
make install

# Start development server
make dev

# Deploy to Cloudflare
make deploy

# View logs
make logs

# Show deployment status
make status

# Run tests
make test-mcp
```

## 🌍 Claude Integration

To use this server with Claude:

1. **Desktop App**: Add the server URL in Claude's MCP settings
2. **API**: Include the server in your MCP client configuration
3. **Custom Integration**: Use the JSON-RPC protocol directly

Example Claude conversations:
```
You: "What's the current temperature in Arvidsjaur?"
Claude: "Let me check the current temperature in Arvidsjaur for you."
[Uses get_station_temperature with station_id "159880"]
Claude: "The current temperature in Arvidsjaur is 15.8°C."

You: "Find weather stations near Stockholm"
Claude: "Let me search for weather stations near Stockholm."
[Uses search_stations_by_name_multi_param with query "Stockholm"]
Claude: "I found several weather stations near Stockholm, including Stockholm A (98230) and Stockholm-Observatoriekullen (98210)."

You: "Show me temperature data for Mosekälla from January 2024"
Claude: "Let me search for Mosekälla and get the temperature data."
[Uses search_stations_by_name_multi_param with query "Mosekälla"]
[Uses get_historical_data with station_id "155940", fromDate "2024-01-01", toDate "2024-01-31"]
Claude: "Found Mosekälla (station 155940) - here's the temperature data for January 2024..."
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Test locally: `npm run dev`
5. Deploy and test: `npm run deploy`
6. Submit a pull request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🔗 Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol specification
- [SMHI Open Data](https://www.smhi.se/data/meteorologi/ladda-ner-meteorologiska-observationer) - Weather data source
- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless platform

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/smhi-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/smhi-mcp/discussions)
- **SMHI API Docs**: [SMHI Open Data Portal](https://www.smhi.se/data)

---

Built with ❤️ for the MCP ecosystem | Powered by SMHI Open Data | Deployed on Cloudflare Workers