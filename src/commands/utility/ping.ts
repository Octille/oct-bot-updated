import { SlashCommandBuilder } from 'discord.js';
import mongoose from 'mongoose';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';

export default defineCommand({
  data: new SlashCommandBuilder().setName('ping').setDescription("Check the bot's latency"),
  category: 'utility',
  async execute({ interaction, client }) {
    const started = Date.now();
    await mongoose.connection.db?.admin().ping();
    const dbMs = Date.now() - started;
    const roundTrip = Date.now() - interaction.createdTimestamp;

    await interaction.reply({
      embeds: [
        embed('utility')
          .setTitle('🏓 Pong!')
          .addFields(
            { name: 'Round trip', value: `${roundTrip}ms`, inline: true },
            { name: 'Gateway', value: `${Math.round(client.ws.ping)}ms`, inline: true },
            { name: 'Database', value: `${dbMs}ms`, inline: true },
          ),
      ],
    });
  },
});
