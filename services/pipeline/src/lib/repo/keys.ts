// every key string in the system is built here; nothing outside the repo layer spells one out

export const META_SK = 'META';
export const OPEN_ENDED = '9999-12-31';

export interface Key {
  PK: string;
  SK: string;
}

export interface Gsi1Key {
  GSI1PK: string;
  GSI1SK: string;
}

export const GSI1_NAME = 'GSI1';
export const GSI1_OFFERS = 'OFFERS';
export const GSI1_SOURCES = 'SOURCES';

export function offerKey(id: string): Key {
  return { PK: `OFFER#${id}`, SK: META_SK };
}

export function offerGsi1(status: string, windowEnd: string | null, id: string): Gsi1Key {
  return { GSI1PK: GSI1_OFFERS, GSI1SK: `${status}#${windowEnd ?? OPEN_ENDED}#${id}` };
}

export function candidateKey(candidateId: string): Key {
  return { PK: `CAND#${candidateId}`, SK: META_SK };
}

export function candidateGsi1(stage: string, createdAt: string): Gsi1Key {
  return { GSI1PK: `CANDS#${stage}`, GSI1SK: createdAt };
}

export function signalKey(sourceId: string, fingerprint: string): Key {
  return { PK: `SIG#${sourceId}`, SK: fingerprint };
}

export function deferredSignalGsi1(seenAt: string): Gsi1Key {
  return { GSI1PK: 'SIGSTATE#deferred', GSI1SK: seenAt };
}

export function sourceKey(sourceId: string): Key {
  return { PK: `SOURCE#${sourceId}`, SK: META_SK };
}

export function sourceGsi1(sourceId: string): Gsi1Key {
  return { GSI1PK: GSI1_SOURCES, GSI1SK: sourceId };
}

export function eventKey(occurredAt: string, eventId: string): Key {
  return { PK: `EVENT#${occurredAt.slice(0, 7)}`, SK: `${occurredAt}#${eventId}` };
}

export function eventGsi1(audience: string, occurredAt: string): Gsi1Key {
  return { GSI1PK: eventsGsi1Pk(audience), GSI1SK: occurredAt };
}

export function eventsGsi1Pk(audience: string): string {
  return `EVENTS#${audience}`;
}

export function eventIdempotencyKey(idempotencyKey: string): Key {
  return { PK: `EVENTKEY#${idempotencyKey}`, SK: META_SK };
}

export function subscriberKey(subId: string): Key {
  return { PK: `SUB#${subId}`, SK: META_SK };
}

export function subscriberGsi1(status: string, channel: string, subId: string): Gsi1Key {
  return { GSI1PK: `SUBS#${status}`, GSI1SK: `${channel}#${subId}` };
}

export function notificationKey(eventId: string, subId: string): Key {
  return { PK: `NOTIF#${eventId}`, SK: subId };
}

export function digestKey(subId: string, date: string): Key {
  return { PK: `DIGEST#${subId}`, SK: date };
}

export function budgetKey(date: string): Key {
  return { PK: `BUDGET#${date}`, SK: META_SK };
}

export function lockKey(name: string): Key {
  return { PK: `LOCK#${name}`, SK: META_SK };
}

export function systemMetaKey(): Key {
  return { PK: 'META#system', SK: META_SK };
}

export function epochSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function ttlAfterDays(now: Date, days: number): number {
  return epochSeconds(now) + days * 86_400;
}
