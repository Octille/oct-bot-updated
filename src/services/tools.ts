import { findTool, nextTool, repairCost, starterRod, type Tool, type ToolSlot } from '../content/tools';
import { EconomyError, UserError } from '../lib/errors';
import { coins } from '../lib/format';
import { apply, getProfile, type Profile } from './economy';

export interface Equipped {
  tool: Tool | null;
  durability: number;
  /** Owned but at 0 durability. */
  broken: boolean;
}

export function equipped(profile: Pick<Profile, 'tools'>, slot: ToolSlot): Equipped {
  const state = profile.tools?.[slot];
  const tool = findTool(slot, state?.id);
  const durability = state?.durability ?? 0;
  return { tool, durability, broken: !!tool && durability <= 0 };
}

/** Gives the free starter rod to someone fishing for the first time. */
export async function ensureStarterRod(userId: string): Promise<Profile> {
  const profile = await getProfile(userId);
  if (profile.tools?.rod?.id) return profile;
  const rod = findTool('rod', starterRod)!;
  try {
    return await apply(
      userId,
      { set: { 'tools.rod.id': rod.id, 'tools.rod.durability': rod.durability }, where: { 'tools.rod.id': null } },
      { source: 'tools.starter' },
    );
  } catch (err) {
    if (err instanceof EconomyError && err.code === 'CONFLICT') return getProfile(userId);
    throw err;
  }
}

/** Buys the next tool tier, replacing the current one at full durability. */
export async function upgrade(userId: string, slot: ToolSlot): Promise<{ tool: Tool; profile: Profile }> {
  const profile = await getProfile(userId);
  const current = profile.tools?.[slot]?.id ?? null;
  const next = nextTool(slot, current);
  if (!next) throw new UserError('You already have the best one.');
  const level = profile.account?.level ?? 0;
  if (level < next.level) throw new UserError(`The ${next.emoji} **${next.name}** needs account level **${next.level}** (you're ${level}).`);

  const updated = await apply(
    userId,
    {
      wallet: next.cost ? -next.cost : undefined,
      set: { [`tools.${slot}.id`]: next.id, [`tools.${slot}.durability`]: next.durability },
      where: { [`tools.${slot}.id`]: current },
    },
    { source: `tools.buy.${slot}`, meta: { tool: next.id } },
  );
  return { tool: next, profile: updated };
}

/** Restores the equipped tool to full durability. */
export async function repair(userId: string, slot: ToolSlot): Promise<{ tool: Tool; cost: number; profile: Profile }> {
  const profile = await getProfile(userId);
  const { tool, durability } = equipped(profile, slot);
  if (!tool) throw new UserError("You don't have one to repair.");
  if (durability >= tool.durability) throw new UserError(`Your ${tool.name} is already in perfect shape.`);
  const cost = repairCost(tool, durability);
  const updated = await apply(
    userId,
    {
      wallet: -cost,
      set: { [`tools.${slot}.durability`]: tool.durability },
      where: { [`tools.${slot}.id`]: tool.id, [`tools.${slot}.durability`]: durability },
    },
    { source: `tools.repair.${slot}`, meta: { tool: tool.id } },
  );
  return { tool, cost, profile: updated };
}

export function describeTool(e: Equipped, slot: ToolSlot): string {
  if (!e.tool) return { pickaxe: 'Bare hands', rod: 'No rod', weapon: 'No weapon', shovel: 'No shovel' }[slot];
  const state = e.broken ? ' — **broken**' : '';
  return `${e.tool.name} (${e.durability}/${e.tool.durability})${state}`;
}

export { coins };
