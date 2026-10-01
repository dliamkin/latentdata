import type { CredentialWeight, Eligibility, OfferStatus, WhatIsFree } from '@cert-tracker/core';

import {
  ELIGIBILITY_TAGS,
  STATUS_TAGS,
  WEIGHT_TAGS,
  WHAT_IS_FREE_TAGS,
  countdownLabel,
  type TagSpec,
  type Tone,
} from '../lib/labels.ts';

// a marker is an icon plus text in a tone colour; no pills, so the table reads as text
export function Mark({
  icon,
  tone,
  strong = false,
  children,
}: {
  icon: string;
  tone: Tone;
  strong?: boolean;
  children: string;
}) {
  return (
    <span className={`mark mark--${tone}${strong ? ' mark--strong' : ''}`}>
      <span className={`${icon} mark-icon`} aria-hidden="true" />
      {children}
    </span>
  );
}

function SpecMark({ spec, label }: { spec: TagSpec; label?: string }) {
  return (
    <Mark icon={spec.icon} tone={spec.tone} strong={spec.strong === true}>
      {label ?? spec.label}
    </Mark>
  );
}

export function StatusTag({
  status,
  expiringSoon = false,
  daysLeft = null,
}: {
  status: OfferStatus;
  expiringSoon?: boolean;
  daysLeft?: number | null;
}) {
  if (status === 'active' && expiringSoon && daysLeft !== null) {
    return (
      <Mark icon="pi pi-clock" tone="deadline" strong>
        {countdownLabel(daysLeft)}
      </Mark>
    );
  }
  return <SpecMark spec={STATUS_TAGS[status]} />;
}

export function WhatIsFreeTag({ value }: { value: WhatIsFree }) {
  return <SpecMark spec={WHAT_IS_FREE_TAGS[value]} />;
}

export function WeightTag({ value }: { value: CredentialWeight }) {
  return <SpecMark spec={WEIGHT_TAGS[value]} label={`${WEIGHT_TAGS[value].label} weight`} />;
}

export function EligibilityTags({ values }: { values: readonly Eligibility[] }) {
  return (
    <ul className="eligibility" aria-label="Eligibility">
      {values.map((value) => (
        <li key={value}>
          <SpecMark spec={ELIGIBILITY_TAGS[value]} />
        </li>
      ))}
    </ul>
  );
}
