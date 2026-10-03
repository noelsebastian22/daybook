import { ISSUED_AT_FUTURE_RETRY_MS } from './supabase.constants';

/**
 * Sends once more, after a pause, when PostgREST refuses a token as issued in
 * the future.
 *
 * That error is clock skew, not a bad token: auth stamps `iat` with its own
 * clock and a PostgREST node a fraction of a second behind sees a token from
 * the future. It only bites a token minted moments ago, which is exactly the
 * one every open after an hour away is holding — `getSession()` refreshes the
 * expired token, and rollover is the very next request. On 28 Sep that turned
 * into "Could not carry unfinished tasks over" and a task left on yesterday.
 *
 * Exactly one retry, and only for this message. Every other 401 — an expired
 * token above all — gets the same answer however often it is sent.
 */
export async function retryIssuedInFuture(
  send: () => Promise<Response>,
  wait: (ms: number) => Promise<void>,
): Promise<Response> {
  const response = await send();
  if (response.status !== 401 || !(await isIssuedAtFuture(response))) return response;
  await wait(ISSUED_AT_FUTURE_RETRY_MS);
  return send();
}

/** Reads a clone, so the caller still gets a body it can consume. */
async function isIssuedAtFuture(response: Response): Promise<boolean> {
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { message?: unknown } | null;
  return body?.message === 'JWT issued at future';
}
