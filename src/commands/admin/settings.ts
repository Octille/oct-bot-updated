import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { UserError } from '../../lib/errors';
import { getGuildSettings } from '../../models/GuildSettings';
import { SECTIONS, isSection, settingsScreen, type Section } from '../../ui/settings';

/** Server settings dashboard (admins): one private screen per section, changed with menus and buttons. */
export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Server settings dashboard (admins)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('section').setDescription('Jump straight to a section')
      .addChoices(...(Object.keys(SECTIONS) as Section[]).map((k) => ({ name: SECTIONS[k].title, value: k })))),
  category: 'utility',
  guildOnly: true,
  defer: 'ephemeral',
  async execute({ interaction }) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) throw new UserError('You need the Manage Server permission.');
    const section = interaction.options.getString('section') ?? undefined;
    const settings = await getGuildSettings(interaction.guildId!);
    return interaction.editReply({ ...settingsScreen(isSection(section) ? section : 'home', settings!, interaction.user.id), allowedMentions: { parse: [] } });
  },
});
