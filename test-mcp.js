#!/usr/bin/env node

/**
 * Test suite for SMHI MCP Server
 * Tests all MCP endpoints and multi-resolution functionality
 */

const BASE_URL = 'https://smhi-mcp.hakan-3a6.workers.dev';

class MCPTester {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.testResults = [];
    }

    async makeRequest(method, params = {}) {
        const payload = {
            jsonrpc: "2.0",
            id: Date.now(),
            method,
            params
        };

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.error) {
                throw new Error(`MCP Error: ${data.error.message}`);
            }

            return data.result;
        } catch (error) {
            throw new Error(`Request failed: ${error.message}`);
        }
    }

    async runTest(testName, testFn) {
        process.stdout.write(`Testing ${testName}... `);
        try {
            const result = await testFn();
            console.log('✅ PASS');
            this.testResults.push({ name: testName, status: 'PASS', result });
            return result;
        } catch (error) {
            console.log(`❌ FAIL: ${error.message}`);
            this.testResults.push({ name: testName, status: 'FAIL', error: error.message });
            return null;
        }
    }

    async testInitialize() {
        return this.runTest('MCP Initialize', async () => {
            const result = await this.makeRequest('initialize', {
                protocolVersion: "2024-11-05",
                capabilities: {}
            });
            
            if (!result.protocolVersion || !result.serverInfo) {
                throw new Error('Invalid initialize response');
            }
            
            if (!result.capabilities || !result.capabilities.tools) {
                throw new Error('Server does not advertise tool capabilities');
            }
            
            console.log(`\n    Server capabilities: ${JSON.stringify(result.capabilities)}`);
            
            return result;
        });
    }

    async testToolsList() {
        return this.runTest('Tools List', async () => {
            const result = await this.makeRequest('tools/list');
            
            if (!result.tools || !Array.isArray(result.tools)) {
                throw new Error('Invalid tools list response');
            }
            
            console.log(`\n    Found ${result.tools.length} tools:`);
            result.tools.forEach(tool => {
                console.log(`    - ${tool.name}: ${tool.description}`);
            });
            
            return result;
        });
    }

    async testWeatherForecast() {
        return this.runTest('Weather Forecast (Stockholm)', async () => {
            const result = await this.makeRequest('tools/call', {
                name: 'get_weather_forecast',
                arguments: { lat: 59.3293, lon: 18.0686 }
            });
            
            if (!result.content || !result.content[0]?.text) {
                throw new Error('Invalid forecast response');
            }
            
            return result;
        });
    }

    async testTemperatureStations() {
        return this.runTest('Temperature Stations List', async () => {
            const result = await this.makeRequest('tools/call', {
                name: 'list_temperature_stations',
                arguments: {}
            });
            
            if (!result.content || !result.content[0]?.text) {
                throw new Error('Invalid stations response');
            }
            
            return result;
        });
    }

    async testStationTemperature() {
        return this.runTest('Station Temperature (Arvidsjaur)', async () => {
            const result = await this.makeRequest('tools/call', {
                name: 'get_station_temperature',
                arguments: { station_id: '159880' }
            });
            
            if (!result.content || !result.content[0]?.text?.includes('Temperature:')) {
                throw new Error('Invalid temperature response');
            }
            
            return result;
        });
    }

    async testStationPrecipitation() {
        return this.runTest('Station Precipitation (Daily)', async () => {
            const result = await this.makeRequest('tools/call', {
                name: 'get_station_precipitation',
                arguments: { 
                    station_id: '159880',
                    parameter: '5',
                    period: 'latest-day'
                }
            });
            
            if (!result.content || !result.content[0]?.text?.includes('precipitation')) {
                throw new Error('Invalid precipitation response');
            }
            
            return result;
        });
    }

    async testMultiResolutionTemperature() {
        return this.runTest('Multi-Resolution Temperature (Daily Mean)', async () => {
            const result = await this.makeRequest('tools/call', {
                name: 'get_temperature_multi_resolution',
                arguments: { 
                    station_id: '159880',
                    parameter: '2',
                    period: 'latest-day'
                }
            });
            
            if (!result.content || !result.content[0]?.text?.includes('Daily mean temperature')) {
                throw new Error('Invalid multi-resolution temperature response');
            }
            
            return result;
        });
    }

    async testStationMetadata() {
        return this.runTest('Station Metadata', async () => {
            const result = await this.makeRequest('tools/call', {
                name: 'get_station_metadata',
                arguments: { 
                    station_id: '159880',
                    parameter: '1'
                }
            });
            
            if (!result.content || !result.content[0]?.text?.includes('Available periods')) {
                throw new Error('Invalid metadata response');
            }
            
            return result;
        });
    }

    async testHistoricalDataPagination() {
        return this.runTest('Historical Data with Pagination', async () => {
            const result = await this.makeRequest('tools/call', {
                name: 'get_historical_data',
                arguments: { 
                    station_id: '159880',
                    parameter: '1',
                    period: 'latest-day',
                    limit: 3,
                    reverse: true
                }
            });
            
            if (!result.content || !result.content[0]?.text?.includes('Showing 3 of')) {
                throw new Error('Invalid historical data response');
            }
            
            // Test pagination cursor if available
            if (result.content[0].nextCursor) {
                console.log('\n    Testing pagination cursor...');
                
                const nextPageResult = await this.makeRequest('tools/call', {
                    name: 'get_historical_data',
                    arguments: { 
                        station_id: '159880',
                        parameter: '1',
                        period: 'latest-day',
                        limit: 3,
                        cursor: result.content[0].nextCursor,
                        reverse: true
                    }
                });
                
                if (!nextPageResult.content || !nextPageResult.content[0]?.text?.includes('Previous page cursor')) {
                    throw new Error('Pagination cursor test failed');
                }
                
                console.log('    ✅ Pagination cursor works');
            }
            
            return result;
        });
    }

    async testForwardPagination() {
        return this.runTest('Forward Pagination (Oldest First)', async () => {
            const result = await this.makeRequest('tools/call', {
                name: 'get_historical_data',
                arguments: { 
                    station_id: '159880',
                    parameter: '1',
                    period: 'latest-day',
                    limit: 5,
                    reverse: false
                }
            });
            
            if (!result.content || !result.content[0]?.text?.includes('Oldest first')) {
                throw new Error('Invalid forward pagination response');
            }
            
            return result;
        });
    }

    async testAllStations() {
        return this.runTest('All Temperature Stations (Paginated)', async () => {
            const result = await this.makeRequest('tools/call', {
                name: 'list_all_temperature_stations',
                arguments: {}
            });
            
            if (!result.content || !result.content[0]?.text?.includes('Total stations:')) {
                throw new Error('Invalid all stations response');
            }
            
            return result;
        });
    }

    async testPrecipitationStations() {
        return this.runTest('Precipitation Stations List', async () => {
            const result = await this.makeRequest('tools/call', {
                name: 'list_all_precipitation_stations',
                arguments: { parameter: '5' }
            });
            
            if (!result.content || !result.content[0]?.text?.includes('stations for parameter 5')) {
                throw new Error('Invalid precipitation stations response');
            }
            
            return result;
        });
    }

    async testDateFiltering() {
        return this.runTest('Date/Time Filtering', async () => {
            const result = await this.makeRequest('tools/call', {
                name: 'get_historical_data',
                arguments: { 
                    station_id: '159880',
                    parameter: '1',
                    period: 'latest-day',
                    limit: 5,
                    fromDate: '2025-06-27T00:00:00Z',
                    toDate: '2025-06-27T12:00:00Z'
                }
            });
            
            if (!result.content || !result.content[0]?.text?.includes('Filtered between:')) {
                throw new Error('Date filtering not working');
            }
            
            if (!result.content[0].filtered) {
                throw new Error('Filtered flag not set');
            }
            
            return result;
        });
    }

    async runAllTests() {
        console.log('🌤️  SMHI MCP Server Test Suite');
        console.log('=====================================\n');
        console.log(`Testing server: ${this.baseUrl}\n`);

        // Core MCP protocol tests
        await this.testInitialize();
        await this.testToolsList();

        // Weather functionality tests
        await this.testWeatherForecast();
        await this.testTemperatureStations();
        await this.testStationTemperature();

        // Multi-resolution tests
        await this.testStationPrecipitation();
        await this.testMultiResolutionTemperature();
        await this.testStationMetadata();

        // Pagination tests
        await this.testHistoricalDataPagination();
        await this.testForwardPagination();

        // Station listing tests
        await this.testAllStations();
        await this.testPrecipitationStations();

        // Date filtering tests
        await this.testDateFiltering();

        this.printSummary();
    }

    printSummary() {
        console.log('\n📊 Test Summary');
        console.log('================');
        
        const passed = this.testResults.filter(t => t.status === 'PASS').length;
        const failed = this.testResults.filter(t => t.status === 'FAIL').length;
        
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📊 Total:  ${this.testResults.length}`);
        
        if (failed > 0) {
            console.log('\n❌ Failed Tests:');
            this.testResults
                .filter(t => t.status === 'FAIL')
                .forEach(t => console.log(`   - ${t.name}: ${t.error}`));
        }
        
        console.log(`\n🎯 Success Rate: ${Math.round((passed / this.testResults.length) * 100)}%`);
        
        if (failed === 0) {
            console.log('\n🎉 All tests passed! SMHI MCP Server is working correctly.');
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new MCPTester(BASE_URL);
    tester.runAllTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = MCPTester;