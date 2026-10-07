# Shared domain module

Daybook's rules, in one place, for every caller: the Angular app
(`src/app/core/*` re-exports from here) and the Edge Functions (the `mcp`
function imports it directly). See `docs/MCP-PLAN.md` §4.

- **Pure.** No Angular, no Supabase client, no `Deno`. The clock and the zone
  are passed in wherever they matter.
- **Relative imports carry `.ts`.** Deno requires it; Angular accepts it
  through `rewriteRelativeImportExtensions` in `tsconfig.json`.
- **`chrono-node` is imported bare.** The app resolves it from
  `node_modules`; each function maps it in its own `deno.json`.
- Tests: `node domain.test.mjs` from this folder (Node 22+ strips the types).
