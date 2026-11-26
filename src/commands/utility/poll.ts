import { SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { UserError } from '../../lib/errors';

export const pollRules = { maxAnswers: 10, maxAnswerLength: 55, maxQuestion: 300, maxHours: 768, defaultHours: 24 } as const;

/** "Pizza | Tacos | Sushi" → trimmed, non-empty, unique answers. */
export function parseAnswers(input: string): string[] {
  return [...new Set(input.split(/[|\n]/).map((a) => a.trim()).filter(Boolean))];
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('poll').setDescription('Start a Discord poll')
    .addStringOption((o) => o.setName('question').setDescription('What to ask').setRequired(true).setMaxLength(pollRules.maxQuestion))
    .addStringOption((o) => o.setName('answers').setDescription('Answers separated by | e.g. "Pizza | Tacos | Sushi"').setRequired(true).setMaxLength(600))
    .addIntegerOption((o) => o.setName('hours').setDescription(`How long it runs (1–${pollRules.maxHours}, default ${pollRules.defaultHours})`).setMinValue(1).setMaxValue(pollRules.maxHours))
    .addBooleanOption((o) => o.setName('multiple').setDescription('Allow picking more than one answer')),
  category: 'utility',
  guildOnly: true,
  async execute({ interaction }) {
    const answers = parseAnswers(interaction.options.getString('answers', true));
    if (answers.length < 2) throw new UserError('Give at least 2 answers, separated by `|`.');
    if (answers.length > pollRules.maxAnswers) throw new UserError(`At most ${pollRules.maxAnswers} answers.`);
    const long = answers.find((a) => a.length > pollRules.maxAnswerLength);
    if (long) throw new UserError(`Answers can be at most ${pollRules.maxAnswerLength} characters ("${long.slice(0, 20)}…" is too long).`);
    return interaction.reply({
      poll: {
        question: { text: interaction.options.getString('question', true) },
        answers: answers.map((text) => ({ text })),
        duration: interaction.options.getInteger('hours') ?? pollRules.defaultHours,
        allowMultiselect: interaction.options.getBoolean('multiple') ?? false,
      },
      allowedMentions: { parse: [] },
    });
  },
});
