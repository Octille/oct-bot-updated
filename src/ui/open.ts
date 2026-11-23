import type { ChatInputCommandInteraction } from 'discord.js';
import type { Profile } from '../services/economy';
import { render } from './screens';

/** Replies to a slash command with a menu screen (opened "from a command", so the root Back is Menu). */
export async function replyWithScreen(interaction: ChatInputCommandInteraction, path: string, profile: Profile, note?: string): Promise<void> {
  const payload = render(path, {
    owner: interaction.user.id,
    origin: 'c',
    profile,
    userName: interaction.user.globalName ?? interaction.user.username,
    note,
  });
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.reply(payload);
}
