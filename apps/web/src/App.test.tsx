import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import App from './App.tsx';

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

  it('shows the Review tab once a token is entered', async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, '', '/?admin');
    render(<App />);
    await user.type(screen.getByLabelText('Admin token'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Enter admin mode' }));
    expect(screen.getByRole('tab', { name: /Review/ })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('cert-tracker:admin-token:v1')).toBe('secret');
    window.history.replaceState(null, '', '/');
  });
});
