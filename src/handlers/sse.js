// Server-Sent Events (SSE) handling for the MCP endpoint.

import { MCP_CONFIG } from '../config/constants.js';

/**
 * Answer a GET that asks for the server-initiated SSE stream.
 *
 * This server has no server-initiated messages to push: every response is
 * produced synchronously from a POST. Per the MCP Streamable HTTP spec, a
 * server that does not offer an SSE stream on GET MUST answer 405.
 *
 * Do NOT return a finite text/event-stream body here. EventSource treats a
 * closed stream as a dropped connection and reconnects after ~1s forever,
 * which silently burns the account's daily Worker request quota.
 */
export async function handleSSE(request, server, requestId) {
    console.log(`[${requestId}] GET on MCP endpoint - no server-initiated stream, returning 405`);

    return new Response('Method Not Allowed: this MCP endpoint accepts POST (JSON-RPC 2.0) only', {
        status: 405,
        headers: {
            'Allow': 'POST, OPTIONS',
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, mcp-protocol-version, mcp-session-id',
            'mcp-protocol-version': MCP_CONFIG.PROTOCOL_VERSION
        },
    });
}
