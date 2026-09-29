import { Dialog } from 'primereact/dialog';

import { formatDateTime } from '../lib/format.ts';

export function AboutDialog({
  visible,
  onHide,
  generatedAt,
  offerCount,
}: {
  visible: boolean;
  onHide: () => void;
  generatedAt: string;
  offerCount: number;
}) {
  return (
    <Dialog
      header="About"
      visible={visible}
      onHide={onHide}
      modal
      draggable={false}
      resizable={false}
      style={{ width: 'min(32rem, 92vw)' }}
    >
      <p>
        Free and discounted IT certification promotions, found by polling vendor channels and
        verified before they are listed. The site is static: the data you see was generated on{' '}
        {formatDateTime(generatedAt)} and holds {offerCount} offers.
      </p>
      <p>
        Your tracking statuses and notes stay in this browser. Use the menu to export them as a file
        and import them elsewhere.
      </p>
      <p>
        <a href="https://github.com/dliamkin/latentdata" target="_blank" rel="noopener noreferrer">
          Source and issue tracker on GitHub
        </a>
      </p>
    </Dialog>
  );
}
