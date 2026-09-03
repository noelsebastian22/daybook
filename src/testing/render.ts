import { type ComponentRef, type Provider, type Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

export interface RenderOptions<T> {
  /** Signal inputs to set before the first render. */
  inputs?: Partial<{ [K in keyof T]: unknown }>;
  /** Extra providers — usually a fake store for the component under test. */
  providers?: Provider[];
}

export interface Rendered<T> {
  fixture: ComponentFixture<T>;
  componentRef: ComponentRef<T>;
  component: T;
  /** The rendered host element. */
  el: HTMLElement;
  /** First match, or `null`. */
  query: (selector: string) => HTMLElement | null;
  /** All matches, as a real array. */
  queryAll: (selector: string) => HTMLElement[];
  /** First element whose trimmed text contains `text`. Case-insensitive. */
  byText: (selector: string, text: string) => HTMLElement | null;
  /** Click and settle. */
  click: (target: HTMLElement | string) => Promise<void>;
  /** Flush pending effects and re-render. */
  settle: () => Promise<void>;
  /** Set a signal input after the first render, then settle. */
  setInput: (name: string, value: unknown) => Promise<void>;
}

/**
 * Renders a standalone component and settles it.
 *
 * The `await` on every interaction is not ceremony. The app is zoneless, so
 * nothing re-renders on its own — a spec that clicks and then asserts without
 * awaiting reads the DOM as it was *before* the click, and the failure looks
 * like the handler never ran. `whenStable()` flushes the effect queue and the
 * render, which is what makes these specs deterministic rather than
 * timing-dependent.
 *
 * `TestBed.configureTestingModule` is additive here — the global providers in
 * `test-providers.ts` are already installed, so `providers` overrides them
 * rather than replacing them.
 */
export async function render<T>(
  component: Type<T>,
  { inputs = {}, providers = [] }: RenderOptions<T> = {},
): Promise<Rendered<T>> {
  if (providers.length) {
    TestBed.configureTestingModule({ providers });
  }

  const fixture = TestBed.createComponent(component);

  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }

  await fixture.whenStable();

  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
  };

  const query = (selector: string) => el.querySelector<HTMLElement>(selector);

  return {
    fixture,
    componentRef: fixture.componentRef,
    component: fixture.componentInstance,
    el,
    query,
    queryAll: (selector: string) => Array.from(el.querySelectorAll<HTMLElement>(selector)),
    byText: (selector: string, text: string) => {
      const wanted = text.trim().toLowerCase();
      return (
        Array.from(el.querySelectorAll<HTMLElement>(selector)).find((node) =>
          (node.textContent ?? '').trim().toLowerCase().includes(wanted),
        ) ?? null
      );
    },
    click: async (target: HTMLElement | string) => {
      const node = typeof target === 'string' ? query(target) : target;
      if (!node) throw new Error(`click: no element matching ${String(target)}`);
      node.click();
      await settle();
    },
    settle,
    setInput: async (name: string, value: unknown) => {
      fixture.componentRef.setInput(name, value);
      await settle();
    },
  };
}
