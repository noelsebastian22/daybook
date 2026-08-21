/**
 * Web Push, RFC 8291 (aes128gcm) + RFC 8292 (VAPID), on Web Crypto only.
 *
 * Written out rather than pulled from npm because the `web-push` package
 * assumes Node's crypto and does not run on Deno Deploy, and the algorithm is
 * a fixed, well-specified 80 lines. Every step below cites the spec it comes
 * from, because none of it is guessable from reading the code.
 *
 * `webpush.test.mjs` beside this file encrypts a message, decrypts it back the
 * way a browser would, and verifies the VAPID signature — run it with
 * `node webpush.test.mjs` (Node 22+, which strips the types on import).
 *
 * That proves the crypto. It does not prove the wire format is acceptable to
 * FCM, APNs or Mozilla's endpoints, because no real subscription existed when
 * this was written. The first live send is still the test for that.
 */

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 point. */
  publicKey: string;
  /** base64url, 32-byte scalar. */
  privateKey: string;
  /** "mailto:someone@example.com" — a way to be contacted about the sends. */
  subject: string;
}

const encoder = new TextEncoder();

export function b64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** HKDF-SHA256, the one-shot form both specs use. */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * A P-256 private key from the raw 32-byte scalar.
 *
 * Web Crypto will not import a bare scalar, so it is reassembled into a JWK
 * with the public coordinates taken from the matching public key — which is
 * why both halves of the VAPID pair have to be configured, not just the
 * private one.
 */
async function importVapidKey(keys: VapidKeys): Promise<CryptoKey> {
  const pub = b64urlDecode(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point');
  }
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: b64urlEncode(pub.subarray(1, 33)),
      y: b64urlEncode(pub.subarray(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/** The `Authorization: vapid t=…, k=…` header (RFC 8292 §3). */
async function vapidHeader(endpoint: string, keys: VapidKeys): Promise<string> {
  const audience = new URL(endpoint).origin;
  const header = b64urlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64urlEncode(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        // 12 hours. The spec caps it at 24; shorter limits the damage if a
        // token leaks out of a log somewhere.
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: keys.subject,
      }),
    ),
  );

  const signingKey = await importVapidKey(keys);
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    encoder.encode(`${header}.${payload}`),
  );

  // Web Crypto already returns the raw r||s pair ES256 wants, not DER.
  const jwt = `${header}.${payload}.${b64urlEncode(new Uint8Array(signature))}`;
  return `vapid t=${jwt}, k=${keys.publicKey}`;
}

/**
 * Encrypts a payload for one subscription (RFC 8291 §3.4).
 *
 * The record layout at the end is fixed by RFC 8188:
 *   salt(16) | record size(4, big endian) | key id length(1) | key id | ciphertext
 * where the key id is this message's ephemeral public key.
 */
async function encrypt(
  subscription: PushSubscription,
  payload: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(subscription.keys.p256dh);
  const authSecret = b64urlDecode(subscription.keys.auth);

  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: 'ECDH',
        public: await crypto.subtle.importKey(
          'raw',
          uaPublic,
          { name: 'ECDH', namedCurve: 'P-256' },
          false,
          [],
        ),
      },
      ephemeral.privateKey,
      256,
    ),
  );

  // The auth secret is the salt for this first derivation, and the two public
  // keys go in the info so neither side can be swapped without breaking it.
  const ikm = await hkdf(
    authSecret,
    shared,
    concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic),
    32,
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 is the padding delimiter marking the last (and only) record.
  const plaintext = concat(encoder.encode(payload), new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, plaintext),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);

  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

export interface PushResult {
  ok: boolean;
  status: number;
  /** 404 and 410 mean the subscription is dead and should be cleared. */
  gone: boolean;
}

export async function sendPush(
  subscription: PushSubscription,
  payload: string,
  keys: VapidKeys,
): Promise<PushResult> {
  const body = await encrypt(subscription, payload);
  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(subscription.endpoint, keys),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body,
  });

  return {
    ok: response.ok,
    status: response.status,
    gone: response.status === 404 || response.status === 410,
  };
}
