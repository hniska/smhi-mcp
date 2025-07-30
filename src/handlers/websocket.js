// WebSocket connection handler

import { MCP_CONFIG } from '../config/constants.js';

/**
 * Handle WebSocket connections for Claude web UI
 */
export async function handleWebSocket(request, server, requestId) {
    console.log(`[${requestId}] Handling WebSocket connection`);
    
    try {
        // Accept the WebSocket connection
        const webSocketPair = new WebSocketPair();
        const [client, server_ws] = Object.values(webSocketPair);
    
        console.log(`[${requestId}] WebSocket pair created`);
        
        // Accept the WebSocket connection
        server_ws.accept();
        console.log(`[${requestId}] WebSocket connection accepted`);
        
        // Handle WebSocket messages
        server_ws.addEventListener('message', async (event) => {
            console.log(`[${requestId}] WebSocket message received:`, event.data);
            
            try {
                const request = JSON.parse(event.data);
                const response = await server.handle_request(request);
                
                // Only send response if not null (notifications don't need responses)
                if (response !== null) {
                    server_ws.send(JSON.stringify(response));
                    console.log(`[${requestId}] WebSocket response sent:`, JSON.stringify(response));
                }
            } catch (error) {
                console.log(`[${requestId}] WebSocket message error:`, error.message);
                const errorResponse = {
                    jsonrpc: "2.0",
                    id: null,
                    error: { code: -32700, message: `Parse error: ${error.message}` }
                };
                server_ws.send(JSON.stringify(errorResponse));
            }
        });
        
        server_ws.addEventListener('close', (event) => {
            console.log(`[${requestId}] WebSocket connection closed:`, event.code, event.reason);
        });
        
        server_ws.addEventListener('error', (event) => {
            console.log(`[${requestId}] WebSocket error:`, event);
        });
        
        // Return the WebSocket response
        return new Response(null, {
            status: 101,
            webSocket: client,
            headers: {
                'mcp-protocol-version': MCP_CONFIG.PROTOCOL_VERSION
            }
        });
    } catch (error) {
        console.log(`[${requestId}] WebSocket setup error:`, error.message);
        console.log(`[${requestId}] Error stack:`, error.stack);
        return new Response(`WebSocket connection failed: ${error.message}`, { status: 500 });
    }
}