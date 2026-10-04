import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { repoRoot, snapshotPath } from './lib/paths.ts';

// Fetches each vendor's own favicon once (Google's favicon service, 128px PNG or JPEG) into
// apps/web/public/vendors so the site shows company marks without hotlinking at runtime.
//   npm run vendor:icons                      every vendor again; commit the icons and the map
//   npm run vendor:icons -- --missing         only vendors that have no icon yet
//   node scripts/vendor-icons.ts --build      what the site build runs (see below)
//
// --build is how a vendor approved in the Review tab gets its mark without anyone running
// anything: the publisher's snapshot commit triggers a Pages build, and that build fetches the
// icons the repo doesn't have. It only acts on the hosted build (CF_PAGES), only for missing
// vendors, and never fails — a vendor without an icon falls back to its monogram. Vendors come
// from the offers and from the catalog, so a credential listed on the Certifications tab has its
// mark whether or not an offer covers it.
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

interface CatalogEntry {
  vendor: string;
  url: string;
}

// brand domains; anything not listed falls back to the host the vendor's pages point at. A
// vendor belongs here when its pages live on someone else's site (Coursera, edX) or on a
// subdomain with a poorer icon than the main one.
const BRAND_DOMAINS: Record<string, string> = {
  Adobe: 'adobe.com',
  Akamai: 'akamai.com',
  Amazon: 'amazon.com',
  Anthropic: 'anthropic.com',
  Atlassian: 'atlassian.com',
  AWS: 'aws.amazon.com',
  Cisco: 'cisco.com',
  CNCF: 'cncf.io',
  CompTIA: 'comptia.org',
  Databricks: 'databricks.com',
  DataCamp: 'datacamp.com',
  'DeepLearning.AI': 'deeplearning.ai',
  'Dell Technologies': 'dell.com',
  'EC-Council': 'eccouncil.org',
  Fortinet: 'fortinet.com',
  'Georgia Tech': 'gatech.edu',
  GitHub: 'github.com',
  Google: 'google.com',
  'Google Cloud': 'cloud.google.com',
  HackerRank: 'hackerrank.com',
  // cs50.harvard.edu serves the edX mark as its favicon
  'Harvard CS50': 'harvard.edu',
  HashiCorp: 'hashicorp.com',
  'Hugging Face': 'huggingface.co',
  HubSpot: 'hubspot.com',
  IBM: 'ibm.com',
  ISC2: 'isc2.org',
  'Juniper Networks': 'juniper.net',
  Kaggle: 'kaggle.com',
  'Linux Foundation': 'linuxfoundation.org',
  Meta: 'meta.com',
  Microsoft: 'microsoft.com',
  MongoDB: 'mongodb.com',
  Neo4j: 'neo4j.com',
  OpenAI: 'openai.com',
  Oracle: 'oracle.com',
  'Red Hat': 'redhat.com',
  Redis: 'redis.io',
  Salesforce: 'salesforce.com',
  SAP: 'sap.com',
  SAS: 'sas.com',
  Snowflake: 'snowflake.com',
  'Stanford Online': 'stanford.edu',
  'Syracuse University IVMF': 'syracuse.edu',
  Tableau: 'tableau.com',
  Unilever: 'unilever.com',
  // the university's own hosts only offer a 16px icon; its MOOC site has the emblem at full size
  'University of Helsinki': 'mooc.fi',
  W3C: 'w3.org',
  freeCodeCamp: 'freecodecamp.org',
};

// hosts that carry many vendors' pages; their icon is the platform's, never the vendor's, and
// a monogram is better than the wrong logo
const PLATFORM_HOSTS = [
  'coursera.org',
  'edx.org',
  'credly.com',
  'pearsonvue.com',
  'skilljar.com',
  'zendesk.com',
  'github.io',
];

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

function isPlatform(host: string): boolean {
  return PLATFORM_HOSTS.some((platform) => host === platform || host.endsWith(`.${platform}`));
}

// the host most of a vendor's pages live on
function guessDomain(urls: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const url of urls) {
    const host = hostOf(url);
    if (host !== null && !isPlatform(host)) counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

interface Icon {
  bytes: Uint8Array;
  extension: 'png' | 'jpg';
}

// a PNG's width sits at byte 16; a JPEG's is in its start-of-frame segment
function measure(bytes: Uint8Array): { width: number; extension: Icon['extension'] } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length > 24 && view.getUint32(0) === 0x89504e47) {
    return { width: view.getUint32(16), extension: 'png' };
  }
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return null;
  let at = 2;
  while (at + 9 < bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1] ?? 0;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) return { width: view.getUint16(at + 7), extension: 'jpg' };
    at += 2 + view.getUint16(at + 2);
  }
  return null;
}

async function fetchIcon(domain: string): Promise<Icon | null> {
  const url = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  // anything under 32px is a 16px favicon that would be a smudge on the 20px tile at 2x; the
  // monogram reads better than that
  const image = measure(bytes);
  return image !== null && image.width >= MIN_ICON_PX
    ? { bytes, extension: image.extension }
    : null;
}

async function main(): Promise<void> {
  const missingOnly = flags.missing || flags.build;
  const { offers, catalog = [] } = JSON.parse(
    readFileSync(flags.snapshot ?? snapshotPath, 'utf8'),
  ) as { offers: Offer[]; catalog?: CatalogEntry[] };
  // every page each vendor is known by
  const byVendor = new Map<string, string[]>();
  const note = (vendor: string, ...urls: string[]): void => {
    byVendor.set(vendor, [...(byVendor.get(vendor) ?? []), ...urls]);
  };
  for (const offer of offers) note(offer.vendor, offer.sourceUrl, offer.url);
  for (const entry of catalog) note(entry.vendor, entry.url);

  mkdirSync(outDir, { recursive: true });
  const known = JSON.parse(readFileSync(mapPath, 'utf8')) as Record<string, string>;
  const map: Record<string, string> = missingOnly ? { ...known } : {};
  let wrote = 0;
  for (const [vendor, urls] of [...byVendor.entries()].sort()) {
    if (missingOnly && known[vendor] !== undefined) continue;
    const domain = BRAND_DOMAINS[vendor] ?? guessDomain(urls);
    if (domain === null) {
      console.log(`skip  ${vendor}: no domain`);
      continue;
    }
    const icon = await fetchIcon(domain).catch(() => null);
    if (icon === null) {
      console.log(`skip  ${vendor}: nothing at ${domain}`);
      continue;
    }
    // the map names the file, since an icon can be a PNG or a JPEG
    const file = `${vendorSlug(vendor)}.${icon.extension}`;
    writeFileSync(outDir + file, icon.bytes);
    map[vendor] = file;
    wrote += 1;
    console.log(`wrote ${vendor.padEnd(14)} ${domain} (${String(icon.bytes.length)} bytes)`);
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
