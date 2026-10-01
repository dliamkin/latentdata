import { describe, expect, it } from 'vitest';

import { monogramHue, monogramText } from './monogram.ts';

describe('monogram', () => {
  it('takes initials of two words or the first two letters of one', () => {
    expect(monogramText('Google Cloud')).toBe('GC');
    expect(monogramText('AWS')).toBe('AW');
    expect(monogramText('Palo Alto Networks')).toBe('PA');
    expect(monogramText('ISC2')).toBe('IS');
  });

  it('gives each vendor a stable hue', () => {
    expect(monogramHue('Microsoft')).toBe(monogramHue('Microsoft'));
    expect(monogramHue('Microsoft')).not.toBe(monogramHue('Oracle'));
    expect(monogramHue('Databricks')).toBeGreaterThanOrEqual(0);
    expect(monogramHue('Databricks')).toBeLessThan(360);
  });
});
