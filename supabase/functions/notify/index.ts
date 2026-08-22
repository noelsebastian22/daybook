/**
 * Daybook `notify`: the daily digest and due push reminders, on one schedule.
 *
 * Called by pg_cron every five minutes (see supabase/cron/schedule-notify.sql)
 * with the service role key. It asks the database what is due — all the
 * timezone reasoning lives in SQL, where the user's own local date is a single
 * `at time zone` away — and does the sending.
 *
 * One function rather than two because they share the cron, the client and the
 * failure handling, and neither does enough work to deserve its own cold start.
 *
 * Secrets: RESEND_API_KEY, DIGEST_FROM, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
 * VAPID_SUBJECT. A missing secret disables that half and is reported in the
 * response rather than throwing — a broken digest should not stop reminders.
 *
 * Callable by the service role only. See `isServiceRole`.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { isServiceRole } from './auth.ts';
import { sendPush, type PushSubscription, type VapidKeys } from './webpush.ts';

interface DigestRow {
  user_id: string;
  email: string;
  timezone: string;
  local_date: string;
}

interface DigestPayload {
  today: string;
  completed_yesterday: string[];
  carried: Array<{ text: string; count: number }>;
  today_tasks: string[];
}

interface ReminderRow {
  task_id: string;
  user_id: string;
  text: string;
  reminder_at: string;
  subscription: PushSubscription;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/**
 * Asks the database what is due, retrying a failure that is plausibly
 * transient.
 *
 * Seen live on the 09:15 tick, 22 Aug: `due_reminders` returned
 * `401 JWT issued at future` — clock skew between the token issuer and
 * PostgREST — while 09:05, 09:10 and 09:20 all returned 200. A single throw
 * there abandoned every reminder for that tick, not one row. It self-healed
 * only because the 15-minute grace window in `due_reminders` is wider than the
 * five-minute tick, so the next tick still found the row; that window was
 * written for a missed tick and caught this by luck. With one user it is
 * invisible. With fifty, one bad tick delays everybody.
 *
 * **Read RPCs only.** `mark_digest_sent` and `mark_reminder_sent` are writes
 * and must not be retried blindly from here — a retried mark is a lost
 * notification, not a duplicated one.
 */
async function readDue<T>(fn: 'due_digests' | 'due_reminders'): Promise<T[]> {
  const backoffMs = [200, 600];
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await supabase.rpc(fn);
    if (!error) return (data ?? []) as T[];

    if (attempt >= backoffMs.length) throw new Error(`${fn}: ${error.message}`);
    console.log(`${fn}: attempt ${attempt + 1} failed (${error.message}), retrying`);
    await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/**
 * The digest is deliberately plain. It is read on a phone at 7am, and the
 * only thing it has to do is make opening the app unnecessary or obvious.
 */
function renderDigest(payload: DigestPayload): { subject: string; html: string } {
  const { completed_yesterday: done, carried, today_tasks: todo } = payload;

  const list = (items: string[]) =>
    items.map((t) => `<li style="margin:2px 0">${escapeHtml(t)}</li>`).join('');

  const sections: string[] = [];

  if (done.length > 0) {
    sections.push(
      `<p style="margin:16px 0 4px;font-weight:600">Yesterday you finished ${done.length}</p>
       <ul style="margin:0;padding-left:20px;color:#047857">${list(done)}</ul>`,
    );
  }

  if (carried.length > 0) {
    sections.push(
      `<p style="margin:16px 0 4px;font-weight:600">Carried over</p>
       <ul style="margin:0;padding-left:20px;color:#b91c1c">${carried
         .map(
           (c) =>
             `<li style="margin:2px 0">${escapeHtml(c.text)} <span style="color:#8a90ab">&times;${c.count}</span></li>`,
         )
         .join('')}</ul>`,
    );
  }

  sections.push(
    todo.length > 0
      ? `<p style="margin:16px 0 4px;font-weight:600">On today</p>
         <ul style="margin:0;padding-left:20px">${list(todo)}</ul>`
      : `<p style="margin:16px 0 4px;color:#8a90ab">Nothing scheduled for today yet.</p>`,
  );

  const subject =
    todo.length > 0
      ? `${todo.length} on today${done.length > 0 ? `, ${done.length} done yesterday` : ''}`
      : 'Nothing scheduled for today';

  return {
    subject: `Daybook — ${subject}`,
    html: `<div style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;color:#171a2b;max-width:480px">
      <p style="margin:0;font-size:13px;color:#8a90ab;text-transform:uppercase;letter-spacing:.05em">Daybook</p>
      ${sections.join('')}
    </div>`,
  };
}

async function runDigests(): Promise<{ sent: number; failed: number; skipped?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('DIGEST_FROM');
  if (!apiKey || !from) {
    return { sent: 0, failed: 0, skipped: 'RESEND_API_KEY or DIGEST_FROM not set' };
  }

  const due = await readDue<DigestRow>('due_digests');

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    const { data: payload, error: payloadError } = await supabase.rpc('digest_payload', {
      p_user_id: row.user_id,
    });
    if (payloadError || !payload) {
      failed++;
      continue;
    }

    const { subject, html } = renderDigest(payload as DigestPayload);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: row.email, subject, html }),
    });

    if (!response.ok) {
      console.error('resend failed', row.user_id, response.status, await response.text());
      failed++;
      continue;
    }

    // Marked only after a confirmed send, so a Resend outage retries on the
    // next tick instead of silently swallowing the day's digest.
    await supabase.rpc('mark_digest_sent', {
      p_user_id: row.user_id,
      p_local_date: row.local_date,
    });
    sent++;
  }

  return { sent, failed };
}

async function runReminders(): Promise<{ sent: number; failed: number; skipped?: string }> {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) {
    return { sent: 0, failed: 0, skipped: 'VAPID keys or subject not set' };
  }
  const keys: VapidKeys = { publicKey, privateKey, subject };

  const due = await readDue<ReminderRow>('due_reminders');

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    const payload = JSON.stringify({
      notification: {
        title: row.text,
        body: 'Reminder from Daybook',
        // Collapses repeats of the same task into one notification.
        tag: row.task_id,
        // `onActionClick` is Angular's ngsw contract, not a Web Push one:
        // the service worker reads it to decide where a tap goes. Plain
        // `data.url` is ignored and the tap does nothing.
        data: {
          onActionClick: {
            default: {
              operation: 'navigateLastFocusedOrOpen',
              url: `/today/${row.task_id}`,
            },
          },
        },
      },
    });

    try {
      const result = await sendPush(row.subscription, payload, keys);

      if (result.gone) {
        // The browser threw the subscription away. Clear it, or every tick
        // from here retries a dead endpoint.
        await supabase
          .from('user_settings')
          .update({ push_subscription: null })
          .eq('user_id', row.user_id);
        await supabase.rpc('mark_reminder_sent', { p_task_id: row.task_id });
        failed++;
        continue;
      }

      if (!result.ok) {
        console.error('push failed', row.task_id, result.status);
        failed++;
        continue;
      }

      await supabase.rpc('mark_reminder_sent', { p_task_id: row.task_id });
      sent++;
    } catch (cause) {
      console.error('push threw', row.task_id, cause);
      failed++;
    }
  }

  return { sent, failed };
}

Deno.serve(async (req) => {
  if (!isServiceRole(req)) {
    return new Response(JSON.stringify({ error: 'service role required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Settled, not all: a thrown digest must not take the reminders down with
  // it. They are independent jobs sharing a schedule, nothing more.
  const [digests, reminders] = await Promise.allSettled([runDigests(), runReminders()]);

  const unwrap = (result: PromiseSettledResult<unknown>) =>
    result.status === 'fulfilled' ? result.value : { error: String(result.reason) };

  const body = { digests: unwrap(digests), reminders: unwrap(reminders) };
  console.log('notify', JSON.stringify(body));

  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
});
