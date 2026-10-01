import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';

import { formatDate, formatTime } from '../lib/format.ts';
import { logoSrc, type ThemeMode } from '../theme/theme.ts';

export function AboutDialog({
  visible,
  onHide,
  generatedAt,
  offerCount,
  mode,
}: {
  visible: boolean;
  onHide: () => void;
  generatedAt: string;
  offerCount: number;
  mode: ThemeMode;
}) {
  return (
    <Dialog
      header={
        <>
          <span className="sr-only">About</span>
          <img src={logoSrc(mode)} alt="" width={111} height={36} />
        </>
      }
      visible={visible}
      onHide={onHide}
      modal
      draggable={false}
      resizable={false}
      className="about-dialog"
      style={{ width: 'min(34rem, 92vw)' }}
    >
      <p>
        LatentData.org tracks free and discounted IT certification promotions: exam vouchers, free
        training with badges, and discount codes from vendors like AWS, Microsoft, Google Cloud,
        Oracle and Databricks. Every offer is checked against the vendor&apos;s own page.
      </p>
      <dl className="stat-cards">
        <div className="stat-card">
          <dt className="eyebrow mono">Offers</dt>
          <dd className="stat-value">{offerCount}</dd>
        </div>
        <div className="stat-card">
          <dt className="eyebrow mono">Data generated</dt>
          <dd>
            {formatDate(generatedAt.slice(0, 10))}
            <br />
            <span className="mono muted">{formatTime(generatedAt)}</span>
          </dd>
        </div>
        <div className="stat-card">
          <dt className="eyebrow mono">Works offline</dt>
          <dd>
            Installable
            <br />
            <span className="mono muted">PWA</span>
          </dd>
        </div>
      </dl>
      <p className="muted">
        Your tracking statuses and notes stay in this browser only; nothing is sent anywhere. Use{' '}
        <strong>⋮ → Export tracking</strong> to back them up.
      </p>
      <div className="dialog-foot">
        <a
          className="text-link"
          href="https://github.com/dliamkin/latentdata"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source and issues on GitHub <span className="pi pi-external-link" aria-hidden="true" />
        </a>
        <Button label="Close" severity="contrast" onClick={onHide} />
      </div>
    </Dialog>
  );
}
