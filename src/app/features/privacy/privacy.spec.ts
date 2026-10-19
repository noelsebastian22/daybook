import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { render } from '../../../testing/render';
import { routes } from '../../app.routes';
import { PRIVACY_CONTACT, PRIVACY_UPDATED, Privacy } from './privacy';

async function renderPrivacy() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  return render(Privacy);
}

describe('Privacy', () => {
  it('is reachable signed out: a top-level route with no guard', () => {
    // Google's brand verification fetches this page as a stranger. Behind
    // authGuard it would get /welcome instead and fail verification.
    const route = routes.find((r) => r.path === 'privacy');
    expect(route).toBeDefined();
    expect(route?.canActivate).toBeUndefined();
    expect(route?.title).toBe('Privacy');
  });

  it('names who runs it and when it was last changed', async () => {
    const r = await renderPrivacy();
    expect(r.query('h1')?.textContent?.trim()).toBe('Privacy');
    expect(r.el.textContent).toContain(`Last updated ${PRIVACY_UPDATED}`);
    expect(r.el.textContent).toContain('Noel Sebastian');
  });

  it('gives a working contact address', async () => {
    const r = await renderPrivacy();
    const mail = r.query('a[href^="mailto:"]') as HTMLAnchorElement | null;
    expect(mail?.getAttribute('href')).toBe(`mailto:${PRIVACY_CONTACT}`);
    expect(mail?.textContent?.trim()).toBe(PRIVACY_CONTACT);
  });

  it('names every service that handles user data', async () => {
    // A new processor has to be added here and on the page together.
    const r = await renderPrivacy();
    for (const name of ['Supabase', 'Vercel', 'Resend', 'Google', 'Anthropic']) {
      expect(r.el.textContent).toContain(name);
    }
  });

  it('says how to delete an account', async () => {
    const r = await renderPrivacy();
    const headings = r.queryAll('h2').map((h) => h.textContent?.trim());
    expect(headings).toContain('Keeping it, and deleting it');
    expect(r.el.textContent).toContain('To delete your account, email me');
  });

  it('uses no dashes as punctuation in its copy', async () => {
    // Noel's voice rule. Hyphens in words are fine; en and em dashes are not.
    const r = await renderPrivacy();
    expect(r.el.textContent).not.toMatch(/[–—]/);
  });
});
