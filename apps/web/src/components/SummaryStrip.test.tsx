import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { SummaryStrip } from './SummaryStrip.tsx';

const counts = { active: 10, expiring: 2, upcoming: 5, evergreen: 9, watch: 4, new: 1 };

describe('SummaryStrip', () => {
  it('renders one pressable button per bucket inside a labelled nav', async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <SummaryStrip counts={counts} selected="active" onSelect={onSelect} />,
    );
    expect(screen.getByRole('navigation', { name: 'Summary filters' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(6);
    expect(screen.getByRole('button', { name: /10 Active/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: /5 Upcoming/ }));
    expect(onSelect).toHaveBeenCalledWith('upcoming');

    await userEvent.click(screen.getByRole('button', { name: /10 Active/ }));
    expect(onSelect).toHaveBeenCalledWith(null);

    expect(await axe(container)).toHaveNoViolations();
  });
});
