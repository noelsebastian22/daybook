import { signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionStore } from '../../core/session.store';
import { render, type Rendered } from '../../../testing/render';
import { Login } from './login';

let busy: WritableSignal<boolean>;
let magicLinkSentTo: WritableSignal<string | null>;
let signInWithGoogle: ReturnType<typeof vi.fn>;
let signInWithMagicLink: ReturnType<typeof vi.fn>;

async function renderLogin(): Promise<Rendered<Login>> {
  return render(Login);
}

async function typeEmail(page: Rendered<Login>, value: string): Promise<void> {
  const field = page.query('input[type="email"]') as HTMLInputElement;
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await page.settle();
}

function submitButton(page: Rendered<Login>): HTMLButtonElement {
  return page.query('button[type="submit"]') as HTMLButtonElement;
}

describe('Login', () => {
  beforeEach(() => {
    busy = signal(false);
    magicLinkSentTo = signal<string | null>(null);
    signInWithGoogle = vi.fn();
    signInWithMagicLink = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SessionStore,
          useValue: { busy, magicLinkSentTo, signInWithGoogle, signInWithMagicLink },
        },
      ],
    });
  });

  it('gives the page a heading, filled by the real lockup', async () => {
    const page = await renderLogin();
    expect(page.query('h1')?.querySelector('app-logo')).not.toBeNull();
  });

  it('says what Daybook is before asking anyone to sign in', async () => {
    const page = await renderLogin();
    expect(page.el.textContent).toContain('One page per day');
  });

  it('signs in with Google', async () => {
    const page = await renderLogin();
    await page.click(page.byText('button', 'Continue with Google') as HTMLElement);

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('hides the Google glyph, which the button text already names', async () => {
    const page = await renderLogin();
    const google = page.byText('button', 'Continue with Google');
    expect(google?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('will not send a link before an address has been typed', async () => {
    const page = await renderLogin();
    expect(submitButton(page).disabled).toBe(true);

    await typeEmail(page, 'noel@example.test');
    expect(submitButton(page).disabled).toBe(false);
  });

  it('sends the link to the address typed, trimmed', async () => {
    const page = await renderLogin();
    await typeEmail(page, '  noel@example.test  ');

    (page.query('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await page.settle();

    expect(signInWithMagicLink).toHaveBeenCalledWith('noel@example.test');
  });

  it('locks both routes in while a sign-in is in flight', async () => {
    const page = await renderLogin();
    await typeEmail(page, 'noel@example.test');

    busy.set(true);
    await page.settle();

    expect(submitButton(page).disabled).toBe(true);
    expect((page.byText('button', 'Continue with Google') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(submitButton(page).textContent?.trim()).toBe('Sending...');
  });

  it('confirms where the link went, and stops offering the form', async () => {
    const page = await renderLogin();
    magicLinkSentTo.set('noel@example.test');
    await page.settle();

    expect(page.el.textContent).toContain('noel@example.test');
    expect(page.el.textContent).toContain('Open it on this device');
    expect(page.query('form')).toBeNull();
  });

  it('offers a way to read about the app instead of signing in', async () => {
    const page = await renderLogin();
    expect(page.byText('a', 'What is Daybook?')).not.toBeNull();
  });
});
