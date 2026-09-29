import type { SnapshotEvent } from '@cert-tracker/core';

export const LAST_VISIT_KEY = 'cert-tracker:lastVisitAt:v1';

export interface DayGroup {
  day: string;
  events: SnapshotEvent[];
  // true on the first group that is entirely older than the last visit
  dividerBefore: boolean;
}

export function groupByDay(events: readonly SnapshotEvent[], lastVisit: string | null): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const event of events) {
    const day = event.occurredAt.slice(0, 10);
    const last = groups.at(-1);
    if (last?.day === day) last.events.push(event);
    else groups.push({ day, events: [event], dividerBefore: false });
  }
  if (lastVisit !== null) {
    const first = groups.find((g) => g.events.every((e) => e.occurredAt <= lastVisit));
    if (first !== undefined && first !== groups[0]) first.dividerBefore = true;
  }
  return groups;
}

// read once, then overwrite; the divider is drawn against the previous visit
export function rotateLastVisit(): string | null {
  try {
    const previous = localStorage.getItem(LAST_VISIT_KEY);
    localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
    return previous;
  } catch {
    return null;
  }
}
