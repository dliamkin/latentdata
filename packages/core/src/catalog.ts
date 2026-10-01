import type { CatalogEntry, Offer } from './schemas.ts';

// named: the offer lists this credential; vendor-wide: the offer is for any exam of the vendor
export type CatalogMatch = 'named' | 'vendor-wide';

type OfferRef = Pick<Offer, 'vendor' | 'certifications' | 'examCode'>;

// lowercased words with a space on each side, so a phrase can only match whole words;
// + and # survive because Security+ and C# are names
function words(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim()} `;
}

const VENDOR_WIDE = /^\s*(any|all|one|every)\b/i;

export function catalogMatch(entry: CatalogEntry, offer: OfferRef): CatalogMatch | null {
  const listed = words([...offer.certifications, offer.examCode ?? ''].join(' ; '));
  // an exam code is specific enough to match across vendors (a Microsoft offer listing GH-300)
  if (entry.examCode !== null && listed.includes(words(entry.examCode))) return 'named';
  if (entry.vendor.toLowerCase() === offer.vendor.toLowerCase()) {
    const names = [entry.name, ...entry.aliases];
    if (names.some((name) => listed.includes(words(name)))) return 'named';
  }
  if (entry.kind === 'exam') {
    const vendor = words(entry.vendor);
    const wide = offer.certifications.some(
      (certification) => VENDOR_WIDE.test(certification) && words(certification).includes(vendor),
    );
    if (wide) return 'vendor-wide';
  }
  return null;
}
