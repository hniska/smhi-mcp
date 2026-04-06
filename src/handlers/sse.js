// Server-Sent Events (SSE) connection handlers

import { MCP_CONFIG } from '../config/constants.js';

/**
 * Handle pure SSE connections (GET requests with text/event-stream accept header)
 */
export async function handleSSE(request, server, requestId) {
    console.log(`[${requestId}] Setting up SSE connection for Claude web UI`);
    
    // For SSE, Claude web UI expects immediate JSON responses via regular HTTP
    // The SSE connection is used for long-running operations, but MCP requests are typically short
    if (request.method === 'POST') {
        try {
            const body = await request.json();
            console.log(`[${requestId}] SSE request:`, JSON.stringify(body, null, 2));
            
            const response = await server.handle_request(body);
            console.log(`[${requestId}] SSE response:`, JSON.stringify(response, null, 2));
            
            // If response is null (notification), return 204 No Content
            if (response === null) {
                return new Response('', { status: 204 });
            }
            
            // For MCP over SSE, we typically return JSON directly
            return new Response(JSON.stringify(response), {
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version',
                    'mcp-protocol-version': MCP_CONFIG.PROTOCOL_VERSION
                }
            });
            
        } catch (error) {
            console.log(`[${requestId}] SSE error:`, error.message);
            const errorResponse = {
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: `Parse error: ${error.message}` }
            };
            return new Response(JSON.stringify(errorResponse), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version',
                    'mcp-protocol-version': MCP_CONFIG.PROTOCOL_VERSION
                }
            });
        }
    } else {
        // This server has no server-initiated messages to push: every response is
        // produced synchronously from a POST. Per the MCP Streamable HTTP spec, a
        // server that does not offer an SSE stream on GET MUST answer 405.
        //
        // Do NOT return a finite text/event-stream body here. EventSource treats a
        // closed stream as a dropped connection and reconnects after ~1s forever,
        // which silently burns the account's daily Worker request quota.
        console.log(`[${requestId}] GET on MCP endpoint - no server-initiated stream, returning 405`);

        return new Response('Method Not Allowed: this MCP endpoint accepts POST (JSON-RPC 2.0) only', {
            status: 405,
            headers: {
                'Allow': 'POST, OPTIONS',
                'Content-Type': 'text/plain',
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version',
                'mcp-protocol-version': MCP_CONFIG.PROTOCOL_VERSION
            },
        });
    }
}

/**
 * Handle hybrid SSE/HTTP connections (POST requests with SSE accept header)
 */
export async function handleHybridSSE(request, server, requestId) {
    console.log(`[${requestId}] Setting up hybrid SSE/HTTP connection`);
    
    // Create a TransformStream for SSE
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    
    // Process the POST request body and stream the response over SSE
    (async () => {
        try {
            const body = await request.json();
            console.log(`[${requestId}] Hybrid SSE request:`, JSON.stringify(body, null, 2));
            
            const response = await server.handle_request(body);
            console.log(`[${requestId}] Hybrid SSE response:`, JSON.stringify(response, null, 2));
            
            // If response is null (notification), send an empty SSE event
            if (response === null) {
                const event = `data: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result: null })}\n\n`;
                await writer.write(new TextEncoder().encode(event));
            } else {
                // Stream the JSON-RPC response as an SSE event
                const event = `data: ${JSON.stringify(response)}\n\n`;
                await writer.write(new TextEncoder().encode(event));
            }
            
            // Close the writer after sending the response
            await writer.close();
            
        } catch (error) {
            console.log(`[${requestId}] Hybrid SSE error:`, error.message);
            const errorResponse = {
                jsonrpc: "2.0",
                id: null,
                error: { code: -32700, message: `Parse error: ${error.message}` }
            };
            const event = `data: ${JSON.stringify(errorResponse)}\n\n`;
            await writer.write(new TextEncoder().encode(event));
            await writer.close();
        }
    })();
    
    return new Response(readable, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version',
            'mcp-protocol-version': MCP_CONFIG.PROTOCOL_VERSION
        }
    });
}