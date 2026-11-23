import { icon, titleIcon } from '../../lib/icons';
import { afterAction } from '../../ui/next';
import { ButtonStyle, SlashCommandBuilder, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { collect } from '../../lib/collect';
import { button, levelUpText, rows } from '../../lib/ui';
import { logError } from '../../lib/logger';
import { UserError } from '../../lib/errors';
import { cooldowns } from '../../content/earning';
import { rarityInfo } from '../../content/rarity';
import { freshCatchBonus, newFishdexRewards, planCast, reelWindow, rollCatch } from '../../game/fishing';
import { fishSpecies, fishValue } from '../../content/fishing';
import { grant, luckBonus } from '../../services/progression';
import { apply } from '../../services/economy';
import { describeTool, ensureStarterRod, equipped } from '../../services/tools';
import * as cooldownService from '../../services/cooldowns';

type Phase = 'ready' | 'waiting' | 'bite' | 'done';

export default defineCommand({
  data: new SlashCommandBuilder().setName('fish').setDescription('Cast your line — hit REEL the moment something bites'),
  category: 'economy',
  defer: 'public',
  blockedInJail: true,
  cooldown: { key: 'fish', seconds: cooldowns.fish },
  async execute({ interaction }) {
    const userId = interaction.user.id;
    const profile = await ensureStarterRod(userId);
    const rod = equipped(profile, 'rod');
    if (!rod.tool || rod.broken) throw new UserError('Your rod is broken. `/tools` to repair it.');

    const catchRoll = rollCatch((rod.tool.luck ?? 0) + luckBonus(profile), rod.tool.valueMult ?? 1);
    const plan = planCast();
    const windowMs = reelWindow(catchRoll.species.rarity, rod.tool.windowBonusMs ?? 0);
    const id = (label: string, style: ButtonStyle, emoji?: string, disabled = false) =>
      rows([button('~fish', userId, ['go'], label, style, emoji, disabled)]);
    const scene = (text: string) => embed('economy').setTitle(`${titleIcon('fish')} Fish`).setDescription(text)
      .setFooter({ text: describeTool(rod, 'rod').replace(/\*\*/g, '') });

    const message = await interaction.editReply({ embeds: [scene('The water is calm. Ready when you are.')], components: id('Cast line', ButtonStyle.Success) });

    let phase: Phase = 'ready';
    let biteShownAt = 0;
    const timers: NodeJS.Timeout[] = [];

    const end = async (outcome: 'caught' | 'early' | 'late', i: ButtonInteraction | StringSelectMenuInteraction | null, reactionMs?: number) => {
      if (phase === 'done') return;
      phase = 'done';
      timers.forEach(clearTimeout);
      collector.stop('done');

      const fish = catchRoll.species;
      const info = rarityInfo[fish.rarity];
      // Casting always wears the rod; only a catch pays out
      const durability = { 'tools.rod.durability': -1 };
      const where = { 'tools.rod.durability': { $gte: 1 } };
      let text: string;
      let footerXp = '';

      if (outcome === 'caught') {
        const dex = (profile.fishdex ?? {}) as Record<string, { caught: number }>;
        const isNew = (dex[fish.id]?.caught ?? 0) === 0;
        const speciesCaught = fishSpecies.filter((f) => (dex[f.id]?.caught ?? 0) > 0).length + (isNew ? 1 : 0);
        const claimed = profile.fishdexRewards ?? [];
        const rewards = isNew ? newFishdexRewards(speciesCaught, claimed) : [];
        const bonus = freshCatchBonus(catchRoll);
        const rewardCoins = rewards.reduce((s, r) => s + r.coins, 0);

        const { xp, levelUp, profile: after } = await grant(userId, {
          wallet: bonus + rewardCoins || undefined,
          items: { [fish.id]: 1 },
          inc: { ...durability, 'stats.fishCaught': 1, [`fishdex.${fish.id}.caught`]: 1 },
          max: { [`fishdex.${fish.id}.biggest`]: catchRoll.kg },
          addToSet: { fishdexRewards: rewards.map((r) => r.percent) },
          // The rod must still have durability, and the rewards must not have been claimed meanwhile
          where: { ...where, ...(rewards.length ? { fishdexRewards: { $nin: rewards.map((r) => r.percent) } } : {}) },
        }, { source: 'fish', xp: 'fish', profile, meta: { fish: fish.id, kg: catchRoll.kg, rewards: rewards.map((r) => r.percent) } });
        text = [
          `${icon('success')} Caught a **${fish.emoji} ${fish.name}** · ${num(catchRoll.kg)} kg · ${icon(fish.rarity)} ${info.label}`,
          `Reeled in ${((reactionMs ?? 0) / 1000).toFixed(2)}s after the bite.`,
          bonus > 0 ? `Fresh-catch bonus **+${coins(bonus)}** (size + rod). It sells for ${coins(fishValue[fish.rarity])} more later.` : `Sells for ${coins(fishValue[fish.rarity])}.`,
          isNew ? `**New fishdex entry!** (${speciesCaught}/${fishSpecies.length})` : null,
          ...rewards.map((r) => `${icon('success')} **Fishdex ${r.percent}% complete!** +${coins(r.coins)}`),
          equipped(after, 'rod').broken ? `${icon('warning')} **Your rod broke.** Repair it in /tools.` : null,
          levelUpText(levelUp),
        ].filter(Boolean).join('\n');
        footerXp = `+${xp} XP`;
      } else {
        await apply(userId, { inc: { ...durability, 'stats.fishLost': 1 }, where }, { source: 'fish' });
        text = outcome === 'early'
          ? 'Too early! You yanked the line and scared everything away.'
          : `It got away... something ${info.label.toLowerCase()} was on the line.`;
      }

      const next = await afterAction(userId, 'fish');
      const payload = {
        embeds: [embed(outcome === 'caught' ? 'success' : 'warning').setTitle(`${titleIcon('fish')} Fish › ${outcome === 'caught' ? 'Caught!' : 'Got away'}`)
          .setDescription([text, next.note].filter(Boolean).join('\n'))
          .setFooter({ text: [footerXp, '/fishdex to see your collection'].filter(Boolean).join(' • ') })],
        components: [next.row],
      };
      if (i) await i.update(payload);
      else await interaction.editReply(payload);
    };

    const startWaiting = () => {
      phase = 'waiting';
      if (plan.nibbleAtMs !== null) {
        timers.push(setTimeout(() => {
          if (phase === 'waiting') interaction.editReply({ embeds: [scene('... *nibble?* ...')] }).catch(() => undefined);
        }, plan.nibbleAtMs));
      }
      timers.push(setTimeout(() => {
        if (phase !== 'waiting') return;
        interaction.editReply({ embeds: [scene('**BITE!**')], components: id('Reel in!', ButtonStyle.Success) })
          .then(() => {
            if (phase !== 'waiting') return;
            phase = 'bite';
            biteShownAt = Date.now();
            timers.push(setTimeout(() => end('late', null).catch((err) => logError('fish', err)), windowMs + 400));
          })
          .catch((err) => logError('fish', err));
      }, plan.biteAtMs));
    };

    const collector = collect(message, { time: 60_000, disableOnEnd: false });
    collector.on('collect', (i) => {
      (async () => {
        if (phase === 'ready') {
          await i.update({ embeds: [scene('Line in the water... wait for it...')], components: id('Wait for it…', ButtonStyle.Secondary) });
          return startWaiting();
        }
        if (phase === 'waiting') return end('early', i);
        if (phase === 'bite') {
          const reaction = Date.now() - biteShownAt;
          return end(reaction <= windowMs ? 'caught' : 'late', i, reaction);
        }
      })().catch((err) => logError('fish', err));
    });
    collector.on('end', (_c, reason) => {
      if (reason === 'done') return;
      timers.forEach(clearTimeout);
      if (phase === 'ready') {
        // Never cast: refund the cooldown
        phase = 'done';
        cooldownService.release(userId, 'fish').catch(() => undefined);
        interaction.editReply({ embeds: [scene('You packed up without casting. Cooldown refunded.')], components: [] }).catch(() => undefined);
      } else {
        end('late', null).catch((err) => logError('fish', err));
      }
    });
  },
});
