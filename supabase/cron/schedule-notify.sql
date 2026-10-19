-- ============================================================
-- Schedules the `notify` Edge Function.
--
-- NOT a migration, because it depends on a Vault secret that only exists
-- once someone has created it by hand. Safe to run as-is: it carries no key.
-- The key is read from Vault by name each time the job fires.
--
-- Prerequisites:
--   1. A secret key named `daybook` in Project Settings → API Keys.
--      `notify` and `access` build their admin client on that name
--      (`_shared/secret-keys.ts`), and `notify` only accepts a key in the
--      project's live set.
--   2. The same key stored in Vault as `daybook_cron_key`, through
--      Integrations → Vault → Secrets. Not through the SQL editor, which keeps
--      query history and would hold the key in plain text.
--   3. pg_cron and pg_net enabled (migration 0004).
--
-- Until 20 Oct 2026 this file had a placeholder for the key pasted into the
-- command text, so the live job held it in plain text in cron.job.command,
-- readable by anything that could query that table as postgres. Gate 0
-- blocker 4, BUILD-PLAN §4.
--
-- Rotating the key: create a new secret key, update the Vault secret's value
-- (same name), redeploy `notify` and `access` so no warm instance holds the
-- old set, check one tick returns 200, then delete the old key. This file
-- does not need running again.
--
-- The key goes on `Authorization: Bearer`, against Supabase's advice to use
-- `apikey` for secret keys. It works, and `notify`'s guard reads that header.
-- See BUILD-PLAN §13 before "fixing" it.
--
-- To check on it later:
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select status_code, content from net._http_response order by created desc limit 5;
--   The reply carries "admin_key": the NAME of the key notify used, never
--   its value.
-- To stop it:
--   select cron.unschedule('daybook-notify');
-- ============================================================

-- Every five minutes. The digest only fires once a local day regardless, and
-- reminders carry a 15-minute grace window, so a missed tick is survivable.
-- cron.schedule upserts by name.
select cron.schedule(
  'daybook-notify',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://zzacswfongmzpnhcjiqp.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'daybook_cron_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
