import { ActionRowBuilder, SlashCommandBuilder, StringSelectMenuBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { collect } from '../../lib/collect';
import { makeId } from '../../lib/customId';
import { logError } from '../../lib/logger';
import { jobs, getJob, jobRanks, nextRank, rankFor } from '../../content/jobs';
import { shiftsIn } from '../../game/jobs';
import { apply, getProfile, type Profile } from '../../services/economy';
import { incomeMultiplier } from '../../services/progression';

function jobEmbed(profile: Profile, note?: string) {
  const level = profile.account?.level ?? 0;
  const current = getJob(profile.job?.current);
  const lines = jobs.map((j) => {
    const shifts = shiftsIn(profile.job?.shifts, j.id);
    const rank = rankFor(shifts);
    const pay = Math.round(j.basePay * rank.mult * incomeMultiplier(profile));
    const status = j.level > level ? `🔒 Level ${j.level}` : `${rank.title} • ${num(shifts)} shifts • ~${coins(pay)}/shift`;
    return `${j.id === current.id ? '▶️' : '▫️'} ${j.emoji} **${j.name}** — ${status}`;
  });
  const shifts = shiftsIn(profile.job?.shifts, current.id);
  const next = nextRank(shifts);
  return embed('economy')
    .setTitle('💼 Jobs')
    .setDescription([note, ...lines].filter(Boolean).join('\n'))
    .addFields({
      name: 'Promotions',
      value: `${jobRanks.map((r) => `${r.title} (${r.shifts}+ shifts, ${r.mult}×)`).join(' → ')}\n` +
        (next ? `You need **${next.shifts - shifts}** more shift(s) as a ${current.name} for ${next.title}.` : `You're a ${current.name} legend.`),
    })
    .setFooter({ text: 'Rank is kept per job, so switching back never loses progress.' });
}

function jobMenu(profile: Profile, ownerId: string) {
  const level = profile.account?.level ?? 0;
  const menu = new StringSelectMenuBuilder()
    .setCustomId(makeId('~job', ownerId))
    .setPlaceholder('Switch job...')
    .addOptions(jobs.filter((j) => j.level <= level).map((j) => ({
      label: j.name,
      value: j.id,
      emoji: j.emoji,
      description: `Base pay ${coins(j.basePay)}`,
      default: j.id === getJob(profile.job?.current).id,
    })));
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('job').setDescription('See jobs and switch to a new one'),
  category: 'economy',
  async execute({ interaction, profile }) {
    const userId = interaction.user.id;
    const response = await interaction.reply({ embeds: [jobEmbed(profile)], components: jobMenu(profile, userId), withResponse: true });
    const message = response.resource?.message;
    if (!message) return;

    collect(message, { time: 60_000 }).on('collect', (i) => {
      (async () => {
        if (!i.isStringSelectMenu()) return;
        const fresh = await getProfile(userId);
        const job = getJob(i.values[0]);
        if (job.level > (fresh.account?.level ?? 0)) {
          return i.update({ embeds: [jobEmbed(fresh, `🔒 You need level ${job.level} for ${job.name}.`)] });
        }
        const updated = await apply(userId, { set: { 'job.current': job.id } }, { source: 'job.switch' });
        await i.update({ embeds: [jobEmbed(updated, `${job.emoji} You're now working as a **${job.name}**. \`/work\` to start a shift.`)], components: jobMenu(updated, userId) });
      })().catch((err) => logError('job', err));
    });
  },
});
