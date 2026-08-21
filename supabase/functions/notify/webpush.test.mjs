/**
 * Round-trips the Edge Function's Web Push encryption: encrypt as the server,
 * decrypt as the browser would, and verify the VAPID JWT signature.
 */
import { sendPush, b64urlEncode, b64urlDecode } from './webpush.ts';
import { generateKeyPairSync } from 'node:crypto';

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = crypto.subtle;

const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(
    await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8),
  );
}

// ---- the "browser": a subscription keypair + auth secret ----
const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const uaPublic = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
const authSecret = crypto.getRandomValues(new Uint8Array(16));

const subscription = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/fake-endpoint-id',
  keys: { p256dh: b64urlEncode(uaPublic), auth: b64urlEncode(authSecret) },
};

// ---- a VAPID pair, exactly as scripts/generate-vapid.mjs produces ----
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const spki = publicKey.export({ type: 'spki', format: 'der' });
const sec1 = privateKey.export({ type: 'sec1', format: 'der' });
const vapid = {
  publicKey: Buffer.from(spki.subarray(spki.length - 65)).toString('base64url'),
  privateKey: Buffer.from(sec1.subarray(7, 39)).toString('base64url'),
  subject: 'mailto:test@example.com',
};

// ---- capture instead of send ----
let captured;
globalThis.fetch = async (url, init) => {
  captured = { url, headers: init.headers, body: new Uint8Array(init.body) };
  return { ok: true, status: 201 };
};

const message = JSON.stringify({ notification: { title: 'call physio', tag: 'abc' } });
const result = await sendPush(subscription, message, vapid);

const checks = [];
const check = (name, pass, detail = '') => checks.push({ name, pass, detail });

check('sendPush reports ok', result.ok === true && result.status === 201);

// ---- decrypt as the browser ----
const body = captured.body;
const salt = body.subarray(0, 16);
const recordSize = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
const idLen = body[20];
const asPublic = body.subarray(21, 21 + idLen);
const ciphertext = body.subarray(21 + idLen);

check('record size is 4096', recordSize === 4096, String(recordSize));
check('key id is a 65-byte point', idLen === 65 && asPublic[0] === 0x04, `len=${idLen}`);

const shared = new Uint8Array(
  await subtle.deriveBits(
    {
      name: 'ECDH',
      public: await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []),
    },
    ua.privateKey,
    256,
  ),
);

const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

let plaintext = null;
try {
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const opened = new Uint8Array(
    await subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, ciphertext),
  );
  check('padding delimiter is 0x02', opened[opened.length - 1] === 0x02);
  plaintext = dec.decode(opened.subarray(0, opened.length - 1));
} catch (e) {
  check('decrypts', false, String(e));
}

check('plaintext round-trips', plaintext === message, plaintext ?? '(none)');

// ---- VAPID header ----
const auth = captured.headers.Authorization;
const m = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(auth ?? '');
check('Authorization is a vapid header', !!m);

if (m) {
  const [, jwt, k] = m;
  const [h, p, s] = jwt.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());

  check('alg is ES256', header.alg === 'ES256');
  check('aud is the endpoint origin', claims.aud === 'https://fcm.googleapis.com', claims.aud);
  check('sub is the configured subject', claims.sub === vapid.subject);
  check('exp is inside 24h', claims.exp - Math.floor(Date.now() / 1000) <= 86400);
  check('k matches the public key', k === vapid.publicKey);

  const pub = b64urlDecode(vapid.publicKey);
  const verifyKey = await subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.subarray(1, 33)), y: b64urlEncode(pub.subarray(33, 65)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const valid = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    verifyKey,
    b64urlDecode(s),
    enc.encode(`${h}.${p}`),
  );
  check('JWT signature verifies', valid);
}

check('Content-Encoding is aes128gcm', captured.headers['Content-Encoding'] === 'aes128gcm');

let failed = 0;
for (const c of checks) {
  if (!c.pass) failed++;
  console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail && !c.pass ? ` — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
