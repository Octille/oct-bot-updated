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
import { canPrestige } from '../../services/prestige';
import { memberLevel } from '../../services/levels';
import type { CardBadge } from '../../lib/cards';
import type { Profile } from '../../services/economy';

/**
 * The profile's badge row: veteran tier, then the most impressive achievements unlocked
 * (hidden ones first, then those with title rewards, then the biggest goals).
 */
export function profileBadges(p: Profile, tier: VeteranTier | null): CardBadge[] {
  const out: CardBadge[] = [];
  if (tier) out.push({ icon: veteranInfo[tier].badge, label: veteranInfo[tier].label });
  const score = (a: (typeof achievements)[number]) => (a.hidden ? 2e9 : 0) + (a.reward.cosmetic ? 1e9 : 0) + a.goal;
  const top = achievements.filter((a) => unlockedAt(p, a.id)).sort((a, b) => score(b) - score(a)).slice(0, tier ? 2 : 3);
  for (const a of top) out.push({ icon: 'achievements', label: a.name });
  return out;
}

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
    const server = interaction.inGuild() ? await memberLevel(interaction.guildId, target.id) : null;
    const png = await profileCard({
      person: who,
      style: cardStyle(p),
      accountLevel: level,
      into,
      needed,
      readyToPrestige: canPrestige(p).ok,
      prestige: prestigeTag(p.account?.prestige ?? 0),
      badges: profileBadges(p, tier ?? null),
      tiles: [
        ['Net worth', coins(p.wallet + p.bank + inventoryValue(inventoryOf(p)))],
        ['Server rank', server?.rank ? `#${num(server.rank)} of ${num(server.members)}` : '—'],
        ['Achievements', `${achievements.filter((a) => unlockedAt(p, a.id)).length} / ${achievements.length}`],
        ['Fishdex', `${Object.keys(p.fishdex ?? {}).length} / ${fishSpecies.length}`],
        ['Daily streak', `${num(p.streak?.count ?? 0)} day${p.streak?.count === 1 ? '' : 's'}`],
        ['Shifts worked', num(p.stats?.worked ?? 0)],
      ],
    });
    return interaction.editReply({ files: [new AttachmentBuilder(png, { name: 'profile.png' })] });
  },
});
