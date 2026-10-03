import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { repoRoot, snapshotPath } from './lib/paths.ts';

// Fetches each vendor's own favicon once (Google's favicon service, 128px PNG) into
// apps/web/public/vendors so the site shows company marks without hotlinking at runtime.
//   npm run vendor:icons                      every vendor again; commit the PNGs and the map
//   npm run vendor:icons -- --missing         only vendors that have no icon yet
//   node scripts/vendor-icons.ts --build      what the site build runs (see below)
//
// --build is how a vendor approved in the Review tab gets its mark without anyone running
// anything: the publisher's snapshot commit triggers a Pages build, and that build fetches the
// icons the repo doesn't have. It only acts on the hosted build (CF_PAGES), only for missing
// vendors, and never fails — a vendor without an icon falls back to its monogram.
const { values: flags } = parseArgs({
  options: {
    missing: { type: 'boolean', default: false },
    build: { type: 'boolean', default: false },
    snapshot: { type: 'string' },
  },
});

interface Offer {
  vendor: string;
  sourceUrl: string;
  url: string;
}

// brand domains; anything not listed falls back to the host the vendor's offers point at
const BRAND_DOMAINS: Record<string, string> = {
  AWS: 'aws.amazon.com',
  Cisco: 'cisco.com',
  Databricks: 'databricks.com',
  DataCamp: 'datacamp.com',
  Fortinet: 'fortinet.com',
  GitHub: 'github.com',
  Google: 'google.com',
  'Google Cloud': 'cloud.google.com',
  HackerRank: 'hackerrank.com',
  // cs50.harvard.edu serves the edX mark as its favicon
  'Harvard CS50': 'harvard.edu',
  HashiCorp: 'hashicorp.com',
  'Hugging Face': 'huggingface.co',
  HubSpot: 'hubspot.com',
  ISC2: 'isc2.org',
  Kaggle: 'kaggle.com',
  'Linux Foundation': 'linuxfoundation.org',
  Microsoft: 'microsoft.com',
  MongoDB: 'mongodb.com',
  Neo4j: 'neo4j.com',
  OpenAI: 'openai.com',
  Oracle: 'oracle.com',
  Redis: 'redis.io',
  Salesforce: 'salesforce.com',
  Snowflake: 'snowflake.com',
  // the university's own hosts only offer a 16px icon; its MOOC site has the emblem at full size
  'University of Helsinki': 'mooc.fi',
  freeCodeCamp: 'freecodecamp.org',
};

const MIN_ICON_PX = 32;
const outDir = `${repoRoot}apps/web/public/vendors/`;
const mapPath = `${repoRoot}apps/web/src/data/vendors.json`;

export function vendorSlug(vendor: string): string {
  return vendor
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// the host most of a vendor's source pages live on
function guessDomain(offers: Offer[]): string | null {
  const counts = new Map<string, number>();
  for (const offer of offers) {
    const host = hostOf(offer.sourceUrl) ?? hostOf(offer.url);
    if (host !== null) counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function fetchIcon(domain: string): Promise<Uint8Array | null> {
  const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  // a PNG's width sits at byte 16. Anything under 32px is a 16px favicon that would be a smudge
  // on the 20px tile at 2x; the monogram reads better than that.
  const width = bytes.length > 24 ? new DataView(bytes.buffer).getUint32(16) : 0;
  return width >= MIN_ICON_PX ? bytes : null;
}

async function main(): Promise<void> {
  const missingOnly = flags.missing || flags.build;
  const { offers } = JSON.parse(readFileSync(flags.snapshot ?? snapshotPath, 'utf8')) as {
    offers: Offer[];
  };
  const byVendor = new Map<string, Offer[]>();
  for (const offer of offers)
    byVendor.set(offer.vendor, [...(byVendor.get(offer.vendor) ?? []), offer]);

  mkdirSync(outDir, { recursive: true });
  const known = JSON.parse(readFileSync(mapPath, 'utf8')) as Record<string, string>;
  const map: Record<string, string> = missingOnly ? { ...known } : {};
  let wrote = 0;
  for (const [vendor, vendorOffers] of [...byVendor.entries()].sort()) {
    if (missingOnly && known[vendor] !== undefined) continue;
    const domain = BRAND_DOMAINS[vendor] ?? guessDomain(vendorOffers);
    if (domain === null) {
      console.log(`skip  ${vendor}: no domain`);
      continue;
    }
    const icon = await fetchIcon(domain).catch(() => null);
    if (icon === null) {
      console.log(`skip  ${vendor}: nothing at ${domain}`);
      continue;
    }
    const slug = vendorSlug(vendor);
    writeFileSync(`${outDir}${slug}.png`, icon);
    map[vendor] = slug;
    wrote += 1;
    console.log(`wrote ${vendor.padEnd(14)} ${domain} (${String(icon.length)} bytes)`);
  }
  const sorted = Object.fromEntries(Object.entries(map).sort(([x], [y]) => x.localeCompare(y)));
  if (wrote > 0 || !missingOnly)
    writeFileSync(
      mapPath,
      `${JSON.stringify(sorted, null, 2)}
`,
    );
  console.log(`${String(wrote)} fetched, ${String(Object.keys(map).length)} icons in ${mapPath}`);
}

if (flags.build && process.env.CF_PAGES !== '1') {
  // local and CI builds stay offline and reproducible
  console.log('vendor icons: not the hosted build, nothing fetched');
} else if (flags.build) {
  // an icon is decoration; the site must build without it
  await main().catch((error: unknown) => {
    console.log(
      `vendor icons: skipped (${error instanceof Error ? error.message : String(error)})`,
    );
  });
} else {
  await main();
}
