import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { repoRoot, snapshotPath } from './lib/paths.ts';

// Fetches each vendor's own favicon once (Google's favicon service, 128px PNG) into
// apps/web/public/vendors so the site shows company marks without hotlinking at runtime.
// Run after a snapshot adds a vendor: `npm run vendor:icons`, then commit the PNGs and the map.

interface Offer {
  vendor: string;
  sourceUrl: string;
  url: string;
}

// brand domains; anything not listed falls back to the host the vendor's offers point at
const BRAND_DOMAINS: Record<string, string> = {
  AWS: 'aws.amazon.com',
  Databricks: 'databricks.com',
  DataCamp: 'datacamp.com',
  Fortinet: 'fortinet.com',
  GitHub: 'github.com',
  Google: 'google.com',
  'Google Cloud': 'cloud.google.com',
  HashiCorp: 'hashicorp.com',
  HubSpot: 'hubspot.com',
  ISC2: 'isc2.org',
  Microsoft: 'microsoft.com',
  OpenAI: 'openai.com',
  Oracle: 'oracle.com',
  Salesforce: 'salesforce.com',
  Snowflake: 'snowflake.com',
};

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
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
  return new Uint8Array(await res.arrayBuffer());
}

async function main(): Promise<void> {
  const { offers } = JSON.parse(readFileSync(snapshotPath, 'utf8')) as { offers: Offer[] };
  const byVendor = new Map<string, Offer[]>();
  for (const offer of offers)
    byVendor.set(offer.vendor, [...(byVendor.get(offer.vendor) ?? []), offer]);

  mkdirSync(outDir, { recursive: true });
  const map: Record<string, string> = {};
  for (const [vendor, vendorOffers] of [...byVendor.entries()].sort()) {
    const domain = BRAND_DOMAINS[vendor] ?? guessDomain(vendorOffers);
    if (domain === null) {
      console.log(`skip  ${vendor}: no domain`);
      continue;
    }
    const icon = await fetchIcon(domain);
    if (icon === null) {
      console.log(`skip  ${vendor}: nothing at ${domain}`);
      continue;
    }
    const slug = vendorSlug(vendor);
    writeFileSync(`${outDir}${slug}.png`, icon);
    map[vendor] = slug;
    console.log(`wrote ${vendor.padEnd(14)} ${domain} (${String(icon.length)} bytes)`);
  }
  writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
  console.log(`${String(Object.keys(map).length)} icons → ${mapPath}`);
}

await main();
