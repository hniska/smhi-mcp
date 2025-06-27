.PHONY: help install dev deploy test clean logs status secrets env

# Default target
help:
	@echo "SMHI MCP Worker - Available targets:"
	@echo ""
	@echo "  install    - Install dependencies"
	@echo "  dev        - Start local development server"
	@echo "  deploy     - Deploy worker to Cloudflare"
	@echo "  test       - Run tests (if available)"
	@echo "  clean      - Clean node_modules and package-lock"
	@echo "  logs       - Tail worker logs"
	@echo "  status     - Show worker deployment status"
	@echo "  secrets    - Set up required secrets interactively"
	@echo "  env        - Show environment configuration"
	@echo "  update     - Update wrangler to latest version"
	@echo ""
	@echo "Quick commands:"
	@echo "  make install && make deploy"

# Install dependencies
install:
	npm install

# Start local development
dev:
	npm run dev

# Deploy to Cloudflare
deploy:
	npm run deploy

# Run tests if they exist
test:
	@if [ -f "package.json" ] && npm run | grep -q "test"; then \
		npm test; \
	else \
		echo "No tests configured"; \
	fi

# Clean dependencies
clean:
	rm -rf node_modules package-lock.json
	npm install

# Tail logs from deployed worker
logs:
	wrangler tail

# Show deployment status
status:
	@echo "SMHI MCP Worker Status:"
	@echo "URL: https://smhi-mcp.your-subdomain.workers.dev"
	@echo ""
	@wrangler deployments list --name smhi-mcp 2>/dev/null || echo "Run 'make deploy' first"

# Set up secrets interactively
secrets:
	@echo "Setting up SMHI MCP secrets..."
	@echo "Optional secrets:"
	@echo "  - API_KEY (for authentication if needed)"
	@echo ""
	@read -p "Set API_KEY for authentication? (y/n): " confirm && \
	if [ "$$confirm" = "y" ]; then wrangler secret put API_KEY; fi

# Show environment configuration
env:
	@echo "Current Environment Configuration:"
	@echo "=================================="
	@echo ""
	@echo "From wrangler.toml:"
	@grep -A 10 "^\[" wrangler.toml 2>/dev/null || echo "No wrangler.toml found"
	@echo ""
	@echo "Secrets (configured but values hidden):"
	@wrangler secret list 2>/dev/null || echo "No secrets configured or wrangler not authenticated"

# Update wrangler to latest version
update:
	npm install --save-dev wrangler@latest
	@echo "Updated wrangler. Use 'npx wrangler' for latest version."

# Quick setup for new environments
setup: install deploy
	@echo ""
	@echo "Setup complete! SMHI MCP Worker deployed."

# Development workflow
dev-deploy: 
	npm run dev &
	@echo "Development server started. Press Ctrl+C to stop and deploy."
	@read -p "Ready to deploy? (y/n): " confirm && \
	if [ "$$confirm" = "y" ]; then make deploy; fi

# Test MCP endpoints (requires worker to be deployed)
test-mcp:
	@echo "Testing SMHI MCP endpoints..."
	@echo "Testing MCP initialize..."
	@curl -s -X POST \
		-H "Content-Type: application/json" \
		-d '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}}}' \
		https://smhi-mcp.your-subdomain.workers.dev | jq . || echo "Failed or no jq installed"
	@echo ""
	@echo "Testing tools/list..."
	@curl -s -X POST \
		-H "Content-Type: application/json" \
		-d '{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}' \
		https://smhi-mcp.your-subdomain.workers.dev | jq . || echo "Failed or no jq installed"

# Test weather forecast (Stockholm coordinates)
test-forecast:
	@echo "Testing weather forecast for Stockholm..."
	@curl -s -X POST \
		-H "Content-Type: application/json" \
		-d '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "get_weather_forecast", "arguments": {"lat": 59.3293, "lon": 18.0686}}}' \
		https://smhi-mcp.your-subdomain.workers.dev | jq . || echo "Failed or no jq installed"

# Test temperature stations
test-stations:
	@echo "Testing temperature stations list..."
	@curl -s -X POST \
		-H "Content-Type: application/json" \
		-d '{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "list_temperature_stations", "arguments": {}}}' \
		https://smhi-mcp.your-subdomain.workers.dev | jq . || echo "Failed or no jq installed"