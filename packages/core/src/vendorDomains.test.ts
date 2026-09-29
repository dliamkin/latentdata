import { describe, expect, it } from 'vitest';

import { VENDOR_DOMAINS, isVendorDomain } from './vendorDomains.ts';

describe('isVendorDomain', () => {
  it.each([
    ['Microsoft', 'https://learn.microsoft.com/en-us/credentials/', true],
    ['Microsoft', 'https://microsoft.com/', true],
    ['Microsoft', 'https://notmicrosoft.com/', false],
    ['Microsoft', 'https://skillupwithlevelup.com/cert-faqs', false],
    ['AWS', 'https://aws.amazon.com/certification/', true],
    ['AWS', 'https://www.pearsonvue.com/us/en/aws.html', false],
    ['Google Cloud', 'https://developers.google.com/program/gear/getcertified', true],
    ['Google Cloud', 'https://cloudblog.withgoogle.com/x', true],
    ['Salesforce', 'https://trailhead.salesforce.com/help', true],
    ['Salesforce', 'https://www.reddit.com/r/salesforce/', false],
    ['Unknown Vendor', 'https://example.com', false],
    ['Oracle', 'not a url', false],
  ])('%s + %s -> %s', (vendor, url, expected) => {
    expect(isVendorDomain(vendor, url)).toBe(expected);
  });

  it('covers every vendor in the seed', () => {
    const seedVendors = [
      'Google Cloud',
      'AWS',
      'Oracle',
      'Salesforce',
      'Microsoft',
      'GitHub',
      'ISC2',
      'Databricks',
      'HashiCorp',
      'Snowflake',
      'DataCamp',
      'Fortinet',
      'Google',
      'HubSpot',
      'OpenAI',
    ];
    for (const vendor of seedVendors) expect(VENDOR_DOMAINS[vendor]).toBeDefined();
  });
});
