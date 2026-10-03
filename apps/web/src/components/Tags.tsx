import type {
  CostToYou,
  CredentialWeight,
  Eligibility,
  OfferStatus,
  WhatIsFree,
} from '@cert-tracker/core';

import {
  COST_TAGS,
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

// the one place the table uses a filled badge: what you get is the first thing to read in a
// row, and the four kinds are told apart by icon and wording as well as by colour
export function WhatIsFreeTag({ value }: { value: WhatIsFree }) {
  const spec = WHAT_IS_FREE_TAGS[value];
  return (
    <span className={`free-badge free-badge--${value}`}>
      <span className={`${spec.icon} mark-icon`} aria-hidden="true" />
      {spec.label}
    </span>
  );
}

// whether money changes hands; `detail` is the offer's own wording of what is still due
export function CostTag({ value, detail = null }: { value: CostToYou; detail?: string | null }) {
  const spec = COST_TAGS[value];
  return (
    <span
      className={`mark mark--${spec.tone}${spec.strong === true ? ' mark--strong' : ''}`}
      title={detail === null ? spec.explain : `${spec.explain} ${detail}`}
    >
      <span className={`${spec.icon} mark-icon`} aria-hidden="true" />
      {spec.label}
    </span>
  );
}

const WEIGHT_BARS: Record<CredentialWeight, number> = { high: 3, medium: 2, low: 1 };

// three bars, filled by weight, with the word beside them so the bars are never the only cue
export function RecognitionMeter({ value }: { value: CredentialWeight }) {
  const spec = WEIGHT_TAGS[value];
  return (
    <span className={`meter meter--${value}`} title={spec.explain}>
      <span className="meter-bars" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span key={bar} className={bar <= WEIGHT_BARS[value] ? 'meter-bar is-on' : 'meter-bar'} />
        ))}
      </span>
      {spec.label}
    </span>
  );
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
