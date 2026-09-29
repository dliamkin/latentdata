import type { Offer } from '@cert-tracker/core';

import { isAdapterError } from './errors.ts';
import type { HttpClient } from './http.ts';

export type Liveness = 'alive' | 'gone' | 'changed' | 'skipped' | 'unknown';

// hosts that answer bots with a login wall or a block page; checking them only produces noise
const BLOCKED_HOSTS = ['education.oracle.com', 'mylearn.oracle.com', 'reddit.com'];
const GENERIC_ANCHORS = ['voucher', 'free', 'certification'];
const MIN_INTERVAL_MS = 1000;

export function isBlockedHost(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return true;
  }
  return BLOCKED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

export function anchorsFor(offer: Pick<Offer, 'vendor' | 'examCode'>): string[] {
  const codes = (offer.examCode ?? '')
    .split(/[/,]/)
    .map((code) => code.trim().toLowerCase())
    .filter((code) => code !== '');
  return [offer.vendor.toLowerCase(), ...codes, ...GENERIC_ANCHORS];
}

export function pageText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export interface LivenessChecker {
  check: (offer: Pick<Offer, 'vendor' | 'examCode' | 'sourceUrl'>) => Promise<Liveness>;
}

export function createLivenessChecker(
  http: HttpClient,
  sleep: (ms: number) => Promise<void>,
  clock: () => number = Date.now,
): LivenessChecker {
  const lastRequest = new Map<string, number>();

  // at most one request a second per host, however many offers share it
  const politeWait = async (host: string): Promise<void> => {
    const previous = lastRequest.get(host);
    if (previous !== undefined) {
      const wait = MIN_INTERVAL_MS - (clock() - previous);
      if (wait > 0) await sleep(wait);
    }
    lastRequest.set(host, clock());
  };

  return {
    check: async (offer) => {
      if (isBlockedHost(offer.sourceUrl)) return 'skipped';
      await politeWait(new URL(offer.sourceUrl).hostname);
      try {
        const response = await http.get(offer.sourceUrl);
        if (response.status === 404 || response.status === 410) return 'gone';
        // a 403 or a 401 says nothing about the offer, only about how the site treats bots
        if (response.status >= 400) return 'unknown';
        const text = pageText(response.text);
        return anchorsFor(offer).some((anchor) => text.includes(anchor)) ? 'alive' : 'changed';
      } catch (error) {
        if (isAdapterError(error)) return 'unknown';
        throw error;
      }
    },
  };
}
