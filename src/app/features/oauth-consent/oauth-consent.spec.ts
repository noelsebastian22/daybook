import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../../testing/render';
import { OAuthConsent, type ConsentLookup } from '../../core/oauth-consent';
import { takeReturn } from '../../core/return-to';
import { SessionStore } from '../../core/session.store';
import { OAuthConsentPage } from './oauth-consent';

const CONSENT: ConsentLookup = {
  state: 'consent',
  request: {
    authorizationId: 'auth-1',
    clientName: 'Claude',
    redirectHost: 'claude.ai',
    loopback: false,
    email: 'noel@example.test',
  },
};

/**
 * Stubs the OAuth calls, the session and the query string. Same arrangement
 * as access-decide.spec.ts: `provideRouter` through `configureTestingModule`.
 */
function stub(
  lookup: ConsentLookup | Error,
  {
    signedIn = true,
    id = 'auth-1' as string | null,
    decision = 'https://claude.ai/api/mcp/auth_callback?code=xyz' as string | Error,
  } = {},
) {
  const lookupFn = vi.fn(async () => {
    if (lookup instanceof Error) throw lookup;
    return lookup;
  });
  const decideFn = vi.fn(async () => {
    if (decision instanceof Error) throw decision;
    return decision;
  });
  const leaveFn = vi.fn();

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: OAuthConsent, useValue: { lookup: lookupFn, decide: decideFn, leave: leaveFn } },
      {
        provide: SessionStore,
        useValue: { isResolved: signal(true), isAuthenticated: signal(signedIn) },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap(id ? { authorization_id: id } : {}) },
        },
      },
    ],
  });

  return { lookupFn, decideFn, leaveFn };
}

const button = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

async function settled(r: { settle: () => Promise<void> }) {
  for (let i = 0; i < 3; i++) await r.settle();
}

describe('OAuthConsentPage', () => {
  afterEach(() => localStorage.clear());

  it('names the app, the account, what it can do and where the browser goes next', async () => {
    const { lookupFn } = stub(CONSENT);
    const r = await render(OAuthConsentPage);
    await settled(r);
    expect(lookupFn).toHaveBeenCalledWith('auth-1');
    const text = r.el.textContent ?? '';
    expect(text).toContain('Claude wants to use your Daybook');
    expect(text).toContain('noel@example.test');
    expect(text).toContain('add, change, complete, move and delete tasks');
    expect(text).toContain('claude.ai');
    expect(button(r.el, 'Allow')).toBeDefined();
    expect(button(r.el, 'Deny')).toBeDefined();
  });

  it('decides nothing until a button is pressed', async () => {
    const { decideFn, leaveFn } = stub(CONSENT);
    const r = await render(OAuthConsentPage);
    await settled(r);
    expect(decideFn).not.toHaveBeenCalled();
    expect(leaveFn).not.toHaveBeenCalled();
  });

  it('allows, then says where it is going and goes', async () => {
    const { decideFn, leaveFn } = stub(CONSENT);
    const r = await render(OAuthConsentPage);
    await settled(r);
    button(r.el, 'Allow')!.click();
    await settled(r);
    expect(decideFn).toHaveBeenCalledWith('auth-1', 'approve');
    expect(leaveFn).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=xyz');
    expect(r.el.textContent).toContain('Taking you back to claude.ai');
  });

  it('denies through the same door', async () => {
    const { decideFn, leaveFn } = stub(CONSENT, {
      decision: 'https://claude.ai/api/mcp/auth_callback?error=access_denied',
    });
    const r = await render(OAuthConsentPage);
    await settled(r);
    button(r.el, 'Deny')!.click();
    await settled(r);
    expect(decideFn).toHaveBeenCalledWith('auth-1', 'deny');
    expect(leaveFn).toHaveBeenCalled();
  });

  it('warns when the redirect is a program on this computer', async () => {
    stub({
      state: 'consent',
      request: { ...CONSENT.request, redirectHost: 'localhost:3118', loopback: true },
    } as ConsentLookup);
    const r = await render(OAuthConsentPage);
    await settled(r);
    expect(r.query('[role="note"]')?.textContent).toContain('program on this computer');
  });

  it('goes straight back when the app was already allowed', async () => {
    const { leaveFn } = stub({ state: 'redirect', url: 'https://claude.ai/cb?code=1' });
    const r = await render(OAuthConsentPage);
    await settled(r);
    expect(leaveFn).toHaveBeenCalledWith('https://claude.ai/cb?code=1');
  });

  it('sends a signed-out visitor to sign in, and remembers to come back', async () => {
    const { lookupFn } = stub(CONSENT, { signedIn: false });
    const r = await render(OAuthConsentPage);
    await settled(r);
    expect(lookupFn).not.toHaveBeenCalled();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    button(r.el, 'Sign in')!.click();
    await settled(r);
    expect(navigate).toHaveBeenCalledWith(['/login']);
    expect(takeReturn()).toBe('/oauth/consent?authorization_id=auth-1');
  });

  it('says a link with no request is missing one, without calling out', async () => {
    const { lookupFn } = stub(CONSENT, { id: null });
    const r = await render(OAuthConsentPage);
    await settled(r);
    expect(lookupFn).not.toHaveBeenCalled();
    expect(r.el.textContent).toContain('missing its request');
  });

  it('reports a request that could not be loaded', async () => {
    stub(new Error('expired'));
    const r = await render(OAuthConsentPage);
    await settled(r);
    expect(r.el.textContent).toContain('Could not load this request');
  });

  it('keeps the choices when a decision fails', async () => {
    const { leaveFn } = stub(CONSENT, { decision: new Error('offline') });
    const r = await render(OAuthConsentPage);
    await settled(r);
    button(r.el, 'Allow')!.click();
    await settled(r);
    expect(leaveFn).not.toHaveBeenCalled();
    expect(button(r.el, 'Allow')?.disabled).toBe(false);
  });
});
