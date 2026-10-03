import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { render } from '../../../testing/render';
import { Access } from '../../core/access';
import type { AccessDecision, AccessLookup } from '../../core/models';
import { AccessDecide } from './access-decide';

const PENDING: AccessLookup = {
  state: 'pending',
  email: 'stranger@example.com',
  note: 'For my week',
};

/**
 * Stubs both outward calls and puts `fragment` where the router would.
 * Same arrangement as request-access.spec.ts: `provideRouter` goes through
 * `configureTestingModule` because `render`'s providers will not take it.
 */
function stub(
  lookup: AccessLookup | Error,
  decision: AccessDecision | Error = { state: 'approved', email: 'stranger@example.com' },
  fragment: string | null = 'token=abc123',
) {
  const lookupFn = vi.fn(async () => {
    if (lookup instanceof Error) throw lookup;
    return lookup;
  });
  const decideFn = vi.fn(async () => {
    if (decision instanceof Error) throw decision;
    return decision;
  });

  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: Access, useValue: { lookup: lookupFn, decide: decideFn } },
      { provide: ActivatedRoute, useValue: { snapshot: { fragment } } },
    ],
  });

  return { lookupFn, decideFn };
}

const button = (el: HTMLElement, label: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

describe('AccessDecide', () => {
  it('looks the token up from the fragment', async () => {
    const { lookupFn } = stub(PENDING);
    await render(AccessDecide);
    expect(lookupFn).toHaveBeenCalledWith('abc123');
  });

  it('shows who asked and what they said, with both choices', async () => {
    stub(PENDING);
    const r = await render(AccessDecide);
    expect(r.el.textContent).toContain('stranger@example.com');
    expect(r.el.textContent).toContain('For my week');
    expect(button(r.el, 'Approve')).toBeDefined();
    expect(button(r.el, 'Deny')).toBeDefined();
  });

  // Opening the link must never decide. A mail scanner that fetches it, or
  // Noel opening it to read, has to leave the request exactly as it was.
  it('decides nothing until a button is pressed', async () => {
    const { decideFn } = stub(PENDING);
    await render(AccessDecide);
    expect(decideFn).not.toHaveBeenCalled();
  });

  it('approves with the token from the link', async () => {
    const { decideFn } = stub(PENDING);
    const r = await render(AccessDecide);
    button(r.el, 'Approve')!.click();
    await r.settle();
    expect(decideFn).toHaveBeenCalledWith('abc123', 'approve');
    expect(r.el.textContent).toContain('Approved');
    expect(r.el.textContent).toContain('has been emailed');
  });

  it('denies, and says nothing was sent', async () => {
    const { decideFn } = stub(PENDING, { state: 'denied', email: 'stranger@example.com' });
    const r = await render(AccessDecide);
    button(r.el, 'Deny')!.click();
    await r.settle();
    expect(decideFn).toHaveBeenCalledWith('abc123', 'deny');
    expect(r.el.textContent).toContain('Nothing was sent');
  });

  it('says a used link is no longer valid', async () => {
    stub({ state: 'invalid' });
    const r = await render(AccessDecide);
    expect(r.el.textContent).toContain('no longer valid');
    expect(button(r.el, 'Approve')).toBeUndefined();
  });

  it('says an expired link has expired', async () => {
    stub({ state: 'expired' });
    const r = await render(AccessDecide);
    expect(r.el.textContent).toContain('expired');
    expect(button(r.el, 'Approve')).toBeUndefined();
  });

  it('treats a link with no token as invalid without calling out', async () => {
    const { lookupFn } = stub(PENDING, undefined, null);
    const r = await render(AccessDecide);
    expect(lookupFn).not.toHaveBeenCalled();
    expect(r.el.textContent).toContain('no longer valid');
  });

  it('reports a lookup that could not reach the server', async () => {
    stub(new Error('offline'));
    const r = await render(AccessDecide);
    expect(r.el.textContent).toContain('Could not load');
  });

  // A failed decision leaves the token unspent, so the buttons stay and
  // pressing again is the fix.
  it('keeps the choices when a decision fails', async () => {
    stub(PENDING, new Error('offline'));
    const r = await render(AccessDecide);
    button(r.el, 'Approve')!.click();
    await r.settle();
    expect(button(r.el, 'Approve')).toBeDefined();
  });
});
