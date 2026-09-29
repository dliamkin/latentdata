import {
  daysUntilEnd,
  deriveStatus,
  utcIsoDate,
  type Offer,
  type OfferStatus,
} from '@cert-tracker/core';

import { readBaseEnv } from '../lib/env.ts';
import { createHttpClient } from '../lib/http.ts';
import { createLivenessChecker, type LivenessChecker } from '../lib/liveness.ts';
import {
  acquireLock,
  createDocClient,
  listOffers,
  newEvent,
  offerStatusUpdateItem,
  releaseLock,
  setSystemMeta,
  writeChange,
  type DocClient,
  type NewEvent,
} from '../lib/repo/index.ts';
import { flushMetrics, logger, tracer } from '../lib/telemetry.ts';

export const LOCK_NAME = 'status';
export const LEASE_SECONDS = 600;
const EXPIRING_DAYS = [7, 3, 1];

export interface StatusDeps {
  doc: DocClient;
  table: string;
  liveness: LivenessChecker;
  now: () => Date;
}

export interface StatusSummary {
  ran: boolean;
  offers: number;
  expired: number;
  opened: number;
  expiring: number;
  unverified: number;
}

interface Transition {
  to: OfferStatus;
  event: NewEvent;
}

// only the two moves a calendar can make on its own; unverified and evergreen are never touched
// here, and an expired offer coming back to life is an admin's edit, not a date rolling over
export function transitionFor(offer: Offer, today: string): Transition | null {
  const derived = deriveStatus(offer, today);
  const payload = { name: offer.name, vendor: offer.vendor };
  if ((offer.status === 'active' || offer.status === 'upcoming') && derived === 'expired') {
    return {
      to: 'expired',
      event: {
        type: 'offer.expired',
        audience: 'public',
        offerId: offer.id,
        idempotencyKey: `${offer.id}#expired#${offer.windowEnd ?? ''}`,
        payload: { ...payload, windowEnd: offer.windowEnd },
      },
    };
  }
  if (offer.status === 'upcoming' && derived === 'active') {
    return {
      to: 'active',
      event: {
        type: 'offer.window_opened',
        audience: 'public',
        offerId: offer.id,
        idempotencyKey: `${offer.id}#opened#${offer.windowStart ?? ''}`,
        payload: { ...payload, windowStart: offer.windowStart, windowEnd: offer.windowEnd },
      },
    };
  }
  return null;
}

export function expiringEventFor(offer: Offer, today: string): NewEvent | null {
  const daysLeft = daysUntilEnd(offer, today);
  if (daysLeft === null || offer.windowEnd === null || !EXPIRING_DAYS.includes(daysLeft)) {
    return null;
  }
  return {
    type: 'offer.expiring',
    audience: 'public',
    offerId: offer.id,
    idempotencyKey: `${offer.id}#${offer.windowEnd}#${String(daysLeft)}d`,
    payload: { name: offer.name, vendor: offer.vendor, windowEnd: offer.windowEnd, daysLeft },
  };
}

export async function runStatus(deps: StatusDeps): Promise<StatusSummary> {
  const { doc, table } = deps;
  const summary: StatusSummary = {
    ran: false,
    offers: 0,
    expired: 0,
    opened: 0,
    expiring: 0,
    unverified: 0,
  };
  const lease = await acquireLock(doc, table, LOCK_NAME, LEASE_SECONDS, deps.now());
  if (lease === null) return summary;

  try {
    const today = utcIsoDate(deps.now());
    const offers = await listOffers(doc, table);
    summary.ran = true;
    summary.offers = offers.length;

    for (const offer of offers) {
      const now = deps.now();
      const transition = transitionFor(offer, today);
      if (transition !== null) {
        const result = await writeChange(doc, table, {
          event: newEvent(transition.event, now),
          writes: [
            offerStatusUpdateItem(table, {
              id: offer.id,
              windowEnd: offer.windowEnd,
              from: offer.status,
              to: transition.to,
              updatedAt: now.toISOString(),
            }),
          ],
          now,
        });
        if (result === 'applied') {
          if (transition.to === 'expired') summary.expired += 1;
          else summary.opened += 1;
        }
        continue;
      }

      const expiring = expiringEventFor(offer, today);
      if (expiring !== null) {
        const result = await writeChange(doc, table, { event: newEvent(expiring, now), now });
        if (result === 'applied') summary.expiring += 1;
      }

      const derived = deriveStatus(offer, today);
      if (derived !== 'active' && derived !== 'upcoming') continue;
      const liveness = await deps.liveness.check(offer);
      if (liveness !== 'gone' && liveness !== 'changed') continue;
      const result = await writeChange(doc, table, {
        event: newEvent(
          {
            type: 'offer.updated',
            audience: 'admin',
            offerId: offer.id,
            idempotencyKey: `${offer.id}#liveness#${today}`,
            payload: { name: offer.name, vendor: offer.vendor, reason: liveness },
          },
          now,
        ),
        writes: [
          offerStatusUpdateItem(table, {
            id: offer.id,
            windowEnd: offer.windowEnd,
            from: offer.status,
            to: 'unverified',
            updatedAt: now.toISOString(),
            verificationNote: `auto: source page changed or unreachable on ${today}`,
          }),
        ],
        now,
      });
      if (result === 'applied') summary.unverified += 1;
    }

    await setSystemMeta(doc, table, { lastStatusRunAt: deps.now().toISOString() });
    return summary;
  } finally {
    await releaseLock(doc, table, lease);
  }
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

let cached: Omit<StatusDeps, 'now'> | undefined;

function dependencies(): Omit<StatusDeps, 'now'> {
  if (cached !== undefined) return cached;
  const env = readBaseEnv();
  const http = createHttpClient({
    userAgent: process.env.USER_AGENT ?? 'cert-tracker',
    timeoutMs: 15_000,
    retry: { attempts: 2 },
  });
  cached = {
    doc: tracer.captureAWSv3Client(createDocClient()),
    table: env.tableName,
    liveness: createLivenessChecker(http, sleep),
  };
  return cached;
}

export async function handler(): Promise<StatusSummary> {
  try {
    const summary = await runStatus({ ...dependencies(), now: () => new Date() });
    logger.info('status finished', { ...summary });
    return summary;
  } catch (error) {
    logger.error('status failed', { error });
    throw error;
  } finally {
    flushMetrics();
  }
}
