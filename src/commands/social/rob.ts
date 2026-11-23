import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { robRules } from '../../content/social';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { coins } from '../../lib/format';
import { icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { RobEscrow } from '../../models/RobEscrow';
import { attemptRob, payEscrow } from '../../services/rob';
import { getawayView, gotAwayView } from '../../ui/robViews';

export default defineCommand({
  data: new SlashCommandBuilder().setName('rob').setDescription("Try to steal from someone's wallet. Banks are safe")
    .addUserOption((o) => o.setName('user').setDescription('Who to rob').setRequired(true)),
  category: 'social',
  guildOnly: true,
  blockedInJail: true,
  defer: 'public',
  cooldown: { key: 'rob', seconds: robRules.cooldownMinutes * 60 },
  async execute({ interaction }) {
    const target = interaction.options.getUser('user', true);
    if (target.bot) throw new UserError("Bots don't carry wallets.");
    const robberId = interaction.user.id;
    const outcome = await attemptRob(robberId, target.id);
    const title = `${titleIcon('rob')} Rob`;

    if (outcome.kind === 'padlock') {
      return interaction.editReply({ embeds: [embed('error').setTitle(`${title} › Padlocked`).setDescription(
        `${icon('error')} <@${target.id}>'s wallet had a padlock. It broke, and you paid them a **${coins(outcome.fine)}** fine.`,
      )], allowedMentions: { parse: [] } });
    }
    if (outcome.kind === 'failed') {
      return interaction.editReply({ embeds: [embed('error').setTitle(`${title} › Caught in the act`).setDescription([
        `${icon('error')} <@${target.id}> noticed. You paid them a **${coins(outcome.fine)}** fine.`,
        outcome.jailMinutes ? `You're in jail for ${outcome.jailMinutes} minutes.` : null,
        `-# Your chance was ${Math.round(outcome.chance * 100)}%.`,
      ].filter(Boolean).join('\n'))], allowedMentions: { parse: [] } });
    }

    const view = getawayView(robberId, target.id, outcome.amount, outcome.deadline, outcome.escrowId);
    const message = await interaction.editReply({ ...view, allowedMentions: { users: [target.id] } });
    await RobEscrow.updateOne({ _id: outcome.escrowId }, { $set: { channelId: message.channelId, messageId: message.id } });
    // Pay the robber when the window closes (unless the victim caught them first)
    setTimeout(() => {
      payEscrow(outcome.escrowId)
        .then((paid) => (paid ? interaction.editReply({ ...gotAwayView(robberId, target.id, outcome.amount), allowedMentions: { parse: [] } }) : null))
        .catch((err) => logError('rob getaway', err));
    }, outcome.deadline.getTime() - Date.now() + 500);
  },
});
