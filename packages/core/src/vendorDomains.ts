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
  freeCodeCamp: ['freecodecamp.org'],
  GitHub: ['github.com'],
  Google: ['google.com', 'withgoogle.com', 'skills.google'],
  'Google Cloud': ['google.com', 'withgoogle.com', 'skills.google', 'cloudskillsboost.google'],
  HackerRank: ['hackerrank.com'],
  HashiCorp: ['hashicorp.com', 'hashiconf.com'],
  'Hugging Face': ['huggingface.co'],
  HubSpot: ['hubspot.com'],
  IBM: ['ibm.com'],
  ISC2: ['isc2.org'],
  Kaggle: ['kaggle.com'],
  'Linux Foundation': ['linuxfoundation.org'],
  Microsoft: ['microsoft.com'],
  MongoDB: ['mongodb.com'],
  Neo4j: ['neo4j.com'],
  OpenAI: ['openai.com'],
  Oracle: ['oracle.com'],
  'Red Hat': ['redhat.com'],
  Redis: ['redis.io', 'redis.com'],
  Salesforce: ['salesforce.com', 'trailhead.com'],
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
