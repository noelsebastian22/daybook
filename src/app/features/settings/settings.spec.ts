import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { browserTimezone } from '../../core/dates';
import type { Category, UserSettings } from '../../core/models';
import { Push, type PushBlocker } from '../../core/push';
import { SettingsStore } from '../../core/settings.store';
import { TaskStore } from '../../core/task.store';
import { ToastStore } from '../../core/toast.store';
import { makeCategory, makeSettings, resetIds } from '../../../testing/fakes';
import { render, type Rendered } from '../../../testing/render';
import { BLOCKER_TEXT } from './settings.data';
import { Settings } from './settings';

/**
 * The page that shipped a real bug: the zone `<select>` rendered
 * America/Los_Angeles while the stored zone was Australia/Sydney.
 *
 * `[value]` on the `<select>` runs before `@for` has rendered any `<option>`,
 * so the assignment finds no matching child and the element falls back to
 * `selectedIndex` 0 — which, because the list is sorted, is the Americas. The
 * fix moved the selection onto the `<option>`. The first test below is the one
 * that would have caught it, and it is written so it can only pass for the
 * right reason: sorted index 0 is asserted to be a *different* zone.
 *
 * That column is not cosmetic. Rollover runs on the client's local date, but
 * the digest runs on a server cron that has nothing else telling it when 7am
 * is.
 */

const DETECTED = browserTimezone();
/** A zone that is definitely not the one this machine is in. */
const ELSEWHERE = DETECTED === 'UTC' ? 'Australia/Perth' : 'UTC';

let settings: WritableSignal<UserSettings | null>;
let pushSubscribed: WritableSignal<boolean>;
let categories: WritableSignal<Category[]>;
let blocker: PushBlocker;

let update: ReturnType<typeof vi.fn>;
let loadPush: ReturnType<typeof vi.fn>;
let subscribePush: ReturnType<typeof vi.fn>;
let unsubscribePush: ReturnType<typeof vi.fn>;
let settingsEnsureLoaded: ReturnType<typeof vi.fn>;
let tasksEnsureLoaded: ReturnType<typeof vi.fn>;
let updateCategory: ReturnType<typeof vi.fn>;
let removeCategory: ReturnType<typeof vi.fn>;
let show: ReturnType<typeof vi.fn>;

async function renderSettings(): Promise<Rendered<Settings>> {
  return render(Settings);
}

function zoneSelect(page: Rendered<Settings>): HTMLSelectElement {
  const select = page.query('select') as HTMLSelectElement | null;
  if (!select) throw new Error('no timezone select');
  return select;
}

/** The checkbox inside whichever row carries this text. */
function switchFor(page: Rendered<Settings>, text: string): HTMLInputElement | null {
  const row = page.byText('label', text);
  return (row?.querySelector('input[type="checkbox"]') as HTMLInputElement) ?? null;
}

async function change(
  page: Rendered<Settings>,
  el: HTMLInputElement | HTMLSelectElement,
): Promise<void> {
  el.dispatchEvent(new Event('change'));
  await page.settle();
}

describe('Settings', () => {
  beforeEach(() => {
    resetIds();
    settings = signal<UserSettings | null>(makeSettings());
    pushSubscribed = signal(false);
    categories = signal<Category[]>([]);
    blocker = null;

    update = vi.fn();
    loadPush = vi.fn();
    subscribePush = vi.fn().mockResolvedValue(true);
    unsubscribePush = vi.fn().mockResolvedValue(undefined);
    settingsEnsureLoaded = vi.fn();
    tasksEnsureLoaded = vi.fn();
    updateCategory = vi.fn();
    removeCategory = vi.fn();
    show = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SettingsStore,
          useValue: {
            settings,
            pushSubscribed,
            ensureLoaded: settingsEnsureLoaded,
            loadPush,
            update,
            subscribePush,
            unsubscribePush,
          },
        },
        {
          provide: TaskStore,
          useValue: {
            categories,
            ensureLoaded: tasksEnsureLoaded,
            updateCategory,
            removeCategory,
          },
        },
        { provide: ToastStore, useValue: { show, error: vi.fn() } },
        { provide: Push, useValue: { blocker: () => blocker } },
      ],
    });
  });

  describe('the timezone', () => {
    it('renders the zone that is stored, not whichever one sorts first', async () => {
      settings.set(makeSettings({ timezone: 'Australia/Sydney' }));

      const page = await renderSettings();
      const options = page.queryAll('option');

      expect(zoneSelect(page).value).toBe('Australia/Sydney');
      // The bug read as a plausible zone rather than as nothing, so the guard
      // is that index 0 is a different one and the select did not land on it.
      expect(options[0].textContent?.trim()).not.toBe('Australia/Sydney');
      expect(zoneSelect(page).selectedIndex).toBeGreaterThan(0);
    });

    it('pins a zone that is not in the shortlist rather than dropping it', async () => {
      settings.set(makeSettings({ timezone: 'Antarctica/Troll' }));

      const page = await renderSettings();

      expect(page.queryAll('option').map((o) => o.textContent?.trim())).toContain(
        'Antarctica/Troll',
      );
      expect(zoneSelect(page).value).toBe('Antarctica/Troll');
    });

    it('lists the device’s own zone, whatever it is', async () => {
      const page = await renderSettings();

      expect(page.queryAll('option').map((o) => o.textContent?.trim())).toContain(DETECTED);
    });

    it('saves the zone that was picked', async () => {
      const page = await renderSettings();
      const select = zoneSelect(page);

      select.value = 'Europe/London';
      await change(page, select);

      expect(update).toHaveBeenCalledWith({ timezone: 'Europe/London' });
    });

    it('offers the device’s zone when the stored one disagrees with it', async () => {
      settings.set(makeSettings({ timezone: ELSEWHERE }));

      const page = await renderSettings();
      const shortcut = page.byText('button', `Use ${DETECTED}`);
      await page.click(shortcut as HTMLElement);

      expect(update).toHaveBeenCalledWith({ timezone: DETECTED });
    });

    it('says nothing when the stored zone is already the device’s', async () => {
      settings.set(makeSettings({ timezone: DETECTED }));

      const page = await renderSettings();

      expect(page.byText('button', `Use ${DETECTED}`)).toBeNull();
    });
  });

  describe('the digest', () => {
    it('turns on', async () => {
      const page = await renderSettings();
      const toggle = switchFor(page, 'Send me the digest') as HTMLInputElement;

      toggle.checked = true;
      await change(page, toggle);

      expect(update).toHaveBeenCalledWith({ digest_enabled: true });
    });

    it('turns off again', async () => {
      settings.set(makeSettings({ digest_enabled: true }));
      const page = await renderSettings();
      const toggle = switchFor(page, 'Send me the digest') as HTMLInputElement;

      toggle.checked = false;
      await change(page, toggle);

      expect(update).toHaveBeenCalledWith({ digest_enabled: false });
    });

    it('asks for a send time only once there is a digest to send', async () => {
      const page = await renderSettings();
      expect(page.query('input[type="time"]')).toBeNull();

      settings.set(makeSettings({ digest_enabled: true }));
      await page.settle();

      expect(page.query('input[type="time"]')).not.toBeNull();
    });

    it('trims the seconds Postgres adds, which an input type=time will not take', async () => {
      settings.set(makeSettings({ digest_enabled: true, digest_send_at: '07:30:00' }));

      const page = await renderSettings();

      expect((page.query('input[type="time"]') as HTMLInputElement).value).toBe('07:30');
    });

    it('saves a new send time', async () => {
      settings.set(makeSettings({ digest_enabled: true }));
      const page = await renderSettings();
      const time = page.query('input[type="time"]') as HTMLInputElement;

      time.value = '06:15';
      await change(page, time);

      expect(update).toHaveBeenCalledWith({ digest_send_at: '06:15' });
    });

    it('ignores a cleared time rather than saving an empty one', async () => {
      settings.set(makeSettings({ digest_enabled: true }));
      const page = await renderSettings();
      const time = page.query('input[type="time"]') as HTMLInputElement;

      time.value = '';
      await change(page, time);

      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('reminders', () => {
    it('asks whether this browser is registered, which is a different question from loading the row', async () => {
      await renderSettings();

      expect(settingsEnsureLoaded).toHaveBeenCalled();
      expect(tasksEnsureLoaded).toHaveBeenCalled();
      expect(loadPush).toHaveBeenCalled();
    });

    it('says why the switch is missing rather than offering one that would throw', async () => {
      blocker = 'not-installed';

      const page = await renderSettings();

      expect(page.el.textContent).toContain(BLOCKER_TEXT['not-installed']);
      expect(switchFor(page, 'Push reminders on this device')).toBeNull();
    });

    it('explains a development build instead of reading as broken', async () => {
      blocker = 'no-service-worker';

      const page = await renderSettings();

      expect(page.el.textContent).toContain(BLOCKER_TEXT['no-service-worker']);
    });

    it('explains a browser-level block, which the app cannot undo', async () => {
      blocker = 'denied';

      const page = await renderSettings();

      expect(page.el.textContent).toContain(BLOCKER_TEXT['denied']);
    });

    it('shows the switch as on when this device is registered', async () => {
      pushSubscribed.set(true);

      const page = await renderSettings();

      expect(switchFor(page, 'Push reminders on this device')?.checked).toBe(true);
    });

    it('registers the device and says so', async () => {
      const page = await renderSettings();
      const toggle = switchFor(page, 'Push reminders on this device') as HTMLInputElement;

      toggle.checked = true;
      await change(page, toggle);

      expect(subscribePush).toHaveBeenCalled();
      expect(show).toHaveBeenCalledWith('Reminders on for this device.');
    });

    it('says nothing when the prompt was refused — the store has already explained', async () => {
      subscribePush.mockResolvedValue(false);
      const page = await renderSettings();
      const toggle = switchFor(page, 'Push reminders on this device') as HTMLInputElement;

      toggle.checked = true;
      await change(page, toggle);

      expect(show).not.toHaveBeenCalled();
    });

    it('unregisters the device when switched off', async () => {
      pushSubscribed.set(true);
      const page = await renderSettings();
      const toggle = switchFor(page, 'Push reminders on this device') as HTMLInputElement;

      toggle.checked = false;
      await change(page, toggle);

      expect(unsubscribePush).toHaveBeenCalled();
      expect(show).not.toHaveBeenCalled();
    });

    it('disables the switch while the browser prompt is out, because this write cannot be optimistic', async () => {
      let answer: (subscribed: boolean) => void = () => {};
      subscribePush.mockReturnValue(
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
      );

      const page = await renderSettings();
      const toggle = switchFor(page, 'Push reminders on this device') as HTMLInputElement;
      toggle.checked = true;
      await change(page, toggle);

      expect(switchFor(page, 'Push reminders on this device')?.disabled).toBe(true);

      answer(true);
      await Promise.resolve();
      await page.settle();

      expect(switchFor(page, 'Push reminders on this device')?.disabled).toBe(false);
    });
  });

  describe('categories', () => {
    it('says which category each control belongs to', async () => {
      categories.set([makeCategory({ name: 'Health', slug: 'health' })]);

      const page = await renderSettings();
      const labels = page.queryAll('[aria-label]').map((el) => el.getAttribute('aria-label'));

      expect(labels).toContain('Colour for Health');
      expect(labels).toContain('Name for Health');
      expect(labels).toContain('Delete Health');
    });

    it('shows the tag the category is matched by, which renaming does not change', async () => {
      categories.set([makeCategory({ name: 'Health', slug: 'health' })]);

      const page = await renderSettings();

      expect(page.el.textContent).toContain('#health');
    });

    it('renames', async () => {
      const category = makeCategory({ name: 'Health' });
      categories.set([category]);
      const page = await renderSettings();
      const field = page.query('[aria-label="Name for Health"]') as HTMLInputElement;

      field.value = 'Wellbeing';
      await change(page, field);

      expect(updateCategory).toHaveBeenCalledWith(category, { name: 'Wellbeing' });
    });

    it('does not write a name that has not changed', async () => {
      categories.set([makeCategory({ name: 'Health' })]);
      const page = await renderSettings();
      const field = page.query('[aria-label="Name for Health"]') as HTMLInputElement;

      field.value = '  Health  ';
      await change(page, field);

      expect(updateCategory).not.toHaveBeenCalled();
    });

    it('refuses to blank a category’s name', async () => {
      categories.set([makeCategory({ name: 'Health' })]);
      const page = await renderSettings();
      const field = page.query('[aria-label="Name for Health"]') as HTMLInputElement;

      field.value = '   ';
      await change(page, field);

      expect(updateCategory).not.toHaveBeenCalled();
    });

    it('recolours', async () => {
      const category = makeCategory({ name: 'Health', colour: '#6366f1' });
      categories.set([category]);
      const page = await renderSettings();
      const swatch = page.query('[aria-label="Colour for Health"]') as HTMLInputElement;

      swatch.value = '#ff0000';
      await change(page, swatch);

      expect(updateCategory).toHaveBeenCalledWith(category, { colour: '#ff0000' });
    });

    it('deletes', async () => {
      const category = makeCategory({ name: 'Health' });
      categories.set([category]);
      const page = await renderSettings();

      await page.click(page.query('[aria-label="Delete Health"]') as HTMLElement);

      expect(removeCategory).toHaveBeenCalledWith(category);
    });

    it('says so when there are none', async () => {
      const page = await renderSettings();
      expect(page.el.textContent).toContain('No categories yet.');
    });
  });

  it('shows a placeholder rather than an empty form before the row arrives', async () => {
    settings.set(null);

    const page = await renderSettings();

    expect(page.query('select')).toBeNull();
    expect(page.el.textContent).toContain('Preferences');
  });
});
