import { maxBoostMinutes, type BoostKind } from '../content/consumables';

type Boosts = Partial<Record<BoostKind, Date | null>> | null | undefined;

export function isActive(boosts: Boosts, kind: BoostKind, now = Date.now()): boolean {
  const until = boosts?.[kind];
  return !!until && new Date(until).getTime() > now;
}

/** New expiry after using a boost: stacks onto any remaining time, capped at the maximum. */
export function extendBoost(current: Date | null | undefined, minutes: number, now = Date.now()): Date {
  const from = current && current.getTime() > now ? current.getTime() : now;
  return new Date(Math.min(from + minutes * 60_000, now + maxBoostMinutes * 60_000));
}
