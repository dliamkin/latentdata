import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ADMIN_TOKEN_KEY, savePending } from './admin/auth.ts';
import App from './App.tsx';
import { CLAIM_KEY } from './data/claim.ts';
import { API, AUTH, candidate, fakeToken, stubAdminEnv, stubFetch } from './test/admin.ts';

describe('App', () => {
  it('renders the landmarks and the public tabs', async () => {
    const { container } = render(<App />);
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'LatentData Cert Promo Tracker' }),
    ).toBeInTheDocument();
    // Offers and Watch list carry a count after the label
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent.replace(/[0-9]+$/, ''))).toEqual(
      ['Offers', 'Calendar', 'Watch list', 'Certifications', 'Activity'],
    );
    expect(screen.queryByRole('tab', { name: /Review/ })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says in the banner what is free today and what it normally costs', () => {
    render(<App />);
    expect(screen.getByText(/Open now:/)).toHaveTextContent(
      'Open now: 2 offers that cost nothing · $200 in exam fees waived',
    );
  });

  it('hides what the visitor cannot claim, on every tab, and remembers the answer', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    const offers = (): number => document.querySelectorAll('tr [data-offer-id]').length;
    expect(offers()).toBe(6);

    const who = screen.getByRole('group', { name: 'Who you are' });
    await user.click(within(who).getByRole('button', { name: 'None of these' }));
    // the three open to everyone; the student, partner and customer offers are gone
    expect(offers()).toBe(3);
    expect(within(who).getByRole('status')).toHaveTextContent('4 hidden');
    expect(screen.getByRole('tab', { name: /Offers/ })).toHaveTextContent('3');

    await user.click(within(who).getByRole('button', { name: 'A student' }));
    expect(offers()).toBe(4);

    unmount();
    render(<App />);
    expect(offers()).toBe(4);
    localStorage.removeItem(CLAIM_KEY);
  });

  it('puts the doc pages in the footer and nowhere else', () => {
    render(<App />);
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Copyright © 2026');
    // reachable only from here: neither page is a tab
    expect(within(footer).getByRole('link', { name: 'How it works' })).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Privacy|How it works/ })).not.toBeInTheDocument();
  });

  it('opens a doc page from the footer and leaves the tab bar behind', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(screen.getByRole('link', { name: 'Privacy' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(window.location.hash).toBe('#privacy');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('reaches a doc page from the hash alone', async () => {
    render(<App />);
    await act(async () => {
      window.location.hash = '#architecture';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'How it works' }),
    ).toBeInTheDocument();
  });

  it('does not change route when the skip link is used', async () => {
    render(<App />);
    await act(async () => {
      window.location.hash = '#calendar';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(screen.getByRole('tab', { name: /Calendar/, selected: true })).toBeInTheDocument();
    // the skip link is href="#main"; before routeFromHash took the current route into account
    // this bounced the visitor back to Offers
    await act(async () => {
      window.location.hash = '#main';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(screen.getByRole('tab', { name: /Calendar/, selected: true })).toBeInTheDocument();
  });

  it('follows the location hash', async () => {
    render(<App />);
    await act(async () => {
      window.location.hash = '#watchlist';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      await Promise.resolve();
    });
    expect(screen.getByRole('tab', { name: /Watch list/, selected: true })).toBeInTheDocument();
    // the tab's chunk is lazy, so the section arrives a tick later
    expect(
      await screen.findByRole('heading', { level: 2, name: /To keep an eye on/ }),
    ).toBeInTheDocument();
  });

  it('opens the admin dialog on Shift+A twice and cancels back', async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByTestId('theme-toggle');
    toggle.focus();
    // the shortcut only counts two presses inside 800ms of wall clock, which a loaded test
    // machine can blow through between the two renders
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    await user.keyboard('{Shift>}A{/Shift}{Shift>}A{/Shift}');
    clock.mockRestore();
    const dialog = await screen.findByRole('dialog', { name: 'Enter admin mode' });
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    // the dialog leaves through a CSS transition, so it unmounts a beat later
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Enter admin mode' })).not.toBeInTheDocument();
    });
  });

  it('says sign-in is not set up in a build without the admin settings', async () => {
    window.history.replaceState(null, '', '/?admin');
    render(<App />);
    const dialog = await screen.findByRole('dialog', { name: 'Enter admin mode' });
    expect(dialog).toHaveTextContent('not set up in this build');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    window.history.replaceState(null, '', '/');
  });

  it('ignores whatever an older build left in the token slot', () => {
    // the dialog used to accept any string; none of them is a session
    window.sessionStorage.setItem(ADMIN_TOKEN_KEY, 'secret');
    render(<App />);
    expect(screen.queryByRole('tab', { name: /Review/ })).not.toBeInTheDocument();
  });

  describe('with admin sign-in configured', () => {
    beforeEach(() => {
      stubAdminEnv();
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      window.history.replaceState(null, '', '/');
    });

    it('shows the Review tab while the session token is live', () => {
      stubFetch({ [`GET ${API}/admin/candidates`]: { body: { candidates: [] } } });
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, fakeToken());
      render(<App />);
      expect(screen.getByRole('tab', { name: /Review/ })).toBeInTheDocument();
    });

    it('finishes the sign-in when the hosted pages send the browser back', async () => {
      const idToken = fakeToken();
      const fetcher = stubFetch({
        [`POST ${AUTH}/oauth2/token`]: { body: { id_token: idToken } },
        [`GET ${API}/admin/candidates`]: { body: { candidates: [candidate()] } },
      });
      savePending({ state: 's1', verifier: 'v1' });
      window.history.replaceState(null, '', '/?code=abc&state=s1');
      render(<App />);
      expect(
        await screen.findByRole('tab', { name: /Review/, selected: true }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('heading', { level: 3, name: 'Vendor free exam week' }),
      ).toBeInTheDocument();
      expect(window.sessionStorage.getItem(ADMIN_TOKEN_KEY)).toBe(idToken);
      // the one-time code must not stay in the address bar
      expect(window.location.search).toBe('');
      expect(fetcher).toHaveBeenCalledWith(`${AUTH}/oauth2/token`, expect.anything());
    });

    it('opens the dialog with the reason when the sign-in does not check out', async () => {
      stubFetch({});
      savePending({ state: 's1', verifier: 'v1' });
      window.history.replaceState(null, '', '/?code=abc&state=forged');
      render(<App />);
      const dialog = await screen.findByRole('dialog', { name: 'Enter admin mode' });
      expect(dialog).toHaveTextContent('did not start in this tab');
      expect(screen.queryByRole('tab', { name: /Review/ })).not.toBeInTheDocument();
    });
  });
});
