import { MessageFlags } from 'discord.js';
import { defineComponent } from '../framework/types';
import { icon } from '../lib/icons';
import { UserError } from '../lib/errors';
import { grabDrop } from '../services/drops';
import { droppedView } from '../ui/dropViews';

/** "Grab it" on a chat drop: `dg:*:<dropId>`. Anyone can press it; the first valid grab wins. */
export const dropHandler = defineComponent({
  prefix: 'dg',
  async execute({ interaction, id }) {
    if (!interaction.isButton()) return;
    try {
      const drop = await grabDrop(id.args[0]!, interaction.user.id, new Date(interaction.createdTimestamp));
      await interaction.update({ ...droppedView(drop, interaction.user.id), allowedMentions: { parse: [] } });
    } catch (err) {
      if (!(err instanceof UserError)) throw err;
      await interaction.reply({ content: `${icon('error')} ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  },
});
