import { MessageFlags, type InteractionReplyOptions, type RepliableInteraction } from 'discord.js';
import { errorEmbed } from '../lib/embeds';

/** Replies whether or not the interaction was already deferred/replied. */
export async function respond(interaction: RepliableInteraction, payload: InteractionReplyOptions): Promise<void> {
  if (interaction.deferred && !interaction.replied) {
    const { flags: _flags, ...rest } = payload;
    await interaction.editReply(rest);
  } else if (interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}

/** An ephemeral error reply (or an edit of the deferred reply). */
export async function respondError(interaction: RepliableInteraction, message: string): Promise<void> {
  await respond(interaction, { embeds: [errorEmbed(message)], flags: MessageFlags.Ephemeral }).catch(() => undefined);
}
