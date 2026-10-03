import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { CostTag, EligibilityTags, RecognitionMeter, StatusTag, WhatIsFreeTag } from './Tags.tsx';

describe('tags', () => {
  it('always carry text and an icon', async () => {
    const { container } = render(
      <div>
        <StatusTag status="active" />
        <StatusTag status="active" expiringSoon daysLeft={3} />
        <StatusTag status="active" expiringSoon daysLeft={0} />
        <StatusTag status="unverified" />
        <WhatIsFreeTag value="partial" />
        <CostTag value="nothing" />
        <CostTag value="purchase-first" detail="Conference pass, about $2,399" />
        <RecognitionMeter value="high" />
        <EligibilityTags values={['public', 'student']} />
      </div>,
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Ends in 3 days')).toBeInTheDocument();
    expect(screen.getByText('Ends today')).toBeInTheDocument();
    expect(screen.getByText('Unverified')).toBeInTheDocument();
    expect(screen.getByText('Exam discount')).toBeInTheDocument();
    expect(screen.getByText('100% free')).toBeInTheDocument();
    // the offer's own wording of what is still due rides along as the hover text
    expect(screen.getByText('Purchase needed')).toHaveAttribute(
      'title',
      expect.stringContaining('Conference pass, about $2,399'),
    );
    expect(screen.getByText('High')).toHaveAttribute('title', 'Exams employers name in job ads.');
    expect(screen.getByRole('list', { name: 'Eligibility' })).toBeInTheDocument();
    expect(container.querySelectorAll('.mark-icon').length).toBeGreaterThanOrEqual(7);
    expect(await axe(container)).toHaveNoViolations();
  });
});
