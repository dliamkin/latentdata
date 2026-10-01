import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { SummaryStrip } from './SummaryStrip.tsx';

const counts = { active: 10, expiring: 2, upcoming: 5, evergreen: 9, watch: 4, new: 1 };
const audienceCounts = { all: 24, software: 9, it: 18 };

function renderStrip(overrides: Partial<Parameters<typeof SummaryStrip>[0]> = {}) {
  const onSelect = vi.fn();
  const onAudience = vi.fn();
  const result = render(
    <SummaryStrip
      counts={counts}
      selected="active"
      onSelect={onSelect}
      audience={null}
      audienceCounts={audienceCounts}
      onAudience={onAudience}
      {...overrides}
    />,
  );
  return { ...result, onSelect, onAudience };
}

describe('SummaryStrip', () => {
  it('renders one pressable button per bucket inside a labelled nav', async () => {
    const { container, onSelect } = renderStrip();
    const nav = screen.getByRole('navigation', { name: 'Summary filters' });
    expect(within(nav).getAllByRole('button')).toHaveLength(6);
    expect(within(nav).getByRole('button', { name: /10 Active/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(within(nav).getByRole('button', { name: /5 Upcoming/ }));
    expect(onSelect).toHaveBeenCalledWith('upcoming');

    await userEvent.click(within(nav).getByRole('button', { name: /10 Active/ }));
    expect(onSelect).toHaveBeenCalledWith(null);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('switches the audience lens and reports clearing it', async () => {
    const { onAudience } = renderStrip();
    const group = screen.getByRole('group', { name: 'Who the offers are for' });
    expect(within(group).getByRole('button', { name: /Everything/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(within(group).getByRole('button', { name: /Software9/ }));
    expect(onAudience).toHaveBeenCalledWith('software');
  });

  it('marks the lens that is on', () => {
    renderStrip({ audience: 'it' });
    const group = screen.getByRole('group', { name: 'Who the offers are for' });
    expect(within(group).getByRole('button', { name: /IT & ops18/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
