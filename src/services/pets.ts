import { petRules, pets, type PetSpecies } from '../content/pets';
import { EconomyError, UserError } from '../lib/errors';
import { apply, getProfile, type Profile } from './economy';
import { unlockLevel } from './progression';

type PetSource = Partial<Pick<Profile, 'pet'>>;

/** Happiness now: what it was when last cared for, minus decay since. */
export function petHappiness(p: PetSource, now = Date.now()): number {
  const pet = p.pet;
  if (!pet?.species) return 0;
  const hours = pet.caredAt ? (now - new Date(pet.caredAt).getTime()) / 3_600_000 : 0;
  return Math.max(0, Math.round((pet.happiness ?? 100) - hours * petRules.decayPerHour));
}

/** The pet's perk strength (0 when it's unhappy or there's no pet), scaled by level. */
export function petPerk(p: PetSource, species: PetSpecies, now = Date.now()): number {
  if (p.pet?.species !== species || petHappiness(p, now) < petRules.happyAt) return 0;
  return (pets[species].perkAtMax * (p.pet.level ?? 1)) / petRules.maxLevel;
}

export async function adoptPet(userId: string, species: PetSpecies, name: string): Promise<Profile> {
  const p = await getProfile(userId);
  if (p.pet?.species) throw new UserError('You already have a pet.');
  if (unlockLevel(p) < petRules.minLevel) throw new UserError(`Pets unlock at account level ${petRules.minLevel}.`);
  const info = pets[species];
  const clean = name.trim().slice(0, 20) || info.name;
  try {
    return await apply(userId, {
      wallet: -info.price,
      set: { pet: { species, name: clean, level: 1, xp: 0, happiness: 100, caredAt: new Date(), fedAt: null, playedAt: null } },
      where: { 'pet.species': null },
    }, { source: 'pet.adopt', meta: { species } });
  } catch (err) {
    if (err instanceof EconomyError) throw new UserError(err.code === 'CONFLICT' ? 'You already have a pet.' : `You need ${info.price.toLocaleString('en-US')} coins.`);
    throw err;
  }
}

/** Feed (costs coins) or play (free): happiness up, XP up, level up. One guarded update. */
export async function carePet(userId: string, kind: 'feed' | 'play', now = new Date()): Promise<{ happiness: number; levelUp: boolean }> {
  const p = await getProfile(userId);
  if (!p.pet?.species) throw new UserError("You don't have a pet. Adopt one in `/pet`.");
  const rule = petRules[kind];
  const last = kind === 'feed' ? p.pet.fedAt : p.pet.playedAt;
  const readyAt = last ? new Date(last).getTime() + rule.cooldownHours * 3_600_000 : 0;
  if (readyAt > now.getTime()) throw new UserError(`${p.pet.name} isn't ${kind === 'feed' ? 'hungry' : 'in the mood'} yet. Try again <t:${Math.floor(readyAt / 1000)}:R>.`);
  const happiness = Math.min(100, petHappiness(p, now.getTime()) + rule.happiness);
  let level = p.pet.level ?? 1;
  let xp = (p.pet.xp ?? 0) + rule.xp;
  while (level < petRules.maxLevel && xp >= petRules.xpToNext(level)) { xp -= petRules.xpToNext(level); level++; }
  if (level >= petRules.maxLevel) xp = 0;
  const stamp = kind === 'feed' ? 'pet.fedAt' : 'pet.playedAt';
  try {
    await apply(userId, {
      wallet: kind === 'feed' ? -petRules.feed.cost : undefined,
      set: { 'pet.happiness': happiness, 'pet.caredAt': now, 'pet.level': level, 'pet.xp': xp, [stamp]: now },
      where: { 'pet.species': p.pet.species, [stamp]: last ?? null },
    }, { source: `pet.${kind}` });
  } catch (err) {
    if (err instanceof EconomyError) throw new UserError(err.code === 'CONFLICT' ? 'Something changed. Try again.' : `Food costs ${petRules.feed.cost} coins.`);
    throw err;
  }
  return { happiness, levelUp: level > (p.pet.level ?? 1) };
}

export async function renamePet(userId: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 20);
  if (!clean) throw new UserError('Give it a name.');
  await apply(userId, { set: { 'pet.name': clean }, where: { 'pet.species': { $ne: null } } }, { source: 'pet.rename' });
}

/** Lets the pet go (no refund). */
export async function releasePet(userId: string): Promise<void> {
  await apply(userId, { set: { 'pet.species': null, 'pet.name': null, 'pet.level': 1, 'pet.xp': 0, 'pet.happiness': 100, 'pet.caredAt': null } }, { source: 'pet.release' });
}
