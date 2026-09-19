import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../../../testing/render';
import { Access } from '../../core/access';
import type { AccessOutcome } from '../../core/models';
import { RequestAccess } from './request-access';

/**
 * Stubs the one outward call and installs a router.
 *
 * `provideRouter` goes through `configureTestingModule` rather than
 * `render`'s `providers`, which is typed `Provider[]` and will not take
 * `EnvironmentProviders`. Same arrangement as `login.spec.ts`. The template
 * carries three `routerLink`s, so `RouterLink` needs a `Router` to inject
 * even though nothing here navigates.
 */
function stub(outcome: AccessOutcome | Error) {
  const request = vi.fn(async () => {
    if (outcome instanceof Error) throw outcome;
    return outcome;
  });

  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: Access, useValue: { request } }],
  });

  return request;
}

async function submit(outcome: AccessOutcome | Error, email = 'Someone@Example.com') {
  const request = stub(outcome);
  const r = await render(RequestAccess);

  const input = r.query('#email') as HTMLInputElement;
  input.value = email;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await r.settle();

  await r.click('button[type="submit"]');
  return { ...r, request };
}

describe('RequestAccess', () => {
  it('shows the form first', async () => {
    stub('created');
    const r = await render(RequestAccess);
    expect(r.query('#email')).not.toBeNull();
  });

  it('normalizes the address before asking', async () => {
    const { request } = await submit('created');
    expect(request).toHaveBeenCalledWith('someone@example.com', '');
  });

  it('confirms a new request', async () => {
    const r = await submit('created');
    expect(r.el.textContent).toContain('be in touch');
    expect(r.query('#email')).toBeNull();
  });

  it('says a repeat request is already waiting', async () => {
    const r = await submit('pending');
    expect(r.el.textContent).toContain('waiting to be approved');
  });

  it('sends an approved address to sign in', async () => {
    const r = await submit('approved');
    expect(r.el.textContent).toContain('approved');
    expect(r.query('a[href="/login"]')).not.toBeNull();
  });

  it('tells a denied address the truth', async () => {
    const r = await submit('denied');
    expect(r.el.textContent).toContain("wasn't approved");
  });

  it('keeps the form when the call fails', async () => {
    const r = await submit(new Error('offline'));
    expect(r.query('#email')).not.toBeNull();
  });

  it('will not submit an empty address', async () => {
    const request = stub('created');
    const r = await render(RequestAccess);
    await r.click('button[type="submit"]');
    expect(request).not.toHaveBeenCalled();
  });
});
