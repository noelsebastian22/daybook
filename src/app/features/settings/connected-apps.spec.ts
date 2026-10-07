import { describe, expect, it, vi } from 'vitest';
import { render } from '../../../testing/render';
import { OAuthConsent, type ConnectedApp } from '../../core/oauth-consent';
import { ToastStore } from '../../core/toast.store';
import { ConnectedApps } from './connected-apps';

const CLAUDE: ConnectedApp = { clientId: 'c1', name: 'Claude', grantedAt: '2026-10-06T10:00:00Z' };
const CURSOR: ConnectedApp = { clientId: 'c2', name: 'Cursor', grantedAt: '2026-10-01T10:00:00Z' };

function stub(apps: ConnectedApp[] | Error, disconnect: () => Promise<void> = async () => {}) {
  const disconnectFn = vi.fn(disconnect);
  return {
    disconnectFn,
    providers: [
      {
        provide: OAuthConsent,
        useValue: {
          connectedApps: async () => {
            if (apps instanceof Error) throw apps;
            return apps;
          },
          disconnect: disconnectFn,
        },
      },
    ],
  };
}

describe('ConnectedApps', () => {
  it('lists each app with a way to disconnect it', async () => {
    const { providers } = stub([CLAUDE, CURSOR]);
    const r = await render(ConnectedApps, { providers });
    await r.settle();
    expect(
      r
        .queryAll('li')
        .map((li) => li.textContent?.includes('Claude') || li.textContent?.includes('Cursor')),
    ).toEqual([true, true]);
    expect(r.query('[aria-label="Disconnect Claude"]')).not.toBeNull();
  });

  it('says when there are none', async () => {
    const { providers } = stub([]);
    const r = await render(ConnectedApps, { providers });
    await r.settle();
    expect(r.el.textContent).toContain('None yet');
  });

  it('disconnects, drops the row and says so', async () => {
    const { providers, disconnectFn } = stub([CLAUDE, CURSOR]);
    const r = await render(ConnectedApps, { providers });
    await r.settle();
    await r.click('[aria-label="Disconnect Claude"]');
    await r.settle();
    expect(disconnectFn).toHaveBeenCalledWith('c1');
    expect(r.query('[aria-label="Disconnect Claude"]')).toBeNull();
    expect(r.query('[aria-label="Disconnect Cursor"]')).not.toBeNull();
  });

  it('keeps the row and reports a failed disconnect', async () => {
    const { providers } = stub([CLAUDE], async () => {
      throw new Error('offline');
    });
    const r = await render(ConnectedApps, { providers });
    await r.settle();
    await r.click('[aria-label="Disconnect Claude"]');
    await r.settle();
    expect(r.query('[aria-label="Disconnect Claude"]')).not.toBeNull();
    const toast = r.fixture.debugElement.injector.get(ToastStore);
    expect(toast.toasts().some((t) => t.message === 'Could not disconnect Claude.')).toBe(true);
  });

  it('keeps a failure to load inside its own box', async () => {
    const { providers } = stub(new Error('oauth server off'));
    const r = await render(ConnectedApps, { providers });
    await r.settle();
    expect(r.el.textContent).toContain('Could not load connected apps');
  });
});
