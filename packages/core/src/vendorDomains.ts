// registrable domains a vendor publishes offers on; used by the auto-accept rule, so a
// third-party host (Pearson VUE, Slickdeals, a Khoros community) deliberately isn't here
export const VENDOR_DOMAINS: Readonly<Record<string, readonly string[]>> = {
  AWS: ['amazon.com', 'awsevents.com', 'aws.training'],
  Broadcom: ['broadcom.com'],
  Cisco: ['cisco.com', 'netacad.com'],
  CNCF: ['cncf.io'],
  CompTIA: ['comptia.org'],
  Databricks: ['databricks.com'],
  DataCamp: ['datacamp.com'],
  Fortinet: ['fortinet.com'],
  GitHub: ['github.com'],
  Google: ['google.com', 'withgoogle.com'],
  'Google Cloud': ['google.com', 'withgoogle.com'],
  HashiCorp: ['hashicorp.com', 'hashiconf.com'],
  HubSpot: ['hubspot.com'],
  IBM: ['ibm.com'],
  ISC2: ['isc2.org'],
  'Linux Foundation': ['linuxfoundation.org'],
  Microsoft: ['microsoft.com'],
  OpenAI: ['openai.com'],
  Oracle: ['oracle.com'],
  'Red Hat': ['redhat.com'],
  Salesforce: ['salesforce.com'],
  Snowflake: ['snowflake.com'],
};

export function isVendorDomain(vendor: string, url: string): boolean {
  const domains = VENDOR_DOMAINS[vendor];
  if (domains === undefined) return false;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}
