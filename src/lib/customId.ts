/**
 * Component custom IDs look like `prefix:ownerId:arg1:arg2`.
 * `ownerId` is the only user allowed to press it, or `*` for anyone.
 */
export const ANYONE = '*';

export function makeId(prefix: string, ownerId: string, ...args: (string | number)[]): string {
  const id = [prefix, ownerId, ...args.map(String)].join(':');
  if (id.length > 100) throw new Error(`customId too long (${id.length}): ${id}`);
  if (args.some((a) => String(a).includes(':'))) throw new Error(`customId args can't contain ":" (${id})`);
  return id;
}

export interface ParsedId {
  prefix: string;
  ownerId: string;
  args: string[];
}

export function parseId(customId: string): ParsedId {
  const [prefix = '', ownerId = ANYONE, ...args] = customId.split(':');
  return { prefix, ownerId, args };
}
