/**
 * Exercises the real `isServiceRole` from auth.ts — run it with
 * `node auth.test.mjs` (Node 22+, which strips the types on import).
 *
 * It checks claim reading only. The signature is the gateway's job, and the
 * guard is sound only while `verify_jwt` stays true on the deployed function.
 */
import { isServiceRole } from './auth.ts';
import { adminKey } from '../_shared/secret-keys.ts';

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`;
const req = (auth) => new Request('https://x', { headers: auth ? { Authorization: auth } : {} });

// Stands in for Deno.env. Not the real key — the point is that an opaque
// sb_secret_… token is recognised by matching it, since it carries no claims.
const SECRET = 'sb_secret_fake_value_for_this_test_only';
const env = { get: (name) => (name === 'SUPABASE_SERVICE_ROLE_KEY' ? SECRET : undefined) };

// An anon key in the legacy JWT shape. Deliberately fabricated — the project
// ref is not real. A token of exactly this shape reached the function and sent
// a live digest on 21 Aug, before the guard existed, which is what this case
// exists to prevent recurring. The guard only reads the `role` claim, so a
// synthetic token exercises it identically, and the real one committed here
// until 22 Aug did nothing but trip GitHub secret scanning forever.
const anonKey = jwt({ iss: 'supabase', ref: 'notarealprojectref', role: 'anon' });

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

// Once SUPABASE_SECRET_KEYS is set it is the only source. The legacy variable
// may still hold a key that has since been revoked in the dashboard, which is
// exactly the key a rotation is meant to kill.
const ROTATED = 'sb_secret_new_value_after_rotation_test';
const OTHER = 'sb_secret_a_second_named_key_for_test_';
const rotatedEnv = {
  get: (name) =>
    ({
      SUPABASE_SERVICE_ROLE_KEY: SECRET,
      SUPABASE_SECRET_KEYS: JSON.stringify({ daybook: ROTATED, other: OTHER }),
    })[name],
};
const brokenEnv = {
  get: (name) =>
    ({ SUPABASE_SERVICE_ROLE_KEY: SECRET, SUPABASE_SECRET_KEYS: '{not json' })[name],
};
const emptyEnv = {
  get: (name) =>
    ({ SUPABASE_SERVICE_ROLE_KEY: SECRET, SUPABASE_SECRET_KEYS: '{}' })[name],
};

cases.push(
  ['rotated: new key accepted', req(`Bearer ${ROTATED}`), true, rotatedEnv],
  ['rotated: any named key', req(`Bearer ${OTHER}`), true, rotatedEnv],
  ['rotated: legacy env refused', req(`Bearer ${SECRET}`), false, rotatedEnv],
  ['rotated: claim still read', req(`Bearer ${jwt({ role: 'service_role' })}`), true, rotatedEnv],
  ['bad JSON falls back', req(`Bearer ${SECRET}`), true, brokenEnv],
  ['empty object falls back', req(`Bearer ${SECRET}`), true, emptyEnv],
);

let failed = 0;
for (const [name, request, expected, caseEnv = env] of cases) {
  const actual = isServiceRole(request, caseEnv);
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name.padEnd(26)} expected ${expected}, got ${actual}`);
}

// adminKey: which key the RLS-bypassing client is built on
const adminCases = [
  ['prefers the named key', rotatedEnv, ROTATED, 'daybook'],
  ['then default', { get: (n) => ({ SUPABASE_SECRET_KEYS: JSON.stringify({ default: OTHER }) })[n] }, OTHER, 'default'],
  ['then the legacy env', env, SECRET, 'SUPABASE_SERVICE_ROLE_KEY'],
  ['bad JSON, legacy env', brokenEnv, SECRET, 'SUPABASE_SERVICE_ROLE_KEY'],
];
for (const [name, caseEnv, key, source] of adminCases) {
  const got = adminKey(caseEnv);
  const ok = got.key === key && got.source === source;
  if (!ok) failed++;
  console.log(`${ok ? 'pass' : 'FAIL'}  adminKey: ${name.padEnd(17)} expected ${source}, got ${got.source}`);
}
let threw = false;
try { adminKey({ get: () => undefined }); } catch { threw = true; }
if (!threw) failed++;
console.log(`${threw ? 'pass' : 'FAIL'}  adminKey: throws with no key`);

const total = cases.length + adminCases.length + 1;
console.log(failed === 0 ? `\nall ${total} passed` : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
