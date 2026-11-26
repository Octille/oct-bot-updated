import { MessageFlags, type GuildMember } from 'discord.js';
import { defineComponent } from '../framework/types';
import { isTestBot } from '../config/env';
import { UserError } from '../lib/errors';
import { icon } from '../lib/icons';
import { availableStations, radioConfig } from '../music/radio';
import { playStation } from '../music/radioPlay';

/** The /radio station picker: `rd:<owner>`. */
export const radioHandler = defineComponent({
  prefix: 'rd',
  async execute({ interaction }) {
    if (!interaction.isStringSelectMenu() || !interaction.inCachedGuild()) return;
    const config = radioConfig();
    const station = availableStations(config, isTestBot()).find((s) => s.id === interaction.values[0]);
    if (!station) throw new UserError('That station was removed.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await playStation(interaction.member as GuildMember, interaction.channelId, station, config);
    await interaction.editReply(`${icon('success')} Tuning in to **${station.name}**.`);
  },
});
