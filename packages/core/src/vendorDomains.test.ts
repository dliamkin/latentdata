import { describe, expect, it } from 'vitest';

import { isVendorDomain } from './vendorDomains.ts';

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
    // Google Skills is its own registrable domain, not a google.com subdomain
    ['Google Cloud', 'https://www.skills.google/paths/1951', true],
    ['Google', 'https://www.skills.google/paths/2336', true],
    ['Salesforce', 'https://trailhead.salesforce.com/help', true],
    ['Salesforce', 'https://www.reddit.com/r/salesforce/', false],
    ['freeCodeCamp', 'https://www.freecodecamp.org/learn', true],
    ['freeCodeCamp', 'https://forum.freecodecamp.org/t/x/1', true],
    ['Hugging Face', 'https://huggingface.co/learn/agents-course', true],
    ['Unknown Vendor', 'https://example.com', false],
    ['Oracle', 'not a url', false],
  ])('%s + %s -> %s', (vendor, url, expected) => {
    expect(isVendorDomain(vendor, url)).toBe(expected);
  });
});
