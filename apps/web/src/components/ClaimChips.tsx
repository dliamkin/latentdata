import { CLAIM_ROLES, toggleNone, toggleRole } from '../data/claim.ts';
import type { Claim } from '../data/offers.ts';
import { CLAIM_LABELS } from '../lib/labels.ts';

// who the visitor is, said once: offers they cannot claim are hidden on every tab. Offers open
// to everyone always stay.
export function ClaimChips({
  claim,
  hidden,
  onChange,
}: {
  claim: Claim;
  // how many offers the choice is hiding right now
  hidden: number;
  onChange: (claim: Claim) => void;
}) {
  return (
    <div className="claim" role="group" aria-label="Who you are">
      <span className="claim-label">Hide what I can&apos;t claim. I am:</span>
      {CLAIM_ROLES.map((role) => (
        <button
          key={role}
          type="button"
          className="chip chip--all"
          aria-pressed={claim?.includes(role) === true}
          title={CLAIM_LABELS[role].explain}
          onClick={() => {
            onChange(toggleRole(claim, role));
          }}
        >
          {CLAIM_LABELS[role].label}
        </button>
      ))}
      <button
        type="button"
        className="chip chip--all"
        aria-pressed={claim !== null && claim.length === 0}
        title="Show only offers that are open to everyone."
        onClick={() => {
          onChange(toggleNone(claim));
        }}
      >
        None of these
      </button>
      {claim !== null && (
        <span className="claim-hidden" role="status" title="Offers you said you cannot claim">
          {hidden} hidden
        </span>
      )}
    </div>
  );
}
