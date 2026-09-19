/**
 * Exercises the real helpers from core.ts — run it with
 * `node core.test.mjs` (Node 22+, which strips the types on import).
 *
 * Same arrangement as auth.test.mjs next door, and for the same reason:
 * index.ts calls Deno.serve at module load, so nothing in it is importable.
 */
import {
  normalizeEmail,
  isPlausibleEmail,
  newDecisionToken,
  hashToken,
  outcomeForStatus,
} from './core.ts';

let failed = 0;
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(
    `${ok ? 'pass' : 'FAIL'}  ${name.padEnd(38)} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
};

// normalizeEmail. The whole point is that a human's typing and Google's
// answer collapse to the same string — a mismatch here rejects someone who
// has been approved, which is the worst way for this feature to fail.
check('lowercases', normalizeEmail('Noel@Example.COM'), 'noel@example.com');
check('trims', normalizeEmail('  a@b.com  '), 'a@b.com');
check('both at once', normalizeEmail('  Mixed@Case.Com '), 'mixed@case.com');
check('empty stays empty', normalizeEmail(''), '');
check('whitespace only', normalizeEmail('   '), '');

check('plausible', isPlausibleEmail('a@b.co'), true);
check('no at sign', isPlausibleEmail('ab.co'), false);
check('no domain dot', isPlausibleEmail('a@b'), false);
check('empty', isPlausibleEmail(''), false);
check('spaces inside', isPlausibleEmail('a b@c.com'), false);

check('absent row means created', outcomeForStatus(null), 'created');
check('pending passes through', outcomeForStatus('pending'), 'pending');
check('approved passes through', outcomeForStatus('approved'), 'approved');
check('denied passes through', outcomeForStatus('denied'), 'denied');

// The token is what stands between an inbox and the ability to grant access.
const a = newDecisionToken();
const b = newDecisionToken();
check('token is long enough', a.length >= 32, true);
check('tokens differ', a === b, false);
check('token is url safe', /^[A-Za-z0-9_-]+$/.test(a), true);

const hashed = await hashToken('a-known-token');
check('hash is sha256 hex', /^[0-9a-f]{64}$/.test(hashed), true);
check('hash is stable', await hashToken('a-known-token'), hashed);
check('hash differs per input', (await hashToken('other')) === hashed, false);

console.log(failed === 0 ? `\nall passed` : `\n${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
