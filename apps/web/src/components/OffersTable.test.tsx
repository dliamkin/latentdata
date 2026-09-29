import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { toRows } from '../data/offers.ts';
import { snapshot } from '../data/snapshot.ts';
import { renderWithProviders } from '../test/render.tsx';
import { OffersTable } from './OffersTable.tsx';

const rows = toRows(snapshot.offers, '2026-09-29');
const none = new Set<string>();

function bodyRows() {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .filter((row) => row.querySelector('[data-offer-id]') !== null);
}

describe('OffersTable', () => {
  it('hides expired offers until asked, and searches', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <OffersTable rows={rows} quickFilter={null} newIds={none} initialReveal={null} />,
    );
    expect(bodyRows()).toHaveLength(6);

    await user.click(screen.getByRole('checkbox', { name: 'Show expired offers' }));
    expect(bodyRows()).toHaveLength(8);

    const search = screen.getByRole('searchbox', { name: 'Search offers' });
    await user.type(search, 'Evergreen');
    expect(bodyRows()).toHaveLength(0);
    await user.clear(search);
    await user.type(search, 'Fixture AI');
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('Fixture AI Fundamentals badge');
  });

  it('applies the quick filter and mutes training-only rows', () => {
    renderWithProviders(
      <OffersTable rows={rows} quickFilter="evergreen" newIds={none} initialReveal={null} />,
    );
    const shown = bodyRows();
    expect(shown).toHaveLength(2);
    expect(shown.some((row) => row.classList.contains('row-muted'))).toBe(true);
  });

  it('reveals an expired row from a deep link, expanded and focused', () => {
    renderWithProviders(
      <OffersTable rows={rows} quickFilter={null} newIds={none} initialReveal="fx-expired" />,
    );
    const tr = screen.getByText('Fixture Data Engineer free exam (2020)').closest('tr');
    expect(tr).not.toBeNull();
    expect(document.activeElement).toBe(tr);
    expect(
      screen.getByRole('region', { name: /Details for Fixture Data Engineer/ }),
    ).toBeInTheDocument();
  });

  it('keeps the default view when a revealed id is unknown', () => {
    renderWithProviders(
      <OffersTable rows={rows} quickFilter={null} newIds={none} initialReveal="nope" />,
    );
    expect(bodyRows()).toHaveLength(6);
  });

  it('records a tracking status per offer', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <OffersTable rows={rows} quickFilter="active" newIds={none} initialReveal={null} />,
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'My status for Fixture Cloud Architect exam voucher' }),
      'earned',
    );
    expect(
      JSON.parse(window.localStorage.getItem('cert-tracker:tracking:v1') ?? '{}'),
    ).toMatchObject({ entries: { 'fx-active-long': { status: 'earned' } } });
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(
      <OffersTable rows={rows} quickFilter={null} newIds={none} initialReveal={null} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
