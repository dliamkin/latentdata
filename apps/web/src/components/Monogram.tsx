import type { CSSProperties } from 'react';

import { monogramHue, monogramText } from '../lib/monogram.ts';

// decorative: the vendor name sits right next to it as text everywhere it appears
export function Monogram({ vendor }: { vendor: string }) {
  const style = { '--mono-h': String(monogramHue(vendor)) } as CSSProperties;
  return (
    <span className="monogram" style={style} aria-hidden="true" title={vendor}>
      {monogramText(vendor)}
    </span>
  );
}
