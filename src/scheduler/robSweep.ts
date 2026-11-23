import type { Client } from 'discord.js';
import { logError } from '../lib/logger';
import { sweepEscrows } from '../services/rob';
import { gotAwayView } from '../ui/robViews';
import type { Job } from './index';

/** Pays out getaways whose timer was lost (restart) and updates their messages. */
export async function runRobSweep(client: Client<true>): Promise<void> {
  for (const doc of await sweepEscrows()) {
    if (!doc.channelId || !doc.messageId) continue;
    try {
      const channel = await client.channels.fetch(doc.channelId);
      if (channel?.isTextBased()) {
        const message = await channel.messages.fetch(doc.messageId);
        await message.edit({ ...gotAwayView(doc.robberId, doc.victimId, doc.amount), allowedMentions: { parse: [] } });
      }
    } catch (err) {
      logError('rob sweep message', err);
    }
  }
}

export const robSweepJob: Job = { name: 'rob-sweep', schedule: '* * * * *', run: runRobSweep };
