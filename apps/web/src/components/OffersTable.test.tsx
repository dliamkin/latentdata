import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { toRows } from '../data/offers.ts';
import { snapshot } from '../data/snapshot.ts';
import { renderWithProviders } from '../test/render.tsx';
import { OffersTable } from './OffersTable.tsx';

const rows = toRows(snapshot.offers, '2026-09-29', snapshot.catalog);
const none = new Set<string>();

function bodyRows() {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .filter((row) => row.querySelector('[data-offer-id]') !== null);
}

function chip(name: string) {
  return screen.getByRole('button', { name: new RegExp(`^${name}`) });
}

describe('OffersTable', () => {
  it('filters by vendor from the chips, adding one vendor at a time', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <OffersTable rows={rows} quickFilter={null} newIds={none} initialReveal={null} />,
    );
    expect(bodyRows()).toHaveLength(6);

    await user.click(chip('Fixture Cloud'));
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]).toHaveTextContent('Fixture Cloud Architect exam voucher');

    // a second vendor widens the result rather than replacing the first
    await user.click(chip('Fixture AI'));
    expect(bodyRows()).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'All vendors' }));
    expect(bodyRows()).toHaveLength(6);
  });

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

  it('keeps only what costs nothing when asked for 100% free', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <OffersTable rows={rows} quickFilter={null} newIds={none} initialReveal={null} />,
    );
    await user.click(screen.getByRole('checkbox', { name: 'Show only offers that cost nothing' }));
    // gone: the discount, the paid certificate, and the free exam that needs a purchase first
    expect(
      bodyRows()
        .map((row) => row.querySelector('[data-offer-id]')?.getAttribute('data-offer-id'))
        .sort(),
    ).toEqual(['fx-active-long', 'fx-evergreen', 'fx-unverified']);
    for (const row of bodyRows()) expect(row).toHaveTextContent('100% free');
  });

  it('names every filter in force above the table and takes one off at a time', async () => {
    const user = userEvent.setup();
    const onClearQuickFilter = vi.fn();
    renderWithProviders(
      <OffersTable
        rows={rows}
        quickFilter="upcoming"
        newIds={none}
        initialReveal={null}
        onClearQuickFilter={onClearQuickFilter}
      />,
    );
    await user.click(chip('Fixture Security'));
    const bar = screen.getByRole('group', { name: 'Active filters' });
    expect(
      within(bar)
        .getAllByRole('button', { name: /^Remove filter/ })
        .map((pill) => pill.textContent),
    ).toEqual(['Upcoming', 'Fixture Security']);

    await user.click(within(bar).getByRole('button', { name: 'Remove filter: Fixture Security' }));
    expect(bodyRows()).toHaveLength(2);
    // the strip's filter belongs to the parent, so the table asks for it to be cleared
    await user.click(within(bar).getByRole('button', { name: 'Remove filter: Upcoming' }));
    expect(onClearQuickFilter).toHaveBeenCalledTimes(1);
  });

  it('offers a way out when the filters leave nothing to show', async () => {
    const user = userEvent.setup();
    const onClearQuickFilter = vi.fn();
    renderWithProviders(
      <OffersTable
        rows={rows}
        quickFilter="upcoming"
        newIds={none}
        initialReveal={null}
        onClearQuickFilter={onClearQuickFilter}
      />,
    );
    // neither upcoming offer is free: one is a discount, the other needs a purchase first
    await user.click(screen.getByRole('checkbox', { name: 'Show only offers that cost nothing' }));
    expect(bodyRows()).toHaveLength(0);
    expect(screen.getByText(/No offers match these filters/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset my filters' }));
    expect(onClearQuickFilter).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('checkbox', { name: 'Show only offers that cost nothing' }),
    ).not.toBeChecked();
    expect(bodyRows()).toHaveLength(2);
  });

  it('shows no filter bar when nothing is narrowing the table', () => {
    renderWithProviders(
      <OffersTable rows={rows} quickFilter={null} newIds={none} initialReveal={null} />,
    );
    expect(screen.queryByRole('group', { name: 'Active filters' })).not.toBeInTheDocument();
  });

  it('says what you get, what it costs and how much it counts on every row', () => {
    renderWithProviders(
      <OffersTable rows={rows} quickFilter={null} newIds={none} initialReveal={null} />,
    );
    const row = (id: string): HTMLElement => {
      const found = bodyRows().find((r) => r.querySelector(`[data-offer-id="${id}"]`) !== null);
      if (found === undefined) throw new Error(`no row for ${id}`);
      return found;
    };
    expect(row('fx-active-long')).toHaveTextContent(/Free exam.*100% free.*High/);
    expect(row('fx-upcoming')).toHaveTextContent(/Exam discount.*You pay part.*Medium/);
    expect(row('fx-training-only')).toHaveTextContent(/Course only.*Paid certificate.*Low/);
    // a free exam is not free when something has to be bought first
    expect(row('fx-recurring-undated')).toHaveTextContent(/Free exam.*Purchase needed/);
    expect(screen.getByRole('columnheader', { name: /Recognition/ })).toHaveAttribute('aria-sort');
  });

  it('says what the exam normally costs, where the catalog has a price', () => {
    renderWithProviders(
      <OffersTable rows={rows} quickFilter={null} newIds={none} initialReveal={null} />,
    );
    const row = (id: string): HTMLElement => {
      const found = bodyRows().find((r) => r.querySelector(`[data-offer-id="${id}"]`) !== null);
      if (found === undefined) throw new Error(`no row for ${id}`);
      return found;
    };
    expect(row('fx-active-long')).toHaveTextContent('Normally $200');
    expect(row('fx-upcoming')).toHaveTextContent('Normally $350');
    // no catalog entry, so no figure is made up
    expect(row('fx-evergreen')).not.toHaveTextContent('Normally');
  });

  it('says when each row was last checked, and puts status and dates in one column', () => {
    renderWithProviders(
      <OffersTable rows={rows} quickFilter={null} newIds={none} initialReveal={null} />,
    );
    const checked = bodyRows().filter((row) => row.textContent.includes('Checked 28 days ago'));
    // every row but the unverified one, which already says it needs a check
    expect(checked).toHaveLength(5);
    expect(screen.getByRole('columnheader', { name: /When/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.queryByRole('columnheader', { name: /Status/ })).not.toBeInTheDocument();
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
