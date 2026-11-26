import mongoose from 'mongoose';
import { veteranCosmetics, veteranInfo, type VeteranTier } from '../content/veteran';
import { GuildSettings } from '../models/GuildSettings';
import { User } from '../models/User';
import { insertImported } from '../services/legacyImport';
import {
  autoroleGuildOf, convert, convertGuild, legacyCollections, mergeLegacy, migrationCeiling, readLegacy, type Legacy,
} from './v2';

/**
 * The v2 → v3 migration. Reads the v2 collections (never changes or deletes them) and:
 *  - imports the profiles with real activity up front (the rest are imported on demand);
 *  - grants veteran tiers, computed over every v2 profile;
 *  - creates server settings from the v2 `guilds` and `autoroles` collections.
 * Idempotent: profiles and servers that already exist in v3 are skipped. With `dryRun` nothing is written.
 */

export interface MigrationSummary {
  dryRun: boolean;
  ceiling: number;
  profiles: {
    docs: number;
    users: number;
    /** Users with more than one v2 document (merged). */
    duplicates: number;
    noUserId: number;
    active: number;
    dormant: number;
    corrupt: number;
    tiers: Record<VeteranTier, number>;
    /** Active profiles created now / already in v3 (skipped) / already in v3 without a tier (tier granted). */
    imported: number;
    alreadyImported: number;
    tierGrantedToExisting: number;
    /** Coins the up-front imports carry over (wallet + bank, after clamps), and v2 wages paid. */
    coinsCarried: number;
    wagesPaid: number;
    clampedWallets: number;
    bankOverflowToWallet: number;
    clampedItems: number;
    clampedWorkers: number;
    businesses: number;
    pickaxes: number;
    joinedByYear: Record<string, number>;
    /** Field names and item keys seen in v2 documents, to spot shapes the mapping doesn't know. */
    topLevelFields: Record<string, number>;
    itemKeys: Record<string, number>;
    unknownItems: Record<string, number>;
    commandCounts: Record<string, number>;
  };
  guilds: { docs: number; created: number; alreadyExists: number; skippedNoId: number; withSettings: number; autorolesMatched: number };
  /** Up to 20 example users per notable case, for spot checks. */
  examples: Record<string, string[]>;
}

const n = (x: number) => x.toLocaleString('en-US');
const bump = (m: Record<string, number>, k: string, by = 1) => { m[k] = (m[k] ?? 0) + by; };

export async function runMigration(opts: { dryRun: boolean; now?: Date; log?: (line: string) => void }): Promise<MigrationSummary> {
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => undefined);
  const db = mongoose.connection.db!;
  const ceiling = migrationCeiling();
  const s: MigrationSummary = {
    dryRun: opts.dryRun,
    ceiling,
    profiles: {
      docs: 0, users: 0, duplicates: 0, noUserId: 0, active: 0, dormant: 0, corrupt: 0,
      tiers: { veteran: 0, elite: 0, founder: 0 },
      imported: 0, alreadyImported: 0, tierGrantedToExisting: 0,
      coinsCarried: 0, wagesPaid: 0, clampedWallets: 0, bankOverflowToWallet: 0, clampedItems: 0, clampedWorkers: 0,
      businesses: 0, pickaxes: 0,
      joinedByYear: {}, topLevelFields: {}, itemKeys: {}, unknownItems: {}, commandCounts: {},
    },
    guilds: { docs: 0, created: 0, alreadyExists: 0, skippedNoId: 0, withSettings: 0, autorolesMatched: 0 },
    examples: {},
  };
  const example = (kind: string, userId: string) => {
    const list = (s.examples[kind] ??= []);
    if (list.length < 20) list.push(userId);
  };

  // ── Profiles, grouped by user (v12 sometimes kept one document per server) ──────────────
  const groups = db.collection(legacyCollections.profiles).aggregate<{ _id: unknown; docs: Record<string, unknown>[] }>(
    [{ $group: { _id: '$userID', docs: { $push: '$$ROOT' } } }],
    { allowDiskUse: true },
  );
  for await (const group of groups) {
    s.profiles.docs += group.docs.length;
    for (const d of group.docs) {
      for (const k of Object.keys(d)) bump(s.profiles.topLevelFields, k);
      for (const k of Object.keys((d.Items as object | null) ?? {})) bump(s.profiles.itemKeys, k);
    }
    const legacy: Legacy[] = group.docs.map((d) => readLegacy(d));
    const userId = legacy[0]!.userId;
    if (!/^\d{15,21}$/.test(userId)) {
      s.profiles.noUserId += group.docs.length;
      continue;
    }
    s.profiles.users++;
    if (s.profiles.users % 10_000 === 0) log(`  …${n(s.profiles.users)} users read`);
    if (group.docs.length > 1) {
      s.profiles.duplicates++;
      example('duplicate', userId);
    }
    const merged = mergeLegacy(legacy);
    const c = convert(merged, now, ceiling);
    bump(s.profiles.joinedByYear, String(merged.createdAt.getUTCFullYear()));
    bump(s.profiles.commandCounts, merged.commands.length >= 10 ? '10+' : String(merged.commands.length));
    if (merged.corrupt) {
      s.profiles.corrupt++;
      example('corrupt', userId);
    }
    for (const k of c.unknownItems) bump(s.profiles.unknownItems, k);
    if (!c.active) {
      s.profiles.dormant++;
      continue;
    }

    s.profiles.active++;
    if (c.tier) {
      s.profiles.tiers[c.tier]++;
      example(c.tier, userId);
    }
    s.profiles.coinsCarried += c.wallet + c.bank;
    s.profiles.wagesPaid += c.wagesPaid;
    if (c.clamps.wallet) { s.profiles.clampedWallets++; example('clampedWallet', userId); }
    if (c.clamps.bankOverflow > 0) s.profiles.bankOverflowToWallet++;
    if (c.clamps.items.length) { s.profiles.clampedItems++; example('clampedItems', userId); }
    if (c.clamps.workers) s.profiles.clampedWorkers++;
    if (c.fields['business.tier']) s.profiles.businesses++;
    if (c.fields['tools.pickaxe.id']) s.profiles.pickaxes++;

    const existing = await User.findById(userId, { migratedFromV2: 1, 'veteran.tier': 1 }).lean();
    if (!existing) {
      if (!opts.dryRun && !(await insertImported(userId, c))) {
        s.profiles.alreadyImported++; // created by the bot between the check and the insert
        continue;
      }
      s.profiles.imported++;
    } else if (c.tier && !existing.veteran?.tier) {
      // Their v3 profile was made before the migration ran: keep it, but they still get their tier
      if (!opts.dryRun) {
        await User.updateOne(
          { _id: userId, 'veteran.tier': null },
          { $set: { 'veteran.tier': c.tier, 'cosmetics.badge': veteranInfo[c.tier].badge }, $addToSet: { 'cosmetics.owned': { $each: veteranCosmetics(c.tier) } } },
        );
      }
      s.profiles.tierGrantedToExisting++;
      example('tierGrantedToExisting', userId);
    } else {
      s.profiles.alreadyImported++;
    }
  }

  // ── Server settings ──────────────────────────────────────────────────────────────────
  const autoroles = new Map<string, Record<string, unknown>>();
  for await (const row of db.collection(legacyCollections.autoroles).find({})) {
    const g = autoroleGuildOf(row);
    if (g) autoroles.set(g, row);
  }
  for await (const raw of db.collection(legacyCollections.guilds).find({})) {
    s.guilds.docs++;
    const guildIdRaw = (raw.guildID ?? raw.guildId) as string | undefined;
    const { guildId, fields } = convertGuild(raw, guildIdRaw ? autoroles.get(guildIdRaw) : null);
    if (!guildId) {
      s.guilds.skippedNoId++;
      continue;
    }
    if (guildIdRaw && autoroles.has(guildIdRaw) && fields.autoRoleId) s.guilds.autorolesMatched++;
    if (Object.keys(fields).length === 0) continue; // nothing set in v2: defaults on first use
    s.guilds.withSettings++;
    if (await GuildSettings.exists({ _id: guildId })) {
      s.guilds.alreadyExists++;
      continue;
    }
    if (!opts.dryRun) {
      const res = await GuildSettings.updateOne({ _id: guildId }, { $setOnInsert: fields }, { upsert: true });
      if (!res.upsertedCount) {
        s.guilds.alreadyExists++;
        continue;
      }
    }
    s.guilds.created++;
  }

  return s;
}

/** The summary as plain text for the terminal. */
export function formatSummary(s: MigrationSummary): string {
  const p = s.profiles;
  const top = (m: Record<string, number>, k = 25) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, k).map(([key, v]) => `${key} ${n(v)}`).join(', ') || '—';
  const verb = s.dryRun ? 'would be' : 'were';
  return [
    `v2 → v3 migration ${s.dryRun ? '(DRY RUN, nothing written)' : '(WRITTEN)'}`,
    `Balance ceiling: ₪${n(s.ceiling)}`,
    '',
    'Profiles',
    `  v2 documents: ${n(p.docs)} · users: ${n(p.users)} · users with duplicate docs (merged): ${n(p.duplicates)} · docs without a user id: ${n(p.noUserId)}`,
    `  Active (migrated up front): ${n(p.active)} · dormant (imported on demand): ${n(p.dormant)} · corrupt balances: ${n(p.corrupt)}`,
    `  Veteran tiers (highest tier only): Veteran ${n(p.tiers.veteran)} · Elite ${n(p.tiers.elite)} · Founder ${n(p.tiers.founder)}`,
    `  Any tier: ${n(p.tiers.veteran + p.tiers.elite + p.tiers.founder)} · Elite or Founder: ${n(p.tiers.elite + p.tiers.founder)} · Founder: ${n(p.tiers.founder)} (Nov 2026 read-only check: 445 / 64 / 23)`,
    `  Imported now: ${n(p.imported)} ${verb} created · already in v3: ${n(p.alreadyImported)} · existing v3 profiles given their tier: ${n(p.tierGrantedToExisting)}`,
    `  Coins carried over (wallet + bank): ₪${n(p.coinsCarried)} · v2 wages paid: ₪${n(p.wagesPaid)}`,
    `  Clamped: wallets ${n(p.clampedWallets)} · bank overflow moved to wallet ${n(p.bankOverflowToWallet)} · item stacks ${n(p.clampedItems)} · workers ${n(p.clampedWorkers)}`,
    `  Businesses: ${n(p.businesses)} · pickaxes: ${n(p.pickaxes)}`,
    `  Joined by year: ${top(p.joinedByYear)}`,
    `  Distinct commands used: ${Object.entries(p.commandCounts).sort().map(([k, v]) => `${k}: ${n(v)}`).join(', ')}`,
    `  Fields seen: ${top(p.topLevelFields, 40)}`,
    `  Item keys seen: ${top(p.itemKeys)}`,
    `  Item keys with no v3 item (not imported): ${top(p.unknownItems)}`,
    '',
    'Servers',
    `  v2 guilds: ${n(s.guilds.docs)} · with settings to carry over: ${n(s.guilds.withSettings)} · ${verb} created: ${n(s.guilds.created)} · already in v3: ${n(s.guilds.alreadyExists)} · no guild id: ${n(s.guilds.skippedNoId)} · autoroles matched: ${n(s.guilds.autorolesMatched)}`,
    '',
    'Examples (user ids)',
    ...Object.entries(s.examples).map(([k, ids]) => `  ${k}: ${ids.join(', ')}`),
  ].join('\n');
}
