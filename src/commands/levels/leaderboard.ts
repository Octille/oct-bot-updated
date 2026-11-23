import { ButtonStyle, escapeMarkdown, GatewayIntentBits, SlashCommandBuilder, type Guild } from 'discord.js';
import { MemberLevel } from '../../models/MemberLevel';
import { defineCommand } from '../../framework/types';
import { achievements } from '../../content/achievements';
import { getCosmetic } from '../../content/cosmetics';
import { fishSpecies } from '../../content/fishing';
import type { IconKey } from '../../content/icons';
import { prestigeNumerals } from '../../content/prestige';
import { collect } from '../../lib/collect';
import { embed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { button } from '../../lib/ui';
import { levelFromXp, serverLevelFromXp } from '../../content/levels';
import { board, metrics, PER_PAGE, rankOf, type Metric, type Row } from '../../services/leaderboard';
import { row, select } from '../../ui/kit';

const LABEL: Record<Metric, string> = {
  coins: 'Net worth', server: 'Server level', level: 'Account level', fish: 'Fish caught', gambling: 'Gambling winnings',
  streak: 'Daily streak', fishdex: 'Fishdex', achievements: 'Achievements',
};

function valueText(metric: Metric, r: Pick<Row, 'value' | 'prestige' | 'level'>): string {
  switch (metric) {
    case 'coins': return coins(r.value);
    case 'level': return `${r.prestige ? `P${prestigeNumerals[r.prestige] ?? r.prestige} · ` : ''}Lv ${r.level}`;
    case 'server': return `Lv ${serverLevelFromXp(r.value).level} · ${num(r.value)} XP`;
    case 'fishdex': return `${r.value} / ${fishSpecies.length}`;
    case 'fish': return `${num(r.value)} fish`;
    case 'gambling': return `+${coins(r.value)}`;
    case 'streak': return `${num(r.value)} day${r.value === 1 ? '' : 's'}`;
    case 'achievements': return `${r.value} / ${achievements.length}`;
  }
}

/** A raw board value back into what valueText shows (Level packs prestige and XP into one number). */
function unpack(metric: Metric, value: number): Pick<Row, 'value' | 'prestige' | 'level'> {
  if (metric !== 'level') return { value, prestige: 0, level: 0 };
  return { value, prestige: Math.floor(value / 1e12), level: levelFromXp(value % 1e12).level };
}

/* Names and member lists, cached (leaderboards are opened often) */
const names = new Map<string, { at: number; name: string }>();
const memberLists = new Map<string, { at: number; ids: string[] }>();

async function memberIds(guild: Guild): Promise<string[]> {
  const hit = memberLists.get(guild.id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.ids;
  let ids: string[];
  if (guild.client.options.intents.has(GatewayIntentBits.GuildMembers)) {
    try {
      ids = [...(await guild.members.fetch({ time: 10_000 })).filter((m) => !m.user.bot).keys()];
    } catch {
      ids = await activeHere(guild);
    }
  } else {
    // Without the Server Members intent: everyone who has earned XP here, plus the cached members
    ids = await activeHere(guild);
  }
  memberLists.set(guild.id, { at: Date.now(), ids });
  return ids;
}

async function activeHere(guild: Guild): Promise<string[]> {
  const rows = await MemberLevel.find({ guildId: guild.id }, { userId: 1 }, { lean: true });
  return [...new Set([...rows.map((r) => r.userId), ...guild.members.cache.filter((m) => !m.user.bot).keys()])];
}

async function nameOf(guild: Guild | null, userId: string, client: Guild['client']): Promise<string> {
  const hit = names.get(userId);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.name;
  let name = 'Unknown player';
  try {
    const member = guild?.members.cache.get(userId);
    const user = member?.user ?? (await client.users.fetch(userId));
    name = member?.displayName ?? user.globalName ?? user.username;
  } catch { /* deleted account */ }
  // Names are shown in bold lists: escape markdown so a name can't break the layout or mask a link
  name = escapeMarkdown(name);
  names.set(userId, { at: Date.now(), name });
  return name;
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Top players: net worth, levels, fish, gambling, streaks and more')
    .addStringOption((o) => o.setName('board').setDescription('Which leaderboard').addChoices(...metrics.map((m) => ({ name: LABEL[m], value: m }))))
    .addStringOption((o) => o.setName('scope').setDescription('This server or everyone').addChoices({ name: 'This server', value: 'server' }, { name: 'Global', value: 'global' })),
  category: 'levels',
  defer: 'public',
  async execute({ interaction }) {
    const userId = interaction.user.id;
    const guild = interaction.guild;
    let metric = (interaction.options.getString('board') as Metric | null) ?? 'coins';
    let scope: 'server' | 'global' = guild ? ((interaction.options.getString('scope') as 'server' | 'global' | null) ?? 'server') : 'global';
    let page = 0;

    const render = async () => {
      // Server level only exists per server
      if (metric === 'server') scope = 'server';
      const members = scope === 'server' && guild && metric !== 'server' ? await memberIds(guild) : null;
      const opts = { guildId: guild?.id ?? null, members };
      const [b, me] = await Promise.all([board(metric, page, opts), rankOf(metric, userId, opts)]);
      const pages = Math.max(1, Math.ceil(b.total / PER_PAGE));
      const lines = await Promise.all(b.rows.map(async (r, i) => {
        const pos = page * PER_PAGE + i + 1;
        const badge = r.badge ? getCosmetic(r.badge) : undefined;
        const badgeText = badge?.kind === 'badge' ? `${icon(badge.value as IconKey)} ` : '';
        const name = await nameOf(guild, r.userId, interaction.client);
        const line = `**#${pos}** ${badgeText}${name} · ${valueText(metric, r)}`;
        return r.userId === userId ? `__${line}__` : line;
      }));
      const where = scope === 'server' && guild ? guild.name : 'Global';
      const e = embed('levels').setTitle(`${titleIcon('leaderboard')} Leaderboard › ${LABEL[metric]}`)
        .setDescription([`**${where}**`, '', ...(lines.length ? lines : ['Nobody here yet.'])].join('\n'))
        .setFooter({ text: `${me ? `You: #${num(me.rank)} · ${valueText(metric, unpack(metric, me.value))}` : "You're not on this board yet"} · Page ${page + 1} of ${pages}` });
      return {
        embeds: [e],
        components: [
          select(`~lb:${userId}:metric`, 'Pick a leaderboard', metrics.map((m) => ({ label: LABEL[m], value: m, default: m === metric }))),
          row(
            button('~lb', userId, ['prev'], 'Prev', ButtonStyle.Secondary, undefined, page === 0),
            button('~lb', userId, ['next'], 'Next', ButtonStyle.Secondary, undefined, page >= pages - 1),
            button('~lb', userId, ['scope'], scope === 'server' ? 'Show global' : 'Show this server', ButtonStyle.Secondary, undefined, !guild || metric === 'server'),
          ),
        ],
        allowedMentions: { parse: [] as [] },
      };
    };

    const message = await interaction.editReply(await render());
    const collector = collect(message, { time: 10 * 60_000, idle: 3 * 60_000 });
    collector.on('collect', (i) => {
      (async () => {
        if (i.isStringSelectMenu()) {
          metric = i.values[0] as Metric;
          page = 0;
        } else {
          const action = i.customId.split(':')[2];
          if (action === 'prev') page = Math.max(0, page - 1);
          if (action === 'next') page++;
          if (action === 'scope') { scope = scope === 'server' ? 'global' : 'server'; page = 0; }
        }
        await i.deferUpdate();
        await interaction.editReply(await render());
      })().catch((err) => logError('leaderboard', err));
    });
  },
});
