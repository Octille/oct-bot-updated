import { AttachmentBuilder, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { profileCard } from '../../lib/cards';
import { person } from '../../lib/people';
import { cardStyle, prestigeTag } from '../../lib/theme';
import { coins, num } from '../../lib/format';
import { achievements } from '../../content/achievements';
import { fishSpecies } from '../../content/fishing';
import { levelFromXp } from '../../content/levels';
import { veteranInfo, type VeteranTier } from '../../content/veteran';
import { getProfile } from '../../services/economy';
import { inventoryOf, inventoryValue } from '../../services/items';
import { unlockedAt } from '../../services/achievements';

export default defineCommand({
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Your profile card: level, prestige, net worth and collections')
    .addUserOption((o) => o.setName('user').setDescription('Someone else to check')),
  category: 'levels',
  defer: 'public',
  async execute({ interaction }) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    if (target.bot) return interaction.editReply({ content: "Bots don't have profiles." });
    const member = interaction.inGuild() ? await interaction.guild!.members.fetch(target.id).catch(() => null) : null;
    const p = await getProfile(target.id);
    const { level, into, needed } = levelFromXp(p.account?.xp ?? 0);
    const who = person(target, member, p);
    const tier = p.veteran?.tier as VeteranTier | null | undefined;
    const tierLabel = tier ? veteranInfo[tier].label : null;
    const png = await profileCard({
      person: who,
      style: cardStyle(p),
      accountLevel: level,
      into,
      needed,
      prestige: prestigeTag(p.account?.prestige ?? 0),
      // The tier only shows as a tag when it isn't already the equipped title
      tag: tierLabel && tierLabel !== who.title ? `${tierLabel} of the original OctBot` : null,
      tiles: [
        ['Net worth', coins(p.wallet + p.bank + inventoryValue(inventoryOf(p)))],
        ['Achievements', `${achievements.filter((a) => unlockedAt(p, a.id)).length} / ${achievements.length}`],
        ['Fishdex', `${Object.keys(p.fishdex ?? {}).length} / ${fishSpecies.length}`],
        ['Daily streak', `${num(p.streak?.count ?? 0)} day${p.streak?.count === 1 ? '' : 's'}`],
        ['Shifts worked', num(p.stats?.worked ?? 0)],
        ['Crimes', num(p.stats?.crimes ?? 0)],
      ],
    });
    return interaction.editReply({ files: [new AttachmentBuilder(png, { name: 'profile.png' })] });
  },
});
