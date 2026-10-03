import { describe, expect, it, vi } from 'vitest';
import { retryIssuedInFuture } from './supabase.helpers';

/** The exact body PostgREST sent on 28 Sep — 79 bytes, matched by length. */
const ISSUED_AT_FUTURE = {
  code: 'PGRST303',
  details: null,
  hint: null,
  message: 'JWT issued at future',
};

const respond = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Hands out the given responses in order, one per call. */
function sender(...responses: Response[]) {
  return vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('sent more times than the test allowed');
    return next;
  });
}

const noWait = () => Promise.resolve();

describe('retryIssuedInFuture', () => {
  it('sends again when a fresh token is rejected as issued in the future', async () => {
    const send = sender(respond(401, ISSUED_AT_FUTURE), respond(200, [{ rolled_count: 1 }]));

    const response = await retryIssuedInFuture(send, noWait);

    expect(send).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ rolled_count: 1 }]);
  });

  it('waits before sending again, so the lagging clock can catch up', async () => {
    const send = sender(respond(401, ISSUED_AT_FUTURE), respond(200));
    const wait = vi.fn((_ms: number) => Promise.resolve());

    await retryIssuedInFuture(send, wait);

    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait.mock.calls[0][0]).toBeGreaterThan(0);
  });

  it('sends only once on success', async () => {
    const send = sender(respond(200));

    await retryIssuedInFuture(send, noWait);

    expect(send).toHaveBeenCalledTimes(1);
  });

  // An expired token is a real failure, not a clock disagreement. Resending
  // the same token gets the same answer.
  it('does not retry any other 401', async () => {
    const expired = { ...ISSUED_AT_FUTURE, message: 'JWT expired' };
    const send = sender(respond(401, expired));

    const response = await retryIssuedInFuture(send, noWait);

    expect(send).toHaveBeenCalledTimes(1);
    expect((await response.json()).message).toBe('JWT expired');
  });

  it('gives up after one retry and hands back the error intact', async () => {
    const send = sender(respond(401, ISSUED_AT_FUTURE), respond(401, ISSUED_AT_FUTURE));

    const response = await retryIssuedInFuture(send, noWait);

    expect(send).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual(ISSUED_AT_FUTURE);
  });

  it('leaves a non-JSON 401 alone rather than throwing on it', async () => {
    const send = sender(new Response('Unauthorized', { status: 401 }));

    const response = await retryIssuedInFuture(send, noWait);

    expect(send).toHaveBeenCalledTimes(1);
    expect(await response.text()).toBe('Unauthorized');
  });
});
