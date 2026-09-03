import type { PushBlocker } from '../../core/push';

/** A short list beats a 400-entry <select> nobody scrolls. */
export const TIMEZONES = [
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Adelaide',
  'Australia/Perth',
  'Pacific/Auckland',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

export const BLOCKER_TEXT: Record<Exclude<PushBlocker, null>, string> = {
  unconfigured: 'Push is not configured on this build yet.',
  'no-service-worker': 'Reminders need the installed app. They are off in development builds.',
  'not-installed': 'Add Daybook to your home screen first. iOS only allows reminders there.',
  denied: 'Notifications are blocked for Daybook in your browser settings.',
};
