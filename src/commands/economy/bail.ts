import { icon } from '../../lib/icons';
import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { coins } from '../../lib/format';
import { payBail } from '../../services/jail';
import { getProfile } from '../../services/economy';
import { replyWithScreen } from '../../ui/open';

export default defineCommand({
  data: new SlashCommandBuilder().setName('bail').setDescription('Pay to get out of jail early'),
  category: 'economy',
  async execute({ interaction }) {
    const cost = await payBail(interaction.user.id);
    await replyWithScreen(interaction, 'jail', await getProfile(interaction.user.id), `${icon('success')} You paid ${coins(cost)} bail and walked out. Try not to come back.`);
  },
});
