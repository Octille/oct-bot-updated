import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { titleIcon } from '../../lib/icons';
import { num, relative } from '../../lib/format';

export default defineCommand({
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Details about this server'),
  category: 'utility',
  guildOnly: true,
  async execute({ interaction }) {
    const guild = interaction.guild!;
    const channels = guild.channels.cache;
    const count = (...types: ChannelType[]) => channels.filter((c) => types.includes(c.type)).size;
    const e = embed('utility').setTitle(`${titleIcon('info')} ${guild.name}`).addFields(
      { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
      { name: 'Created', value: relative(guild.createdAt), inline: true },
      { name: 'Members', value: num(guild.memberCount), inline: true },
      { name: 'Channels', value: `${count(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)} text · ${count(ChannelType.GuildVoice, ChannelType.GuildStageVoice)} voice`, inline: true },
      { name: 'Roles', value: num(guild.roles.cache.size - 1), inline: true },
      { name: 'Emojis', value: num(guild.emojis.cache.size), inline: true },
      { name: 'Boosts', value: `${num(guild.premiumSubscriptionCount ?? 0)} (level ${guild.premiumTier})`, inline: true },
      { name: 'ID', value: `\`${guild.id}\``, inline: true },
    );
    if (guild.description) e.setDescription(guild.description);
    const iconUrl = guild.iconURL({ size: 256 });
    if (iconUrl) e.setThumbnail(iconUrl);
    const banner = guild.bannerURL({ size: 1024 });
    if (banner) e.setImage(banner);
    return interaction.reply({ embeds: [e], allowedMentions: { parse: [] } });
  },
});
