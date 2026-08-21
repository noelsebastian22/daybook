#!/usr/bin/env node
/**
 * Generates a VAPID keypair for Web Push.
 *
 * Run once:
 *
 *   node scripts/generate-vapid.mjs
 *
 * Then:
 *   - put the PUBLIC key in `vapidPublicKey` in BOTH
 *     src/environments/environment.ts and environment.prod.ts
 *   - set BOTH halves as Supabase secrets:
 *       supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
 *                            VAPID_SUBJECT=mailto:you@example.com
 *     The sender needs the public half too — Web Crypto cannot import a bare
 *     private scalar without the matching public point. The private key never
 *     goes in the repo.
 *
 * Uses node:crypto rather than the `web-push` package, because the only thing
 * needed here is a P-256 keypair in base64url and pulling a dependency in for
 * twenty lines is not worth the supply chain.
 *
 * Rotating the pair invalidates every existing subscription — every device
 * has to re-subscribe. Generate once and keep it.
 */
import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

// The public key ships as the raw uncompressed point (65 bytes, 0x04 prefix).
// It sits at the tail of the SPKI DER, which has a fixed 26-byte header for
// this curve.
const spki = publicKey.export({ type: 'spki', format: 'der' });
const rawPublic = spki.subarray(spki.length - 65);

// The private key is the 32-byte scalar `d`, at a fixed offset in the SEC1 DER.
const sec1 = privateKey.export({ type: 'sec1', format: 'der' });
const rawPrivate = sec1.subarray(7, 39);

const b64url = (buf) => Buffer.from(buf).toString('base64url');

console.log('\nVAPID keypair\n');
console.log('Public  (environment.ts → vapidPublicKey):');
console.log(`  ${b64url(rawPublic)}\n`);
console.log('Private (Supabase secret VAPID_PRIVATE_KEY):');
console.log(`  ${b64url(rawPrivate)}\n`);
console.log('Keep the private key out of git.\n');
