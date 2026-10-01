import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { toCatalogRows } from '../data/catalog.ts';
import { toRows } from '../data/offers.ts';
import { snapshot } from '../data/snapshot.ts';
import { renderWithProviders } from '../test/render.tsx';
import { CatalogView } from './CatalogView.tsx';

const rows = toCatalogRows(snapshot.catalog, toRows(snapshot.offers, '2026-09-29'));

function rowNames(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.offer-title')?.textContent ?? '');
}

describe('CatalogView', () => {
  it('groups credentials by field and says what each costs today', () => {
    renderWithProviders(<CatalogView rows={rows} onReveal={vi.fn()} />);
    expect(
      screen.getByRole('heading', { level: 2, name: /What people ask for · 5/ }),
    ).toBeVisible();
    expect(
      screen
        .getAllByRole('region')
        .map((region) => region.getAttribute('aria-label'))
        .filter((label) => label !== null),
    ).toEqual(['Development', 'Cloud', 'Security', 'Project management']);

    const cloud = screen.getByRole('region', { name: 'Cloud' });
    expect(within(cloud).getByText('Free now')).toBeVisible();
    expect(within(cloud).getByText('$200')).toBeVisible();
    expect(within(cloud).getByText('Saves $200 today')).toBeVisible();

    const pm = screen.getByRole('region', { name: 'Project management' });
    expect(within(pm).getByText('No offer now')).toBeVisible();
    expect(within(pm).getByText('Price not published')).toBeVisible();
  });

  it('marks a course and keeps a free one honest about its price', () => {
    renderWithProviders(<CatalogView rows={rows} onReveal={vi.fn()} />);
    const dev = screen.getByRole('region', { name: 'Development' });
    expect(within(dev).getByText('Course')).toBeVisible();
    expect(within(dev).getByText('Free')).toBeVisible();
  });

  it('reveals the offer that covers a credential', async () => {
    const onReveal = vi.fn();
    renderWithProviders(<CatalogView rows={rows} onReveal={onReveal} />);
    await userEvent.click(
      screen.getByRole('button', { name: /Fixture Cloud Architect exam voucher/ }),
    );
    expect(onReveal).toHaveBeenCalledWith('fx-active-long');
  });

  it('filters by kind, by technology and by having an offer now', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CatalogView rows={rows} onReveal={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Courses' }));
    expect(rowNames()).toEqual(['Fixture Python EssentialsCourse']);

    await user.click(screen.getByRole('button', { name: 'All' }));
    await user.click(screen.getByRole('checkbox', { name: /only credentials with an offer/i }));
    expect(rowNames()).toHaveLength(3);
    expect(rowNames()).not.toContain('Fixture Python EssentialsCourse');
  });

  it('shows only what the shell handed it', () => {
    renderWithProviders(
      <CatalogView rows={rows.filter((row) => row.tracks.includes('it'))} onReveal={vi.fn()} />,
    );
    expect(
      screen.getByRole('heading', { level: 2, name: /What people ask for · 2/ }),
    ).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Project management' })).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<CatalogView rows={rows} onReveal={vi.fn()} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
