import { MessageFlags } from 'discord.js';
import { defineComponent } from '../framework/types';
import { icon } from '../lib/icons';
import { catchRobber } from '../services/rob';
import { caughtView } from '../ui/robViews';

/** "Catch them!" — `rc:<victimId>:<escrowId>`. Only the victim can press it (owner check in the router). */
export const catchHandler = defineComponent({
  prefix: 'rc',
  async execute({ interaction, id }) {
    if (!interaction.isButton()) return;
    const result = await catchRobber(id.args[0]!, interaction.user.id, new Date(interaction.createdTimestamp));
    if (!result) {
      await interaction.reply({ content: `${icon('warning')} Too late, they got away.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.update({ ...caughtView(result.robberId, result.victimId, result.amount, result.fine), allowedMentions: { parse: [] } });
  },
});
