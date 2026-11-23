import { ActionRowBuilder, SlashCommandBuilder, StringSelectMenuBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { collect } from '../../lib/collect';
import { makeId, parseId } from '../../lib/customId';
import { logError } from '../../lib/logger';
import { themeColor, titled } from '../../lib/theme';
import { cosmetics, getCosmetic } from '../../content/cosmetics';
import { apply, getProfile, type Profile } from '../../services/economy';

function render(profile: Profile, username: string, userId: string, note?: string) {
  const owned = (profile.cosmetics?.owned ?? []).map(getCosmetic).filter((c) => !!c);
  const titles = owned.filter((c) => c.kind === 'title');
  const themes = owned.filter((c) => c.kind === 'theme');
  const e = embed('economy')
    .setTitle(`🎨 ${titled(username, profile)}`)
    .setDescription([note, owned.length ? 'Pick what to show off below.' : 'You don\'t own any cosmetics yet — check `/shop`.'].filter(Boolean).join('\n'))
    .addFields(
      { name: 'Titles', value: titles.map((c) => `${profile.cosmetics?.title === c.id ? '▶️' : '▫️'} ${c.name}`).join('\n') || 'None', inline: true },
      { name: 'Themes', value: themes.map((c) => `${profile.cosmetics?.theme === c.id ? '▶️' : '▫️'} ${c.name}`).join('\n') || 'None', inline: true },
    )
    .setFooter({ text: `${owned.length}/${cosmetics.length} collected • Titles show next to your name; themes colour your embeds.` });
  const color = themeColor(profile);
  if (color !== null) e.setColor(color);

  const components: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  for (const [kind, list] of [['title', titles], ['theme', themes]] as const) {
    if (!list.length) continue;
    const current = profile.cosmetics?.[kind];
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(makeId('~cos', userId, kind)).setPlaceholder(`Equip a ${kind}...`).addOptions([
        { label: `No ${kind}`, value: 'none', default: !current },
        ...list.map((c) => ({ label: c.name, value: c.id, default: current === c.id })),
      ]),
    ));
  }
  return { embeds: [e], components };
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('cosmetics').setDescription('Equip titles and colour themes'),
  category: 'economy',
  async execute({ interaction, profile }) {
    const userId = interaction.user.id;
    const name = interaction.user.username;
    const response = await interaction.reply({ ...render(profile, name, userId), withResponse: true });
    const message = response.resource?.message;
    if (!message) return;
    collect(message, { time: 120_000 }).on('collect', (i) => {
      (async () => {
        if (!i.isStringSelectMenu()) return;
        const kind = parseId(i.customId).args[0] as 'title' | 'theme';
        const value = i.values[0]!;
        const fresh = await getProfile(userId);
        if (value !== 'none' && !(fresh.cosmetics?.owned ?? []).includes(value)) {
          return i.update(render(fresh, name, userId, "❌ You don't own that."));
        }
        const updated = await apply(userId, { set: { [`cosmetics.${kind}`]: value === 'none' ? null : value } }, { source: 'cosmetics.equip' });
        await i.update(render(updated, name, userId, value === 'none' ? `Unequipped your ${kind}.` : `Equipped **${getCosmetic(value)?.name}**.`));
      })().catch((err) => logError('cosmetics', err));
    });
  },
});
