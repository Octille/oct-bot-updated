import { coins } from '../lib/format';
import { embed } from '../lib/embeds';
import { buttonIcon, icon, titleIcon } from '../lib/icons';
import { ANYONE, makeId } from '../lib/customId';
import { itemName } from '../content/items';
import { btn, MAIN, row, type Payload } from './kit';

const prize = (d: { coins: number; item?: string | null }) => (d.item ? `a **${itemName(d.item)}**` : `**${coins(d.coins)}**`);

export function dropView(d: { _id: unknown; coins: number; item?: string | null; expiresAt: Date }): Payload {
  return {
    embeds: [embed('events').setTitle(`${titleIcon('drop')} A drop!`).setDescription(`Something fell from the sky: ${prize(d)}. First to grab it keeps it.\n-# Gone <t:${Math.floor(d.expiresAt.getTime() / 1000)}:R>.`)],
    components: [row(btn(makeId('dg', ANYONE, String(d._id)), 'Grab it', MAIN, { emoji: buttonIcon('drop') }))],
  };
}

export function droppedView(d: { coins: number; item?: string | null }, userId: string): Payload {
  return { embeds: [embed('success').setTitle(`${titleIcon('drop')} Grabbed`).setDescription(`${icon('success')} <@${userId}> grabbed ${prize(d)}.`)], components: [] };
}

export function expiredDropView(d: { coins: number; item?: string | null }): Payload {
  return { embeds: [embed('warning').setTitle(`${titleIcon('drop')} Gone`).setDescription(`${icon('warning')} Nobody grabbed ${prize(d)} in time.`)], components: [] };
}
