import { afterEach, describe, expect, it, vi } from 'vitest';
import { Supabase } from './supabase';
import { ISSUED_AT_FUTURE_RETRY_MS } from './supabase.constants';

// Every other spec gets FakeSupabase through test-providers.ts. This one
// constructs the real class directly, with `fetch` stubbed, because what is
// under test is the wiring between PostgREST and the network.

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Supabase REST requests', () => {
  it('survive one "JWT issued at future" refusal, as rollover did not on 28 Sep', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json(401, { code: 'PGRST303', details: null, hint: null, message: 'JWT issued at future' }),
      )
      .mockResolvedValueOnce(json(200, [{ rolled_count: 2, snapshots_written: 3 }]));
    vi.stubGlobal('fetch', fetch);

    // The builder is lazy: nothing is sent until it is awaited, so `.then`
    // starts it now rather than after the clock has already been stepped.
    const pending = new Supabase().client
      .rpc('rollover_and_snapshot', { p_today: '2026-10-03' })
      .then((result) => result);
    // The retry's timer is only set once getSession() and the first response
    // have resolved, so a single advance can land before it exists. Step the
    // clock until the second send goes out, bounded so a missing retry fails
    // on the assertions below instead of hanging.
    for (
      let ms = 0;
      ms <= ISSUED_AT_FUTURE_RETRY_MS * 2 && fetch.mock.calls.length < 2;
      ms += 100
    ) {
      await vi.advanceTimersByTimeAsync(100);
    }
    const { data, error } = await pending;

    expect(error).toBeNull();
    expect(data).toEqual([{ rolled_count: 2, snapshots_written: 3 }]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
