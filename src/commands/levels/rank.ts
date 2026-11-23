import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { rankCard } from '../../lib/cards';
import { person } from '../../lib/people';
import { cardStyle, prestigeTag } from '../../lib/theme';
import { User } from '../../models/User';
import { memberLevel } from '../../services/levels';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Your server level and rank, as a card')
    .addUserOption((o) => o.setName('user').setDescription('Someone else to check')),
  category: 'levels',
  guildOnly: true,
  defer: 'public',
  async execute({ interaction }) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    if (target.bot) return interaction.editReply({ content: "Bots don't earn XP." });
    const member = await interaction.guild!.members.fetch(target.id).catch(() => null);
    const [lvl, profile] = await Promise.all([
      memberLevel(interaction.guildId!, target.id),
      User.findById(target.id, { cosmetics: 1, account: 1 }, { lean: true }),
    ]);
    const png = await rankCard({
      person: person(target, member, profile),
      style: cardStyle(profile ?? {}),
      level: lvl.level,
      into: lvl.into,
      needed: lvl.needed,
      rank: lvl.rank,
      members: lvl.members,
      accountLevel: profile?.account?.level ?? 0,
      prestige: prestigeTag(profile?.account?.prestige ?? 0),
    });
    const note = lvl.xp === 0 ? `${target.id === interaction.user.id ? 'You haven\'t' : `${person(target, member, null).name} hasn't`} earned any XP here yet. Chat or hang out in voice to level up.` : undefined;
    return interaction.editReply({ content: note, files: [new AttachmentBuilder(png, { name: 'rank.png' })], allowedMentions: { parse: [] } });
  },
});

