export const environment = {
  production: false,
  supabaseUrl: 'https://zzacswfongmzpnhcjiqp.supabase.co',
  // Publishable key. Safe to ship in the bundle: it is gated by RLS.
  supabaseKey: 'sb_publishable_GEaGYrdRr8zAC62XIQXeLw_3zDJjXpT',
  // VAPID public key. Safe to ship — it is the half a browser is meant to
  // see. Generate the pair with `node scripts/generate-vapid.mjs` and put the
  // private half in the Supabase secret VAPID_PRIVATE_KEY, never in here.
  // Empty disables the push toggle in Settings rather than failing at it.
  vapidPublicKey: 'BA1sDpAUHprlhwwJrb6kzGaRXkHuYfmzFK0eFnk47Y4mujPW21iebWNVSItOIEPcl5pLCaG4_El_v-U2xWZJ0PQ',
};
