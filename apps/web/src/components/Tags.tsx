import { Tag } from 'primereact/tag';

import type { CredentialWeight, Eligibility, OfferStatus, WhatIsFree } from '@cert-tracker/core';

import {
  ELIGIBILITY_TAGS,
  STATUS_TAGS,
  WEIGHT_TAGS,
  WHAT_IS_FREE_TAGS,
  type TagSpec,
} from '../lib/labels.ts';

function SpecTag({ spec, label }: { spec: TagSpec; label?: string }) {
  return <Tag value={label ?? spec.label} icon={spec.icon} severity={spec.severity} />;
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
    const label =
      daysLeft === 0 ? 'Ends today' : `Ends in ${String(daysLeft)} day${daysLeft === 1 ? '' : 's'}`;
    return <Tag value={label} icon="pi pi-clock" severity="warning" />;
  }
  return <SpecTag spec={STATUS_TAGS[status]} />;
}

export function WhatIsFreeTag({ value }: { value: WhatIsFree }) {
  return <SpecTag spec={WHAT_IS_FREE_TAGS[value]} />;
}

export function WeightTag({ value }: { value: CredentialWeight }) {
  return <SpecTag spec={WEIGHT_TAGS[value]} label={`${WEIGHT_TAGS[value].label} weight`} />;
}

export function EligibilityTags({ values }: { values: readonly Eligibility[] }) {
  return (
    <ul className="tag-list" aria-label="Eligibility">
      {values.map((value) => (
        <li key={value}>
          <SpecTag spec={ELIGIBILITY_TAGS[value]} />
        </li>
      ))}
    </ul>
  );
}
