-- ============================================================
-- Schedules the `notify` Edge Function.
--
-- NOT a migration. Run this once by hand in the Supabase SQL editor,
-- replacing the two placeholders. It carries the service role key in the
-- job's command text, which is why it must never be committed filled in.
--
-- Prerequisites, in order:
--   1. `supabase secrets set RESEND_API_KEY=...`
--   2. `node scripts/generate-vapid.mjs`, then
--      `supabase secrets set VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com`
--      and paste the public half into both src/environments/environment*.ts
--   3. `supabase functions deploy notify`
--   4. this file
--
-- To check on it later:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
-- To stop it:
--   select cron.unschedule('daybook-notify');
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every five minutes. The digest only fires once a local day regardless, and
-- reminders carry a 15-minute grace window, so a missed tick is survivable.
select cron.schedule(
  'daybook-notify',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://zzacswfongmzpnhcjiqp.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
