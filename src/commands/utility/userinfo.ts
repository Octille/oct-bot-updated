import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { titleIcon } from '../../lib/icons';
import { relative } from '../../lib/format';

export default defineCommand({
  data: new SlashCommandBuilder().setName('userinfo').setDescription('Account and server details for a member')
    .addUserOption((o) => o.setName('user').setDescription('Who (default: you)')),
  category: 'utility',
  async execute({ interaction }) {
    const user = await (interaction.options.getUser('user') ?? interaction.user).fetch().catch(() => interaction.options.getUser('user') ?? interaction.user);
    const member = interaction.inCachedGuild() ? interaction.options.getMember('user') ?? (user.id === interaction.user.id ? interaction.member : null) : null;
    const roles = member ? [...member.roles.cache.values()].filter((r) => r.id !== interaction.guildId).sort((a, b) => b.position - a.position) : [];
    const shown = roles.slice(0, 15).map((r) => `${r}`).join(' ');
    const e = embed('utility').setTitle(`${titleIcon('info')} ${user.displayName}`).setThumbnail(user.displayAvatarURL({ size: 256 })).addFields(
      { name: 'Username', value: `${user.tag}${user.bot ? ' (bot)' : ''}`, inline: true },
      { name: 'ID', value: `\`${user.id}\``, inline: true },
      { name: 'Account created', value: relative(user.createdAt), inline: true },
    );
    if (member) {
      e.addFields(
        { name: 'Joined this server', value: member.joinedAt ? relative(member.joinedAt) : 'Unknown', inline: true },
        { name: 'Boosting', value: member.premiumSince ? `Since ${relative(member.premiumSince)}` : 'No', inline: true },
        { name: 'Nickname', value: member.nickname ?? 'None', inline: true },
        { name: `Roles (${roles.length})`, value: (shown + (roles.length > 15 ? ` and ${roles.length - 15} more` : '')) || 'None' },
      );
    }
    if (user.bannerURL()) e.setImage(user.bannerURL({ size: 1024 })!);
    return interaction.reply({ embeds: [e], allowedMentions: { parse: [] } });
  },
});
