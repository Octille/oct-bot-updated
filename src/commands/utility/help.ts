import { SlashCommandBuilder } from 'discord.js';
import { defineCommand, type SlashCommand } from '../../framework/types';
import { embed, type Category } from '../../lib/embeds';
import { testNotice } from '../../lib/testMode';
// Circular on purpose (this file is in that list); `commands` is only read when /help runs.
import * as registry from '../index';

const SECTIONS: { category: Category; title: string }[] = [
  { category: 'economy', title: '💰 Economy' },
  { category: 'gambling', title: '🎲 Gambling' },
  { category: 'social', title: '🤝 Social' },
  { category: 'levels', title: '⭐ Levels' },
  { category: 'events', title: '🎉 Events' },
  { category: 'music', title: '🎶 Music' },
  { category: 'moderation', title: '🛡️ Moderation' },
  { category: 'utility', title: '🧰 Utility' },
];

function line(command: SlashCommand): string {
  const json = command.data.toJSON();
  return `\`/${json.name}\` — ${json.description}`;
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('help').setDescription('Every command, by category'),
  category: 'utility',
  async execute({ interaction }) {
    const all = registry.commands;
    const e = embed('utility').setTitle('📖 OctBot commands');
    const notice = testNotice();
    if (notice) e.setDescription(notice);
    for (const { category, title } of SECTIONS) {
      const lines = all.filter((c) => c.category === category).map(line);
      if (!lines.length) continue;
      // Embed fields max out at 1024 characters, so long sections are split
      let chunk: string[] = [];
      let part = 0;
      for (const l of lines) {
        if ([...chunk, l].join('\n').length > 1024) {
          e.addFields({ name: part++ ? `${title} (cont.)` : title, value: chunk.join('\n') });
          chunk = [];
        }
        chunk.push(l);
      }
      if (chunk.length) e.addFields({ name: part ? `${title} (cont.)` : title, value: chunk.join('\n') });
    }
    await interaction.reply({ embeds: [e] });
  },
});
