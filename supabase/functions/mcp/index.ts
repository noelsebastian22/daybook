/**
 * Daybook's remote MCP server: Claude, ChatGPT, Cursor, Claude Code and any
 * other MCP client reach a user's Daybook here. docs/MCP-PLAN.md.
 *
 * Streamable HTTP, stateless: a fresh `McpServer` per request. Supabase Auth's
 * OAuth 2.1 server issues the tokens; the consent page is the app's
 * `/oauth/consent`.
 *
 *   withOAuthProtectedResource — serves `/functions/v1/mcp/oauth-protected-resource`
 *     and adds `WWW-Authenticate: Bearer resource_metadata=…` to every 401,
 *     which is how a client finds the authorization server.
 *   withSupabase({ auth: 'user' }) — the gate. Verifies the caller's JWT
 *     against the project's JWKS and hands on a client scoped to that user,
 *     so RLS applies to everything a tool does.
 *
 * `verify_jwt = false` in config.toml: the discovery request carries no token,
 * and the gate above does the verifying.
 *
 * Deploy with the Supabase CLI from a committed tree (`supabase functions
 * deploy mcp`), not the MCP tool, so what ships is what is in git.
 */
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { pipeline } from '@supabase/middleware';
import { withOAuthProtectedResource, withSupabase } from '@supabase/server';
import type { Database } from './database.types.ts';
import { INSTRUCTIONS, registerDaybook } from './tools.ts';

Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase<Database>({ auth: 'user' })],
    async (req, { supabase, userClaims }) => {
      // The gate has already refused anything without a user; this keeps the
      // type honest and the function safe if that ever changes.
      if (!userClaims) return new Response('Unauthorized', { status: 401 });

      const handler = createMcpHandler(
        () => {
          const server = new McpServer(
            { name: 'daybook', title: 'Daybook', version: '1.0.0' },
            { instructions: INSTRUCTIONS },
          );
          registerDaybook(server, { db: supabase, userId: userClaims.id, now: () => new Date() });
          return server;
        },
        {
          onerror: (error) =>
            console.error('mcp request failed', error instanceof Error ? error.message : 'unknown'),
        },
      );
      return handler.fetch(req);
    },
  ),
);
