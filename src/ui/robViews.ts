import { coins } from '../lib/format';
import { embed } from '../lib/embeds';
import { icon, titleIcon } from '../lib/icons';
import { robRules } from '../content/social';
import { makeId } from '../lib/customId';
import { btn, MAIN, row, type Payload } from './kit';

/** The getaway in progress: the victim gets a Catch them! button (persistent, so it survives a restart). */
export function getawayView(robberId: string, victimId: string, amount: number, deadline: Date, escrowId: string): Payload & { content: string } {
  return {
    content: `<@${victimId}>`,
    embeds: [embed('economy').setTitle(`${titleIcon('rob')} Rob › Getaway`).setDescription([
      `<@${robberId}> grabbed **${coins(amount)}** from <@${victimId}>'s wallet and is running for it!`,
      `<@${victimId}>, catch them before <t:${Math.floor(deadline.getTime() / 1000)}:R> to get it back. They'll go to jail and pay you a fine.`,
    ].join('\n'))],
    components: [row(btn(makeId('rc', victimId, escrowId), 'Catch them!', MAIN))],
  };
}

export function gotAwayView(robberId: string, victimId: string, amount: number): Payload & { content: string } {
  return {
    content: '',
    embeds: [embed('success').setTitle(`${titleIcon('rob')} Rob › Got away`).setDescription(`${icon('success')} <@${robberId}> got away with **${coins(amount)}** from <@${victimId}>.`)],
    components: [],
  };
}

export function caughtView(robberId: string, victimId: string, amount: number, fine: number): Payload & { content: string } {
  return {
    content: '',
    embeds: [embed('error').setTitle(`${titleIcon('rob')} Rob › Caught`).setDescription([
      `${icon('error')} <@${victimId}> caught <@${robberId}>!`,
      `The **${coins(amount)}** went back${fine ? `, plus a **${coins(fine)}** fine` : ''}. <@${robberId}> is in jail for ${robRules.caughtJailMinutes} minutes.`,
    ].join('\n'))],
    components: [],
  };
}
