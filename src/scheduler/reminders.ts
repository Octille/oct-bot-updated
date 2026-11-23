import type { Client } from 'discord.js';
import { embed } from '../lib/embeds';
import { titleIcon } from '../lib/icons';
import { makeId } from '../lib/customId';
import { logError, logInfo } from '../lib/logger';
import { claimDueReminders, setReminders } from '../services/reminders';
import { btn, ids, MAIN, NAV, row } from '../ui/kit';
import type { Job } from './index';

/** Hourly: DM players who asked for reminders when their daily/weekly is waiting. */
export const remindersJob: Job = {
  name: 'dm-reminders',
  schedule: '5 * * * *',
  async run(client: Client<true>) {
    const due = await claimDueReminders();
    let sent = 0;
    for (const r of due) {
      try {
        const user = await client.users.fetch(r.userId);
        const daily = r.kind === 'daily';
        await user.send({
          embeds: [embed('economy').setTitle(`${titleIcon('reminder')} ${daily ? 'Your daily is ready' : 'Your weekly is ready'}`).setDescription(daily
            ? (r.streak ? `You're on a **${r.streak}-day streak**. Claim before 00:00 UTC to keep it going.` : 'Claim it before 00:00 UTC.')
            : 'Your weekly reward is waiting.')],
          components: [row(
            btn(ids.go(r.userId, daily ? 'daily' : 'weekly'), daily ? 'Claim daily' : 'Claim weekly', MAIN),
            btn(makeId('rm', r.userId, 'off'), 'Turn off reminders', NAV),
          )],
        });
        sent++;
      } catch (err) {
        // DMs closed (50007): stop trying
        if ((err as { code?: number }).code === 50007) await setReminders(r.userId, false);
        else logError('dm reminder', err);
      }
    }
    if (due.length) logInfo('reminders', `Sent ${sent} of ${due.length} reminder(s)`);
  },
};
