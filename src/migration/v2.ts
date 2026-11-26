import { Types } from 'mongoose';
import { bankCapacity } from '../content/economy';
import { getItem } from '../content/items';
import { levelFromXp, totalXpForLevel } from '../content/levels';
import { findTool, pickaxes } from '../content/tools';
import { businessTiers } from '../content/business';
import { veteranCosmetics, veteranInfo, veteranThresholds, type VeteranTier } from '../content/veteran';
import { hourly, scenarios } from '../game/balance';

/**
 * v2 → v3 conversion, as pure functions. Used by both the up-front migration
 * (scripts/migrate-v2-to-v3.ts) and the on-demand import (services/legacyImport.ts), so a
 * profile comes out the same whichever imports it first.
 *
 * v2 data is dirty: balances near 1e57, negatives, strings, missing fields, and (in the
 * v12 era) sometimes more than one profile per user. Everything here reads defensively.
 */

/** The v2 collections (left untouched; the migration only reads them). */
export const legacyCollections = { profiles: 'profilemodels', guilds: 'guilds', autoroles: 'autoroles' } as const;

/**
 * The "corrupt" line: about 30 days of heavy late-game play: late-game gross ₪/hour
 * × 4 hours × 30 days (BALANCE.md, "Migration ceiling"). Balances above it (veteranThresholds.corruptAbove)
 * are treated as exploits. Recomputed from the current numbers; shown in the summary.
 */
export function migrationCeiling(): number {
  const late = scenarios[scenarios.length - 1]!;
  return Math.round(hourly(late).gross * 4 * 30);
}

/**
 * What v2 coins turn into (owner decision, 2026-11-26):
 *  - corrupt profiles (balances above the ceiling, from old exploits): wallet + bank reset to ₪100k
 *    (at most: a negative balance is corrupt too, but becomes 0);
 *  - everyone else: wallet + bank + wages owed, filled into the wallet up to `wallet`, the rest into
 *    the bank up to its capacity at their level; anything beyond that is dropped.
 * ₪500k is about four days of early-game play (level 5, ~₪30k/h × 4 h/day) or one late-game day, so
 * veterans start ahead without topping the net-worth board for long.
 */
export const migrationCaps = { corruptTotal: 100_000, wallet: 500_000 } as const;

/** Each migrated item stack sells for at most this share of the player's coin cap (and never more than MAX_STACK), so items can't get around it. */
const STACK_SHARE = 0.1;
const MAX_STACK = 10_000;
/** v2 levels barely moved (max 3), so anything far above that is corrupt. */
const MAX_LEVEL = 35;
const MAX_PRESTIGE = 10;
const MAX_STREAK = 3_650;

/** v2 item → v3 item. Fish keep roughly their old value (v2 sold Common/Rare/Mythic for ₪200/800/3,000). */
export const itemMap: Record<string, string> = {
  CommonFish: 'fish_perch',
  RareFish: 'fish_salmon',
  MythicFish: 'fish_octopus',
  Shirt: 'v2_shirt',
  Pants: 'v2_pants',
  Cookies: 'v2_cookie',
};

/** Every v12 profile started with these; only counts above them are signs of play. */
const DEFAULT_ITEMS: Record<string, number> = { Shirt: 1, Pants: 1 };

/** Items beyond the starting Shirt and Pants. */
export function hasNonDefaultItems(l: Pick<Legacy, 'items'>): boolean {
  return Object.entries(l.items).some(([k, v]) => v > (DEFAULT_ITEMS[k] ?? 0));
}

/** v2 pickaxe tiers (functions/mineconfig.js) line up one-to-one with v3's pickaxes. */
export function pickaxeForTier(tier: number): string | null {
  if (!Number.isInteger(tier) || tier < 0) return null;
  return pickaxes[Math.min(tier, pickaxes.length - 1)]!.id;
}

/** v2 workers earned ₪500/hour each, collected manually, capped at a week of wages. */
const V2_WORKER_HOURLY = 500;
const V2_WAGE_CAP_HOURS = 168;

/** A v2 profile, read defensively. */
export interface Legacy {
  userId: string;
  /** Every v2 document merged into this one (duplicates from per-server profiles). */
  docCount: number;
  createdAt: Date;
  coins: number;
  bank: number;
  level: number;
  /** v2 XP is progress into the current level, not a total. */
  xp: number;
  prestige: number;
  streak: number;
  lastDaily: Date | null;
  toolTier: number;
  totalMined: number;
  workers: number;
  hasManager: boolean;
  pendingWages: number;
  lastCollected: Date | null;
  items: Record<string, number>;
  /** Distinct commands the player ever used (from `commands_cooldowns` and `cooldowns`). */
  commands: string[];
  /**
   * Command uses (entries, repeats included). The approved tier counts (445 / 64 / 23, PLAN.md §9)
   * were measured this way, so the thresholds apply to uses.
   */
  commandUses: number;
  /** v12 company miners (a second kind of worker); a sign of play, not imported. */
  miners: number;
  voted: boolean;
  /** Raw balances were negative, non-finite or above the corrupt threshold. */
  corrupt: boolean;
}

type Raw = Record<string, unknown>;

/** A finite number from whatever v2 stored (numbers, numeric strings, Long/Decimal128 objects). */
export function num(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) {
    const n = Number(String(value));
    if (!Number.isNaN(n)) return n;
  }
  return NaN;
}

/** A whole number in [min, max]; NaN and junk become `min`. */
function clampInt(value: unknown, min: number, max: number): number {
  const n = num(value);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function date(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function obj(value: unknown): Raw {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {};
}

/** When the v2 profile was made: its ObjectId timestamp (v2 never stored createdAt). */
function createdAtOf(raw: Raw): Date {
  const explicit = date(raw.createdAt);
  if (explicit) return explicit;
  const id = raw._id;
  if (id instanceof Types.ObjectId) return id.getTimestamp();
  if (typeof id === 'string' && Types.ObjectId.isValid(id) && id.length === 24) return new Types.ObjectId(id).getTimestamp();
  return new Date();
}

/**
 * Commands used, from `commands_cooldowns` (v12: an array with one entry per use, `{ name, time }`)
 * and `cooldowns` (the 2026 relaunch: command → date). `uses` counts entries, `names` the distinct ones.
 */
function commandsOf(raw: Raw): { names: string[]; uses: number } {
  const out = new Set<string>();
  let uses = 0;
  const add = (name: unknown) => {
    if (typeof name !== 'string' || !name.trim()) return;
    out.add(name.trim().toLowerCase());
    uses++;
  };
  for (const field of ['commands_cooldowns', 'cooldowns']) {
    const value = raw[field];
    if (Array.isArray(value)) {
      for (const entry of value) add(typeof entry === 'string' ? entry : obj(entry).name ?? obj(entry).command);
    } else {
      // Only real cooldown entries (dates); some v12 docs hold just `{ id: '<user id>' }`
      for (const [key, v] of Object.entries(obj(value))) if (v instanceof Date) add(key);
    }
  }
  return { names: [...out].sort(), uses };
}

/** Reads one raw v2 profile document. */
export function readLegacy(raw: Raw): Legacy {
  const mine = obj(raw.Mine);
  const company = obj(raw.Company);
  const items: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj(raw.Items))) {
    const n = clampInt(value, 0, Number.MAX_SAFE_INTEGER);
    if (n > 0) items[key] = n;
  }
  const coins = num(raw.coins);
  const bank = num(raw.bank);
  const cmds = commandsOf(raw);
  const corruptAbove = veteranThresholds.corruptAbove;
  const bad = (n: number) => Number.isNaN(n) ? false : !Number.isFinite(n) || n < 0 || n > corruptAbove;
  return {
    userId: String(raw.userID ?? raw.userId ?? ''),
    docCount: 1,
    createdAt: createdAtOf(raw),
    coins,
    bank,
    level: clampInt(raw.level, 0, MAX_LEVEL),
    xp: clampInt(raw.xp, 0, Number.MAX_SAFE_INTEGER),
    prestige: clampInt(raw.prestige, 0, MAX_PRESTIGE),
    streak: clampInt(raw.streak, 0, MAX_STREAK),
    lastDaily: date(raw.lastDaily),
    toolTier: clampInt(mine.toolTier ?? -1, -1, pickaxes.length - 1),
    totalMined: clampInt(mine.totalMined, 0, Number.MAX_SAFE_INTEGER),
    workers: clampInt(company.workers, 0, 1_000),
    hasManager: company.hasManager === true,
    pendingWages: clampInt(company.pendingWages, 0, Number.MAX_SAFE_INTEGER),
    lastCollected: date(company.lastCollected),
    items,
    commands: cmds.names,
    commandUses: cmds.uses,
    miners: clampInt(company.miners, 0, 1_000_000),
    // v12: topggrewards 'Claimed' / 'NotClaimed'; the 2026 relaunch: lastVoteClaim
    voted: raw.topggrewards === 'Claimed' || !!date(raw.lastVoteClaim),
    corrupt: bad(coins) || bad(bank),
  };
}

/**
 * Merges the v2 documents of one user (v12 sometimes kept one per server). The most active one
 * supplies balances, level and streak; commands and items are combined (items by max, never summed,
 * so duplicates can't multiply anything), and the oldest creation time wins.
 */
export function mergeLegacy(docs: Legacy[]): Legacy {
  if (docs.length === 0) throw new Error('mergeLegacy needs at least one document');
  const activity = (l: Legacy) => [l.commandUses, l.level, l.xp, l.totalMined, l.workers];
  const sorted = [...docs].sort((a, b) => {
    const x = activity(a);
    const y = activity(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i]! - x[i]!;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const primary = sorted[0]!;
  const items: Record<string, number> = {};
  for (const d of docs) for (const [k, v] of Object.entries(d.items)) items[k] = Math.max(items[k] ?? 0, v);
  return {
    ...primary,
    docCount: docs.reduce((n, d) => n + d.docCount, 0),
    createdAt: new Date(Math.min(...docs.map((d) => d.createdAt.getTime()))),
    commands: [...new Set(docs.flatMap((d) => d.commands))].sort(),
    commandUses: Math.max(...docs.map((d) => d.commandUses)),
    miners: Math.max(...docs.map((d) => d.miners)),
    items,
    toolTier: Math.max(...docs.map((d) => d.toolTier)),
    voted: docs.some((d) => d.voted),
    corrupt: docs.some((d) => d.corrupt),
  };
}

const RELAUNCH = new Date('2026-01-01T00:00:00Z');
const ORIGINAL_ERA_END = new Date('2023-01-01T00:00:00Z');

/**
 * Real activity: the Veteran rule (PLAN.md §9). These profiles are migrated up front and keep
 * their join date; everyone else is imported on demand as a fresh account.
 */
export function isActive(l: Legacy): boolean {
  if (l.createdAt >= RELAUNCH) {
    // The April 2026 relaunch: XP earned, mining, cooldowns used or items
    return l.xp > 0 || l.level > 1 || l.totalMined > 0 || l.toolTier >= 0 || l.commandUses > 0 || hasNonDefaultItems(l) || l.workers > 0 || l.miners > 0;
  }
  return l.commandUses >= veteranThresholds.veteran.minCommands || hasNonDefaultItems(l) || l.workers > 0 || l.miners > 0 || l.voted;
}

/** The veteran tier a v2 profile earns (from activity and join date, never balance). */
export function veteranTierOf(l: Legacy): VeteranTier | null {
  if (!isActive(l)) return null;
  if (l.corrupt || l.createdAt >= ORIGINAL_ERA_END) return 'veteran';
  const n = l.commandUses;
  if (l.createdAt < new Date(`${veteranThresholds.founder.joinedBefore}T00:00:00Z`) && n >= veteranThresholds.founder.minCommands) return 'founder';
  if (n >= veteranThresholds.elite.minCommands) return 'elite';
  return 'veteran';
}

/** v2 wages still owed: stored pending wages plus what built up since the last collect (a week at most). */
export function owedWages(l: Legacy, now: Date): number {
  const hours = l.lastCollected ? Math.min(Math.max(0, (now.getTime() - l.lastCollected.getTime()) / 3_600_000), V2_WAGE_CAP_HOURS) : 0;
  return l.pendingWages + Math.floor(l.workers * V2_WORKER_HOURLY * hours);
}

export interface Clamps {
  /** Coins were cut: a corrupt reset, or more than the wallet cap plus bank capacity. */
  wallet: boolean;
  /** v2 coins (incl. wages owed) beyond the wallet cap and bank capacity, not carried over. */
  dropped: number;
  items: string[];
  workers: boolean;
}

export interface Converted {
  /** Fields for the new `players` document, as dotted paths (safe inside $setOnInsert). */
  fields: Record<string, unknown>;
  tier: VeteranTier | null;
  active: boolean;
  wallet: number;
  bank: number;
  wagesPaid: number;
  clamps: Clamps;
  /** v2 item keys with no v3 equivalent (reported, not imported). */
  unknownItems: string[];
}

/** Converts a (merged) v2 profile to the fields of a new v3 profile. */
export function convert(l: Legacy, now = new Date()): Converted {
  const clamps: Clamps = { wallet: false, dropped: 0, items: [], workers: false };
  const active = isActive(l);
  const tier = veteranTierOf(l);

  // Level: v2 XP was progress into the level (levels started at 1). Re-fit to the v3 curve, never lower.
  let oldTotal = 0;
  for (let lv = 1; lv < l.level; lv++) oldTotal += 5 * lv * lv + 50 * lv + 100;
  oldTotal += l.xp;
  const level = Math.min(MAX_LEVEL, Math.max(l.level, levelFromXp(Math.min(oldTotal, totalXpForLevel(MAX_LEVEL))).level));
  const xp = Math.min(Math.max(oldTotal, totalXpForLevel(level)), totalXpForLevel(MAX_LEVEL + 1) - 1);

  // Coins: corrupt profiles get a flat ₪100k; everyone else wallet first, then bank up to capacity.
  // NaN and negatives become 0; anything unsafe (1e57, Infinity) is far above every cap anyway.
  const safe = (n: number) => (Number.isNaN(n) || n <= 0 ? 0 : Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER));
  const wagesPaid = l.corrupt ? 0 : Math.min(owedWages(l, now), Number.MAX_SAFE_INTEGER);
  const raw = Math.min(safe(l.coins) + safe(l.bank) + wagesPaid, Number.MAX_SAFE_INTEGER);
  const total = l.corrupt ? Math.min(raw, migrationCaps.corruptTotal) : raw; // a negative balance never becomes ₪100k
  const coinCap = l.corrupt ? migrationCaps.corruptTotal : migrationCaps.wallet;
  const wallet = Math.min(total, coinCap);
  const bank = Math.min(total - wallet, bankCapacity(level, 0));
  clamps.dropped = total - wallet - bank;
  clamps.wallet = l.corrupt || clamps.dropped > 0;

  const fields: Record<string, unknown> = {
    wallet,
    bank,
    'account.level': level,
    'account.xp': xp,
    'account.best': level,
    'account.prestige': l.prestige,
    'streak.count': l.streak,
    'streak.best': l.streak,
    'streak.lastDaily': l.lastDaily,
    'stats.mined': Math.min(l.totalMined, 1_000_000),
    migratedFromV2: true,
  };

  const unknownItems: string[] = [];
  for (const [key, qty] of Object.entries(l.items)) {
    if (key === 'FishingRod') continue;
    const id = itemMap[key];
    const item = id ? getItem(id) : undefined;
    if (!id || !item) {
      unknownItems.push(key);
      continue;
    }
    const max = Math.min(MAX_STACK, Math.max(1, Math.floor((coinCap * STACK_SHARE) / Math.max(1, item.sellPrice))));
    if (qty > max) clamps.items.push(key);
    fields[`inventory.${id}`] = Math.min(qty, max);
  }

  const pick = pickaxeForTier(l.toolTier);
  if (pick) {
    fields['tools.pickaxe.id'] = pick;
    fields['tools.pickaxe.durability'] = findTool('pickaxe', pick)!.durability;
  }
  if ((l.items.FishingRod ?? 0) > 0) {
    // v2 had one rod; it becomes the first upgrade over the free Old Rod
    fields['tools.rod.id'] = 'rod_fiberglass';
    fields['tools.rod.durability'] = findTool('rod', 'rod_fiberglass')!.durability;
  }

  if (l.workers > 0 || l.hasManager) {
    const stand = businessTiers[0]!;
    const workers = Math.min(l.workers, stand.maxWorkers);
    if (workers < l.workers) clamps.workers = true;
    fields['business.tier'] = stand.id;
    fields['business.workers'] = workers;
    fields['business.manager'] = l.hasManager;
    fields['business.lastTick'] = now;
  }

  if (tier) {
    fields['veteran.tier'] = tier;
    fields['cosmetics.owned'] = veteranCosmetics(tier);
    fields['cosmetics.badge'] = veteranInfo[tier].badge;
  }

  // Only real players keep their join date; dormant accounts start fresh for the anti-alt rule.
  fields.createdAt = active ? l.createdAt : now;
  fields.updatedAt = now;
  fields.lastActiveAt = now;

  return { fields, tier, active, wallet, bank, wagesPaid, clamps, unknownItems };
}

/** The coins a conversion created out of v2 balances (logged with its own source, not as income). */
export const MIGRATION_SOURCE = 'migration.v2';

/* ── Guild settings ─────────────────────────────────────────────────────────────────── */

const SNOWFLAKE = /^\d{15,21}$/;
const id = (value: unknown): string | null => (typeof value === 'string' && SNOWFLAKE.test(value) ? value : null);

/** Fields for a new `guild_settings` document from a v2 `guilds` doc and the old `autoroles` row. */
export function convertGuild(raw: Raw, autoroleRaw?: Raw | null): { guildId: string | null; fields: Record<string, unknown> } {
  const guildId = id(raw.guildID ?? raw.guildId);
  const ticket = obj(raw.ticket);
  const fields: Record<string, unknown> = {};
  const welcome = id(raw.welcomeID); // '0' means unset
  if (welcome) fields['welcome.channelId'] = welcome;
  if (num(raw.InviteLinks) > 0 || raw.InviteLinks === true) fields['automod.inviteFilter'] = true;
  const autoRole = id(raw.autoRoleID) ?? (autoroleRaw ? autoroleIdOf(autoroleRaw) : null);
  if (autoRole) fields.autoRoleId = autoRole;
  const staff = id(ticket.roleID);
  if (staff) fields['tickets.staffRoleId'] = staff;
  const counter = clampInt(ticket.number, 0, 1_000_000);
  if (counter > 0) fields['tickets.counter'] = counter;
  return { guildId, fields };
}

/** v12 `autoroles` rows: the guild and role fields' exact names varied, so match them loosely. */
export function autoroleGuildOf(raw: Raw): string | null {
  for (const [k, v] of Object.entries(raw)) if (/guild/i.test(k) && id(v)) return v as string;
  return null;
}

export function autoroleIdOf(raw: Raw): string | null {
  for (const [k, v] of Object.entries(raw)) if (/role/i.test(k) && id(v)) return v as string;
  return null;
}
