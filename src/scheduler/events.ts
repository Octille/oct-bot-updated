import type { Client } from 'discord.js';
import { bosses, goalRules, goalTypes, raidRules } from '../content/events';
import { embed } from '../lib/embeds';
import { coins, num } from '../lib/format';
import { icon, titleIcon } from '../lib/icons';
import { logError, logInfo } from '../lib/logger';
import { getCosmetic } from '../content/cosmetics';
import { itemName } from '../content/items';
import { CommunityGoal, Raid } from '../models/Events';
import { GuildSettings } from '../models/GuildSettings';
import { managerCollectAll } from '../services/business';
import { expireDrops } from '../services/drops';
import { expireRaids, settleGoals, spawnWeekly } from '../services/raids';
import { currentSeason, payoutSeason, rewardFor } from '../services/seasons';
import { expiredDropView } from '../ui/dropViews';
import type { Job } from './index';

async function post(client: Client<true>, channelId: string | null | undefined, text: string, title: string): Promise<void> {
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isSendable()) await channel.send({ embeds: [embed('events').setTitle(title).setDescription(text)], allowedMentions: { parse: [] } });
  } catch (err) {
    const code = (err as { code?: number }).code;
    if (code !== 50001 && code !== 50013 && code !== 10003) logError('event post', err);
  }
}

/** Hourly: this week's raids and goals, manager auto-collect, and paying out finished seasons. */
export const eventsHourlyJob: Job = {
  name: 'events-hourly',
  schedule: '1 * * * *',
  async run(client) {
    const guilds = await GuildSettings.find({ 'events.channelId': { $ne: null } }, { _id: 1, events: 1 }, { lean: true });
    for (const g of guilds) {
      if (!client.guilds.cache.has(String(g._id))) continue;
      const created = await spawnWeekly(String(g._id), g.events!.channelId!);
      const raid = created.includes('raid') ? await Raid.findOne({ guildId: g._id, status: 'active' }, null, { lean: true }) : null;
      const goal = created.includes('goal') ? await CommunityGoal.findOne({ guildId: g._id, status: 'active' }, null, { lean: true }) : null;
      if (raid) {
        const boss = bosses.find((b) => b.id === raid.bossId)!;
        await post(client, g.events!.channelId, `${boss.emoji} **${boss.name}** has appeared! ${boss.line}\nIt has **${num(raid.maxHp)} HP** and escapes <t:${Math.floor(raid.endsAt.getTime() / 1000)}:R>. Fight it with \`/raid\`.`, `${titleIcon('raid')} A boss appears`);
      }
      if (goal) {
        const type = goalTypes.find((t) => t.metric === goal.metric)!;
        await post(client, g.events!.channelId, `This week: **${type.label.replace('{n}', num(goal.target))}**. Everyone who helps ${goalRules.minContribution}+ times gets ${coins(goalRules.reward.coins)} and a ${itemName(goalRules.reward.crate)}. Progress: \`/raid\`.`, `${titleIcon('goal')} Community goal`);
      }
    }
    const collected = await managerCollectAll();
    if (collected) logInfo('business', `Managers collected for ${collected} business(es)`);

    // Seasons that have ended: pay once, then tell the winners
    const season = currentSeason();
    for (let s = Math.max(1, season - 2); s < season; s++) {
      const result = await payoutSeason(s);
      if (!result) continue;
      logInfo('seasons', `Season ${s} paid out to ${result.winners.length} player(s)`);
      for (const w of result.winners) {
        const r = rewardFor(w.place)!;
        try {
          const user = await client.users.fetch(w.userId);
          await user.send({ embeds: [embed('success').setTitle(`${titleIcon('season')} Season ${s} is over`).setDescription(`${icon('success')} You finished **#${w.place}** with ${num(w.points)} points! You got ${coins(r.coins)}, a ${itemName(r.crate)} and the **${getCosmetic(r.badge)?.name}** badge (equip it in the Wardrobe).`)] });
        } catch { /* DMs closed */ }
      }
    }
  },
};

/** Every minute: expire raids, settle goals, expire drops, and post results once. */
export const eventsMinuteJob: Job = {
  name: 'events-minute',
  schedule: '* * * * *',
  async run(client) {
    await expireRaids();
    await settleGoals();
    for (const d of await expireDrops()) {
      if (!d.messageId) continue;
      try {
        const channel = await client.channels.fetch(d.channelId);
        if (channel?.isTextBased()) await (await channel.messages.fetch(d.messageId)).edit(expiredDropView(d));
      } catch { /* deleted */ }
    }
    // Results: claim the announcement first so it's posted once
    for (const raid of await Raid.find({ status: { $ne: 'active' }, announced: false }, null, { lean: true })) {
      const claimed = await Raid.updateOne({ _id: raid._id, announced: false }, { $set: { announced: true } });
      if (!claimed.modifiedCount) continue;
      const boss = bosses.find((b) => b.id === raid.bossId)!;
      const dmg = Object.entries((raid.damage ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]);
      const text = raid.status === 'defeated'
        ? `${icon('success')} **${boss.name}** is down! ${dmg.length} fighter${dmg.length === 1 ? '' : 's'} got ${coins(raidRules.reward.base)}+ and a crate. MVP: <@${dmg[0]?.[0]}> with ${num(dmg[0]?.[1] ?? 0)} damage.`
        : `${icon('warning')} **${boss.name}** got away with ${num(raid.hp)} HP left. Next boss on Monday.`;
      await post(client, raid.channelId, text, `${titleIcon('raid')} Raid over`);
    }
    for (const goal of await CommunityGoal.find({ status: { $ne: 'active' }, announced: false }, null, { lean: true })) {
      const claimed = await CommunityGoal.updateOne({ _id: goal._id, announced: false }, { $set: { announced: true } });
      if (!claimed.modifiedCount) continue;
      const type = goalTypes.find((t) => t.metric === goal.metric)!;
      const text = goal.status === 'done'
        ? `${icon('success')} The server did it: **${type.label.replace('{n}', num(goal.target))}**! Everyone who helped ${goalRules.minContribution}+ times got ${coins(goalRules.reward.coins)} and a ${itemName(goalRules.reward.crate)}.`
        : `${icon('warning')} The goal wasn't reached (${num(goal.progress)} / ${num(goal.target)}). New one on Monday.`;
      await post(client, goal.channelId, text, `${titleIcon('goal')} Community goal`);
    }
  },
};
