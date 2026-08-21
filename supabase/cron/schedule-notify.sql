-- ============================================================
-- Schedules the `notify` Edge Function.
--
-- NOT a migration. Run this once by hand in the Supabase SQL editor,
-- replacing the one placeholder. It carries the service role key in the
-- job's command text, which is why it must never be committed filled in.
--
-- The key is not optional and not interchangeable with the anon key:
-- `notify` rejects anything whose JWT `role` claim is not `service_role`
-- with a 403. See `isServiceRole` in the function.
--
-- Prerequisites, all done as of 21 Aug 2026 except this file:
--   1. RESEND_API_KEY and DIGEST_FROM set as Edge Function secrets.
--   2. VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT likewise,
--      with the public half also in both src/environments/environment*.ts
--   3. `supabase functions deploy notify`
--   4. pg_cron and pg_net enabled — now migration 0004, not this file.
--   5. this file
--
-- To check on it later:
--   select * from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
-- To stop it:
--   select cron.unschedule('daybook-notify');
-- ============================================================

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
