import type { FreeNow } from '../data/offers.ts';
import { usdLabel } from '../lib/format.ts';

// one ellipse turned through half a circle draws the rosette printed on certificate paper
const PETALS = Array.from({ length: 36 }, (_, index) => index * 5);

export function Banner({ freeNow }: { freeNow: FreeNow }) {
  return (
    <div className="banner">
      <svg className="banner-rosette" viewBox="-100 -100 200 200" aria-hidden="true">
        {PETALS.map((angle) => (
          <ellipse key={angle} rx="96" ry="36" transform={`rotate(${String(angle)})`} />
        ))}
        <circle r="98" />
        <circle r="35" />
      </svg>
      <div className="banner-inner">
        <p className="banner-text">
          Free and discounted IT certification exams,{' '}
          <strong>
            <i className="pi pi-verified" aria-hidden="true" />
            checked against each vendor&apos;s own page.
          </strong>
        </p>
        {freeNow.offers > 0 && (
          <p className="banner-stat">
            Open now: <strong>{freeNow.offers}</strong>{' '}
            {freeNow.offers === 1 ? 'offer that costs' : 'offers that cost'} nothing
            {freeNow.usd > 0 && (
              <>
                {' '}
                · <strong>{usdLabel(freeNow.usd)}</strong> in exam fees waived
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
