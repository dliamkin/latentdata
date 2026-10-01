import vendors from '../data/vendors.json';
import { Monogram } from './Monogram.tsx';

const ICONS: Readonly<Record<string, string>> = vendors;

// the vendor's own favicon on a white tile (fetched into public/vendors by
// `npm run vendor:icons`); a vendor without one gets its monogram. Decorative either way:
// the vendor name is always printed next to it.
export function VendorMark({ vendor }: { vendor: string }) {
  const slug = ICONS[vendor];
  if (slug === undefined) return <Monogram vendor={vendor} />;
  return (
    <span className="vendor-mark" aria-hidden="true" title={vendor}>
      <img src={`/vendors/${slug}.png`} alt="" width={20} height={20} loading="lazy" />
    </span>
  );
}
