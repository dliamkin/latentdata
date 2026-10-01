import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { EligibilityTags, StatusTag, WeightTag, WhatIsFreeTag } from './Tags.tsx';

describe('tags', () => {
  it('always carry text and an icon', async () => {
    const { container } = render(
      <div>
        <StatusTag status="active" />
        <StatusTag status="active" expiringSoon daysLeft={3} />
        <StatusTag status="active" expiringSoon daysLeft={0} />
        <StatusTag status="unverified" />
        <WhatIsFreeTag value="partial" />
        <WeightTag value="high" />
        <EligibilityTags values={['public', 'student']} />
      </div>,
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Ends in 3 days')).toBeInTheDocument();
    expect(screen.getByText('Ends today')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
    expect(screen.getByText('High weight')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Eligibility' })).toBeInTheDocument();
    expect(container.querySelectorAll('.mark-icon').length).toBeGreaterThanOrEqual(7);
    expect(await axe(container)).toHaveNoViolations();
  });
});
