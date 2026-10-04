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
  const onClaim = vi.fn();
  const result = render(
    <SummaryStrip
      counts={counts}
      selected="active"
      onSelect={onSelect}
      audience={null}
      audienceCounts={audienceCounts}
      onAudience={onAudience}
      claim={null}
      claimHidden={0}
      onClaim={onClaim}
      {...overrides}
    />,
  );
  return { ...result, onSelect, onAudience, onClaim };
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

  it('asks who the visitor is and reports each answer', async () => {
    const { onClaim } = renderStrip();
    const group = screen.getByRole('group', { name: 'Who you are' });
    expect(within(group).getAllByRole('button')).toHaveLength(6);
    expect(within(group).queryByRole('status')).not.toBeInTheDocument();

    await userEvent.click(within(group).getByRole('button', { name: 'A student' }));
    expect(onClaim).toHaveBeenCalledWith(['student']);
    await userEvent.click(within(group).getByRole('button', { name: 'None of these' }));
    expect(onClaim).toHaveBeenCalledWith([]);
  });

  it('shows which answers are on and how many offers they hide', async () => {
    const { container, onClaim } = renderStrip({ claim: ['student'], claimHidden: 3 });
    const group = screen.getByRole('group', { name: 'Who you are' });
    expect(within(group).getByRole('button', { name: 'A student' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).getByRole('status')).toHaveTextContent('3 hidden');

    // taking the last answer off stops hiding anything
    await userEvent.click(within(group).getByRole('button', { name: 'A student' }));
    expect(onClaim).toHaveBeenCalledWith(null);
    expect(await axe(container)).toHaveNoViolations();
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
