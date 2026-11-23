import { defineComponent } from '../framework/types';
import { icon } from '../lib/icons';
import { setReminders } from '../services/reminders';

/** "Turn off reminders" in a reminder DM: `rm:<userId>:off`. */
export const remindersHandler = defineComponent({
  prefix: 'rm',
  async execute({ interaction }) {
    if (!interaction.isButton()) return;
    await setReminders(interaction.user.id, false);
    await interaction.update({ content: `${icon('success')} Reminders are off. Turn them back on in \`/quests\`.`, embeds: [], components: [] });
  },
});
