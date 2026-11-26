import { ActionRowBuilder, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder, type GuildMember, type MessageActionRowComponentBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { isTestBot } from '../../config/env';
import { makeId } from '../../lib/customId';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { icon, titleIcon } from '../../lib/icons';
import { availableStations, radioConfig, type Station } from '../../music/radio';
import { playStation } from '../../music/radioPlay';

const label = (s: Station, genres: Record<string, string>) => `${genres[s.genre] ?? s.genre} · ${s.name}${s.permission ? '' : ' (test only)'}`;

/** The station picker: genres in config order, at most 25 stations. */
export function radioPicker(owner: string) {
  const config = radioConfig();
  const order = Object.keys(config.genres);
  const stations = availableStations(config, isTestBot()).sort((a, b) => order.indexOf(a.genre) - order.indexOf(b.genre)).slice(0, 25);
  if (!stations.length) throw new UserError('No radio stations are set up yet.');
  const menu = new StringSelectMenuBuilder().setCustomId(makeId('rd', owner)).setPlaceholder('Pick a station').addOptions(stations.map((s) => ({
    label: s.name.slice(0, 100), value: s.id, description: `${config.genres[s.genre] ?? s.genre}${s.permission ? '' : ' · test only'}`.slice(0, 100),
  })));
  return {
    embeds: [embed('music').setTitle(`${titleIcon('music')} Radio`).setDescription('Live internet radio, 24/7. Pick a station; it replaces what\'s playing and clears the queue.')],
    components: [new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(menu)],
  };
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('radio').setDescription('Play a live internet radio station (lofi, chill, hip-hop, pop, rock, EDM…)')
    .addStringOption((o) => o.setName('station').setDescription('Station or genre (leave empty to browse)').setAutocomplete(true)),
  category: 'music',
  guildOnly: true,
  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const config = radioConfig();
    await interaction.respond(availableStations(config, isTestBot())
      .filter((s) => label(s, config.genres).toLowerCase().includes(typed))
      .slice(0, 25).map((s) => ({ name: label(s, config.genres).slice(0, 100), value: s.id })));
  },
  async execute({ interaction }) {
    const id = interaction.options.getString('station');
    if (!id) return interaction.reply({ ...radioPicker(interaction.user.id), flags: MessageFlags.Ephemeral });
    const config = radioConfig();
    const station = availableStations(config, isTestBot()).find((s) => s.id === id || s.name.toLowerCase() === id.toLowerCase());
    if (!station) throw new UserError('No station by that name. Leave the option empty to browse.');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await playStation(interaction.member as GuildMember, interaction.channelId, station, config);
    return interaction.editReply(`${icon('success')} Tuning in to **${station.name}**.`);
  },
});
