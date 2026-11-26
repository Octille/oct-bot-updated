import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { titleIcon } from '../../lib/icons';

export default defineCommand({
  data: new SlashCommandBuilder().setName('avatar').setDescription("Show someone's avatar in full size")
    .addUserOption((o) => o.setName('user').setDescription('Whose (default: you)')),
  category: 'utility',
  async execute({ interaction }) {
    const user = interaction.options.getUser('user') ?? interaction.user;
    const member = interaction.inCachedGuild() ? interaction.options.getMember('user') ?? (user.id === interaction.user.id ? interaction.member : null) : null;
    const main = user.displayAvatarURL({ size: 1024 });
    const server = member?.avatar ? member.displayAvatarURL({ size: 1024 }) : null;
    const links = (url: string) => ['png', 'webp', ...(url.includes('/a_') ? ['gif'] : [])].map((f) => `[${f.toUpperCase()}](${url.replace(/\.(webp|png|gif)/, `.${f}`)})`).join(' · ');
    const e = embed('utility').setTitle(`${titleIcon('avatar')} ${user.displayName}`).setImage(server ?? main)
      .setDescription([server ? `Server avatar: ${links(server)}` : null, `${server ? 'Main avatar' : 'Download'}: ${links(main)}`].filter(Boolean).join('\n'));
    if (server) e.setThumbnail(main);
    return interaction.reply({ embeds: [e] });
  },
});
