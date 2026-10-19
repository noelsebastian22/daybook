/**
 * Which secret keys this project currently has, read the way Supabase now
 * hands them to a function.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` is one string, fixed per environment. When the
 * key it holds is revoked in the dashboard, nothing promises that string
 * changes with it, so a function reading only that variable can keep
 * accepting a dead key, or keep building its admin client on one. That is the
 * opposite of what a rotation is for.
 *
 * `SUPABASE_SECRET_KEYS` is a JSON object of every live secret key, by name,
 * and a key deleted in the dashboard leaves it. So once it is present it is
 * the only source; the legacy variable is the fallback for an environment
 * that does not set it (a local `supabase functions serve`, an older runtime).
 *
 * Takes `env` rather than reading `Deno.env` itself so Node tests can pass a
 * stand-in.
 */

/** The key `notify` and `access` build their admin client on, when present. */
export const ADMIN_KEY_NAME = 'daybook';

type Env = { get(name: string): string | undefined };

function parseSecretKeys(env: Env): Record<string, string> | null {
  const raw = env.get('SUPABASE_SECRET_KEYS');
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const keys = Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0,
      ),
    );
    return Object.keys(keys).length > 0 ? keys : null;
  } catch {
    return null;
  }
}

/** Every value a caller may present as a secret key right now. */
export function liveSecretKeys(env: Env): string[] {
  const keys = parseSecretKeys(env);
  if (keys) return Object.values(keys);
  const legacy = env.get('SUPABASE_SERVICE_ROLE_KEY');
  return legacy ? [legacy] : [];
}

/**
 * The key to build an RLS-bypassing client on, and the NAME it came from —
 * never the value — so a response can say which one is in use.
 */
export function adminKey(env: Env): { key: string; source: string } {
  const keys = parseSecretKeys(env);
  if (keys?.[ADMIN_KEY_NAME]) return { key: keys[ADMIN_KEY_NAME], source: ADMIN_KEY_NAME };
  if (keys?.['default']) return { key: keys['default'], source: 'default' };
  const legacy = env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return { key: legacy, source: 'SUPABASE_SERVICE_ROLE_KEY' };
  throw new Error('no secret key in the environment');
}
