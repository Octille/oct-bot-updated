import { getCosmetic } from '../content/cosmetics';
import { veteranCosmetics, veteranInfo, veteranTiers, type VeteranTier } from '../content/veteran';
import type { IconKey } from '../content/icons';
import { embed } from '../lib/embeds';
import { icon, titleIcon } from '../lib/icons';
import { btn, ids, MAIN, row, type Payload } from './kit';

const KIND_LABEL = { title: 'Titles', badge: 'Badges', theme: 'Colour themes', frame: 'Card frames', background: 'Card backgrounds' } as const;

/**
 * The one-time message a player from the original bot sees on their first v3 command:
 * thanks, their tier, everything it unlocked, and a button to the Wardrobe.
 */
export function welcomeBackPayload(owner: string, tier: VeteranTier): Payload {
  const info = veteranInfo[tier];
  const unlocked = veteranCosmetics(tier).map(getCosmetic).filter((c) => !!c);
  const byKind = new Map<string, string[]>();
  for (const c of unlocked) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c.kind === 'badge' ? `${icon(c.value as IconKey)} ${c.name.replace(' badge', '')}` : c.name]);
  const lower = veteranTiers.slice(0, veteranTiers.indexOf(tier));

  const e = embed('levels')
    .setTitle(`${titleIcon(info.badge as IconKey)} Welcome back, ${info.label}`)
    .setDescription([
      `**Thank you for playing the original OctBot.** ${info.blurb} OctBot has been rebuilt from scratch, and you're getting a set of cosmetics nobody else can ever earn.`,
      '',
      `Your tier: **${info.label}**${lower.length ? ` (includes ${lower.map((t) => veteranInfo[t].label).join(' and ')})` : ''}`,
      '',
      ...[...byKind].map(([kind, names]) => `**${KIND_LABEL[kind as keyof typeof KIND_LABEL]}:** ${names.join(' · ')}`),
      '',
      `Your ${info.label} badge is already showing next to your name. Change or hide any of it in the Wardrobe.`,
    ].join('\n'))
    .setFooter({ text: 'Never sold, never tradable, and gone for good after launch.' });
  return { embeds: [e], components: [row(btn(ids.nav(owner, 'c', 'wardrobe'), 'Equip now', MAIN))] };
}
