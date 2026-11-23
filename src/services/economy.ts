import mongoose, { type ClientSession, type FlattenMaps } from 'mongoose';
import { User, type UserData } from '../models/User';
import { Transaction } from '../models/Transaction';
import { EconomyError } from '../lib/errors';
import { coins } from '../lib/format';
import { bankCapacity, economyConfig } from '../content/economy';

/**
 * The only place that changes balances or inventories.
 * Every change is one conditional update, so concurrent commands can never overspend,
 * go negative or overfill the bank. Multi-player changes run in a Mongo transaction.
 */

/** A profile as read from the database (maps become plain objects). */
export type Profile = FlattenMaps<UserData> & { _id: string };

export interface Change {
  wallet?: number;
  bank?: number;
  /** itemId → quantity delta */
  items?: Record<string, number>;
}

export interface ApplyOptions {
  source: string;
  meta?: Record<string, unknown>;
  session?: ClientSession;
  /** Log rows as value moving between balances/players rather than being created or destroyed. */
  transfer?: boolean;
  /** Skip writing transaction rows (the caller logs them itself). */
  skipLog?: boolean;
}

const ITEM_ID = /^[a-z0-9_]+$/;
const DUPLICATE_KEY = 11000;

function assertWhole(n: number, label: string): void {
  if (!Number.isSafeInteger(n)) throw new EconomyError('INVALID_AMOUNT', `${label} must be a whole number.`);
}

function assertPositive(n: number, label = 'Amount'): void {
  assertWhole(n, label);
  if (n <= 0) throw new EconomyError('INVALID_AMOUNT', `${label} must be more than zero.`);
}

/** Bank capacity computed inside MongoDB, so the cap check is part of the atomic update. */
const bankCapExpr = {
  $add: [
    economyConfig.bank.base,
    { $multiply: [{ $ifNull: ['$account.level', 0] }, economyConfig.bank.perLevel] },
    { $multiply: [{ $ifNull: ['$bankNotes', 0] }, economyConfig.bank.perNote] },
  ],
};

export function capacityOf(user: Pick<Profile, 'account' | 'bankNotes'>): number {
  return bankCapacity(user.account?.level ?? 0, user.bankNotes ?? 0);
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === DUPLICATE_KEY;
}

/** Creates the profile if it doesn't exist. Safe to call concurrently. */
export async function ensureUser(userId: string, session?: ClientSession): Promise<void> {
  try {
    await User.updateOne({ _id: userId }, { $setOnInsert: { _id: userId } }, { upsert: true, session });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err; // another request created it first
  }
}

/**
 * Loads (creating silently if needed) a profile and marks the user as active.
 * Used by the interaction wrapper for every command and button press.
 */
export async function loadProfile(userId: string): Promise<Profile> {
  const run = () =>
    User.findOneAndUpdate(
      { _id: userId },
      { $setOnInsert: { _id: userId }, $set: { lastActiveAt: new Date() } },
      { upsert: true, new: true, lean: true },
    );
  let user: Profile | null;
  try {
    user = await run();
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    user = await run(); // another request created it first
  }
  if (!user) throw new EconomyError('NO_PROFILE', 'Could not load your profile.');
  return user;
}

export async function getProfile(userId: string, session?: ClientSession): Promise<Profile> {
  await ensureUser(userId, session);
  const user = await User.findById(userId, null, { session, lean: true });
  if (!user) throw new EconomyError('NO_PROFILE', 'Profile not found.');
  return user;
}

/** Works out which guard made a conditional update fail, for a helpful error message. */
async function explainFailure(userId: string, change: Change, session?: ClientSession): Promise<EconomyError> {
  const user: Profile | null = await User.findById(userId, null, { session, lean: true });
  if (!user) return new EconomyError('NO_PROFILE', 'Profile not found.');

  if (change.wallet && change.wallet < 0 && user.wallet < -change.wallet) {
    return new EconomyError('INSUFFICIENT_WALLET', `You need ${coins(-change.wallet)} in your wallet but only have ${coins(user.wallet)}.`);
  }
  if (change.bank && change.bank < 0 && user.bank < -change.bank) {
    return new EconomyError('INSUFFICIENT_BANK', `You need ${coins(-change.bank)} in your bank but only have ${coins(user.bank)}.`);
  }
  if (change.bank && change.bank > 0) {
    const cap = capacityOf(user);
    if (user.bank + change.bank > cap) {
      return new EconomyError('BANK_FULL', `Your bank can only hold ${coins(cap)} (it has ${coins(user.bank)}). Level up or use a bank note to raise the limit.`);
    }
  }
  const inventory: Record<string, number> = user.inventory ?? {};
  for (const [itemId, qty] of Object.entries(change.items ?? {})) {
    if (qty < 0 && (inventory[itemId] ?? 0) < -qty) {
      return new EconomyError('INSUFFICIENT_ITEMS', `You need ${-qty}× \`${itemId}\` but only have ${inventory[itemId] ?? 0}.`);
    }
  }
  // Nothing obviously wrong: the balance changed between the update and this check.
  return new EconomyError('INSUFFICIENT_WALLET', 'Your balance changed while that was happening. Try again.');
}

/**
 * Applies a change to one user atomically. Throws EconomyError (and changes nothing) if any
 * part of it can't be afforded. Returns the updated profile.
 */
export async function apply(userId: string, change: Change, opts: ApplyOptions): Promise<Profile> {
  const filter: Record<string, unknown> = { _id: userId };
  const inc: Record<string, number> = {};
  const rows: { kind: 'wallet' | 'bank' | 'item'; itemId?: string; delta: number }[] = [];

  if (change.wallet) {
    assertWhole(change.wallet, 'Wallet change');
    inc.wallet = change.wallet;
    if (change.wallet < 0) filter.wallet = { $gte: -change.wallet };
    rows.push({ kind: 'wallet', delta: change.wallet });
  }
  if (change.bank) {
    assertWhole(change.bank, 'Bank change');
    inc.bank = change.bank;
    if (change.bank < 0) filter.bank = { $gte: -change.bank };
    else filter.$expr = { $lte: [{ $add: ['$bank', change.bank] }, bankCapExpr] };
    rows.push({ kind: 'bank', delta: change.bank });
  }
  const zeroed: string[] = [];
  for (const [itemId, qty] of Object.entries(change.items ?? {})) {
    if (!ITEM_ID.test(itemId)) throw new Error(`Invalid item id "${itemId}"`);
    assertWhole(qty, 'Item quantity');
    if (qty === 0) continue;
    const path = `inventory.${itemId}`;
    inc[path] = qty;
    if (qty < 0) {
      filter[path] = { $gte: -qty };
      zeroed.push(path);
    }
    rows.push({ kind: 'item', itemId, delta: qty });
  }

  await ensureUser(userId, opts.session);
  if (rows.length === 0) return getProfile(userId, opts.session);

  const updated = await User.findOneAndUpdate(filter, { $inc: inc }, { new: true, session: opts.session, lean: true });
  if (!updated) throw await explainFailure(userId, change, opts.session);

  // Remove items that reached zero so inventories stay tidy
  for (const path of zeroed) {
    await User.updateOne({ _id: userId, [path]: 0 }, { $unset: { [path]: '' } }, { session: opts.session });
  }

  if (!opts.skipLog) {
    await Transaction.insertMany(
      rows.map((r) => ({ ...r, userId, source: opts.source, meta: opts.meta, transfer: opts.transfer ?? false })),
      { session: opts.session },
    );
  }
  return updated;
}

/** Runs `fn` in a Mongo transaction; everything inside commits or rolls back together. */
export async function inTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

export async function addCoins(userId: string, amount: number, opts: ApplyOptions): Promise<Profile> {
  assertPositive(amount);
  return apply(userId, { wallet: amount }, opts);
}

export async function removeCoins(userId: string, amount: number, opts: ApplyOptions): Promise<Profile> {
  assertPositive(amount);
  return apply(userId, { wallet: -amount }, opts);
}

export async function addItem(userId: string, itemId: string, qty: number, opts: ApplyOptions): Promise<Profile> {
  assertPositive(qty, 'Quantity');
  return apply(userId, { items: { [itemId]: qty } }, opts);
}

export async function removeItem(userId: string, itemId: string, qty: number, opts: ApplyOptions): Promise<Profile> {
  assertPositive(qty, 'Quantity');
  return apply(userId, { items: { [itemId]: -qty } }, opts);
}

type BankRequest = number | 'all';

/** Moves coins wallet → bank, up to the bank's capacity. `all` deposits as much as fits. */
export async function deposit(userId: string, request: BankRequest): Promise<{ amount: number; profile: Profile }> {
  for (let attempt = 0; ; attempt++) {
    const user = await getProfile(userId);
    const room = capacityOf(user) - user.bank;
    const amount = request === 'all' ? Math.min(user.wallet, room) : request;
    if (request === 'all' && user.wallet <= 0) throw new EconomyError('INSUFFICIENT_WALLET', 'Your wallet is empty.');
    if (request === 'all' && room <= 0) throw new EconomyError('BANK_FULL', `Your bank is full (${coins(capacityOf(user))}).`);
    assertPositive(amount);
    try {
      const profile = await apply(userId, { wallet: -amount, bank: amount }, { source: 'bank.deposit', transfer: true });
      return { amount, profile };
    } catch (err) {
      // With `all` the balance may have changed underneath us; recompute and retry
      if (request !== 'all' || !(err instanceof EconomyError) || attempt >= 2) throw err;
    }
  }
}

/** Moves coins bank → wallet. `all` withdraws everything. */
export async function withdraw(userId: string, request: BankRequest): Promise<{ amount: number; profile: Profile }> {
  for (let attempt = 0; ; attempt++) {
    const user = await getProfile(userId);
    const amount = request === 'all' ? user.bank : request;
    if (request === 'all' && user.bank <= 0) throw new EconomyError('INSUFFICIENT_BANK', 'Your bank is empty.');
    assertPositive(amount);
    try {
      const profile = await apply(userId, { wallet: amount, bank: -amount }, { source: 'bank.withdraw', transfer: true });
      return { amount, profile };
    } catch (err) {
      if (request !== 'all' || !(err instanceof EconomyError) || attempt >= 2) throw err;
    }
  }
}

export interface TransferResult {
  sent: number;
  received: number;
  tax: number;
}

/**
 * Sends wallet coins from one player to another, with an optional tax that is destroyed.
 * Both sides commit together or not at all.
 */
export async function transfer(
  fromId: string,
  toId: string,
  amount: number,
  opts: { source: string; taxRate?: number; meta?: Record<string, unknown> },
): Promise<TransferResult> {
  assertPositive(amount);
  if (fromId === toId) throw new EconomyError('SELF_TRANSFER', "You can't send coins to yourself.");
  const tax = Math.floor(amount * (opts.taxRate ?? 0));
  const received = amount - tax;

  await inTransaction(async (session) => {
    await apply(fromId, { wallet: -amount }, { source: opts.source, session, skipLog: true });
    if (received > 0) await apply(toId, { wallet: received }, { source: opts.source, session, skipLog: true });

    const meta = { ...opts.meta, from: fromId, to: toId };
    const rows = [
      { userId: fromId, kind: 'wallet', delta: -received, source: opts.source, transfer: true, meta },
      { userId: toId, kind: 'wallet', delta: received, source: opts.source, transfer: true, meta },
    ];
    if (tax > 0) rows.push({ userId: fromId, kind: 'wallet', delta: -tax, source: `${opts.source}.tax`, transfer: false, meta });
    await Transaction.insertMany(rows.filter((r) => r.delta !== 0), { session });
  });

  return { sent: amount, received, tax };
}

export interface Settlement {
  userId: string;
  change: Change;
  /** Overrides the shared source for this player's rows. */
  source?: string;
  transfer?: boolean;
}

/**
 * Applies several players' changes in one transaction (trades, duels, heist payouts, robberies).
 * If any player can't afford their part, nothing happens.
 */
export async function settle(entries: Settlement[], opts: { source: string; meta?: Record<string, unknown> }): Promise<Profile[]> {
  return inTransaction(async (session) => {
    const results: Profile[] = [];
    for (const entry of entries) {
      results.push(await apply(entry.userId, entry.change, {
        source: entry.source ?? opts.source,
        meta: opts.meta,
        transfer: entry.transfer,
        session,
      }));
    }
    return results;
  });
}
