import { icon } from '../../lib/icons';
import { embed, type Category } from '../../lib/embeds';
import { testNotice } from '../../lib/testMode';
import { getCommandList } from '../../framework/commandList';
import { back, ids, row, select } from '../kit';
import type { ScreenModule } from './types';

const SECTIONS: { category: Category; title: string; blurb: string }[] = [
  { category: 'economy', title: 'Economy', blurb: 'Earn, collect, upgrade and trade Octs' },
  { category: 'gambling', title: 'Gambling', blurb: 'Games of chance with in-game Octs' },
  { category: 'social', title: 'Social', blurb: 'Rob, duel and trade with others' },
  { category: 'levels', title: 'Levels', blurb: 'Ranks, prestige and achievements' },
  { category: 'events', title: 'Events', blurb: 'Raids, drops and community goals' },
  { category: 'music', title: 'Music', blurb: 'Play music in voice channels' },
  { category: 'moderation', title: 'Moderation', blurb: 'Keep your server tidy' },
  { category: 'utility', title: 'Utility', blurb: 'Handy everyday commands' },
];

/** Example usages for commands with options. */
const EXAMPLES: Record<string, string> = {
  bank: '/bank deposit amount:half',
  sell: '/sell bulk what:All fish',
  buy: '/buy item:Luck Potion amount:2',
  use: '/use item:Common Crate',
  iteminfo: '/iteminfo item:Octite',
  balance: '/balance user:@friend',
  inventory: '/inventory user:@friend',
  fishdex: '/fishdex user:@friend',
};

function commandsIn(category: Category) {
  return getCommandList().filter((c) => c.category === category).map((c) => c.data.toJSON());
}

export const help: ScreenModule = {
  render(path, ctx) {
    const sections = SECTIONS.filter((s) => commandsIn(s.category).length);
    const picker = select(ids.pick(ctx.owner, ctx.origin, 'help'), 'Pick a category', sections.map((s) => ({
      label: s.title, value: s.category, description: s.blurb, default: s.category === path[1],
    })));
    const section = sections.find((s) => s.category === path[1]);

    if (!section) {
      return {
        embeds: [embed('utility').setTitle(`${icon('help')} Help`).setDescription([
          testNotice(),
          'New here? Run **/menu** — it shows what you can do right now.',
          '',
          ...sections.map((s) => `**${s.title}** — ${s.blurb} (${commandsIn(s.category).length} commands)`),
        ].filter((l) => l !== null).join('\n')).setFooter({ text: 'Tip: pick a category to see its commands.' })],
        components: [picker, row(back(ctx, null))],
      };
    }

    const lines = commandsIn(section.category).map((c) => `\`/${c.name}\` — ${c.description}${EXAMPLES[c.name] ? `\n-# e.g. \`${EXAMPLES[c.name]}\`` : ''}`);
    return {
      embeds: [embed('utility').setTitle(`${icon('help')} Help › ${section.title}`).setDescription(lines.join('\n').slice(0, 4000))],
      components: [picker, row(back(ctx, 'help'))],
    };
  },
};
