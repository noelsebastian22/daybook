/**
 * Exercises the real `isServiceRole` from auth.ts — run it with
 * `node auth.test.mjs` (Node 22+, which strips the types on import).
 *
 * It checks claim reading only. The signature is the gateway's job, and the
 * guard is sound only while `verify_jwt` stays true on the deployed function.
 */
import { isServiceRole } from './auth.ts';

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
const req = (auth) => new Request('https://x', { headers: auth ? { Authorization: auth } : {} });

// Stands in for Deno.env. Not the real key — the point is that an opaque
// sb_secret_… token is recognised by matching it, since it carries no claims.
const SECRET = 'sb_secret_fake_value_for_this_test_only';
const env = { get: (name) => (name === 'SUPABASE_SERVICE_ROLE_KEY' ? SECRET : undefined) };

// The project's real anon key. It is public by design — it ships in the
// browser bundle — and this is the exact token that reached the function
// and sent a live digest on 21 Aug, before the guard existed.
const anonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6YWNzd2ZvbmdtenBuaGNqaXFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MTkwNzYsImV4cCI6MjEwMjQ5NTA3Nn0.P92v6h8WvuglHY-p1kw5H5RA1s_53den5aiOIVtQVYE';

const cases = [
  ['service_role token', req(`Bearer ${jwt({ role: 'service_role' })}`), true],
  ['lowercase bearer', req(`bearer ${jwt({ role: 'service_role' })}`), true],
  ['real anon key', req(`Bearer ${anonKey}`), false],
  ['authenticated user', req(`Bearer ${jwt({ role: 'authenticated' })}`), false],
  ['publishable key', req('Bearer sb_publishable_GEaGYrdRr8zAC62XIQXeLw_3zDJjXpT'), false],
  ['no header', req(null), false],
  ['garbage', req('Bearer not.a.jwt'), false],
  ['no role claim', req(`Bearer ${jwt({ iss: 'supabase' })}`), false],
  ['role nested, not top level', req(`Bearer ${jwt({ app_metadata: { role: 'service_role' } })}`), false],
  ['sb_secret_ key, exact match', req(`Bearer ${SECRET}`), true],
  ['sb_secret_ key, wrong value', req('Bearer sb_secret_something_else_entirely'), false],
  ['sb_secret_ prefix but shorter', req('Bearer sb_secret_'), false],
];

let failed = 0;
for (const [name, request, expected] of cases) {
  const actual = isServiceRole(request, env);
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(26)} expected ${expected}, got ${actual}`);
}

console.log(failed === 0 ? `\nall ${cases.length} passed` : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
