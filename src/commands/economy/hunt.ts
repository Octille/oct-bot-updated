import { icon, titleIcon } from '../../lib/icons';
import { afterAction } from '../../ui/next';
import { ButtonStyle, SlashCommandBuilder, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins } from '../../lib/format';
import { collect } from '../../lib/collect';
import { parseId } from '../../lib/customId';
import { button, levelUpText, rows } from '../../lib/ui';
import { logError } from '../../lib/logger';
import { UserError } from '../../lib/errors';
import { moreCooldowns } from '../../content/earning';
import { animalValue } from '../../content/hunting';
import { rarityInfo } from '../../content/rarity';
import { huntWindow, planHunt, trophyBonus } from '../../game/hunting';
import { apply } from '../../services/economy';
import { grant, luckBonus } from '../../services/progression';
import { describeTool, equipped } from '../../services/tools';

type Phase = 'waiting' | 'shown' | 'done';

export default defineCommand({
  data: new SlashCommandBuilder().setName('hunt').setDescription('Something will burst out of a bush — hit it fast'),
  category: 'economy',
  defer: 'public',
  blockedInJail: true,
  cooldown: { key: 'hunt', seconds: moreCooldowns.hunt },
  async execute({ interaction, profile }) {
    const userId = interaction.user.id;
    const weapon = equipped(profile, 'weapon');
    if (!weapon.tool) throw new UserError('You need something to hunt with. Buy a Slingshot in `/tools`.');
    if (weapon.broken) throw new UserError(`Your ${weapon.tool.name} is broken. \`/tools\` to repair it.`);

    const hunt = planHunt((weapon.tool.luck ?? 0) + luckBonus(profile), weapon.tool.valueMult ?? 1);
    const windowMs = huntWindow(hunt.animal.rarity, weapon.tool.windowBonusMs ?? 0);
    const footer = describeTool(weapon, 'weapon').replace(/\*\*/g, '');
    const bushes = (reveal: { animalAt?: number; picked?: number; disabled?: boolean } = {}) => rows([0, 1, 2].map((i) => {
      const isAnimal = reveal.animalAt === i;
      const style = isAnimal ? ButtonStyle.Success : reveal.picked === i ? ButtonStyle.Danger : ButtonStyle.Secondary;
      return button('~hunt', userId, [i], '\u200b', style, isAnimal ? hunt.animal.emoji : '🌳', reveal.disabled);
    }));

    const message = await interaction.editReply({
      embeds: [embed('economy').setTitle(`${titleIcon('hunt')} Hunt`).setDescription('You crouch in the long grass. Stay still... watch the bushes.').setFooter({ text: footer })],
      components: bushes(),
    });

    let phase: Phase = 'waiting';
    let shownAt = 0;
    const timers: NodeJS.Timeout[] = [];

    const end = async (outcome: 'hit' | 'early' | 'wrong' | 'late', i: ButtonInteraction | StringSelectMenuInteraction | null, picked?: number, reactionMs?: number) => {
      if (phase === 'done') return;
      phase = 'done';
      timers.forEach(clearTimeout);
      collector.stop('done');
      const info = rarityInfo[hunt.animal.rarity];
      const wear = { 'tools.weapon.durability': -1 };
      const where = { 'tools.weapon.durability': { $gte: 1 } };
      let text: string;
      let footerText = '';

      if (outcome === 'hit') {
        const bonus = trophyBonus(hunt);
        const { xp, levelUp, profile: after } = await grant(userId, {
          wallet: bonus || undefined,
          items: { [hunt.animal.id]: 1 },
          inc: { ...wear, 'stats.hunted': 1 },
          where,
        }, { source: 'hunt', xp: 'hunt', guildId: interaction.guildId, profile, meta: { animal: hunt.animal.id } });
        text = [
          `${icon('success')} Got a **${hunt.animal.emoji} ${hunt.animal.name}** in ${((reactionMs ?? 0) / 1000).toFixed(2)}s · ${icon(hunt.animal.rarity)} ${info.label}`,
          bonus > 0 ? `Trophy bonus **+${coins(bonus)}**. The trophy sells for ${coins(animalValue[hunt.animal.rarity])} more later.` : `The trophy sells for ${coins(animalValue[hunt.animal.rarity])}.`,
          equipped(after, 'weapon').broken ? `${icon('warning')} **Your weapon broke.** Repair it in /tools.` : null,
          levelUpText(levelUp),
        ].filter(Boolean).join('\n');
        footerText = `+${xp} XP`;
      } else {
        await apply(userId, { inc: { ...wear, 'stats.missedHunts': 1 }, where }, { source: 'hunt' });
        text = {
          early: 'You fired at a leaf. Everything for a mile heard that.',
          wrong: `Wrong bush! A ${hunt.animal.name.toLowerCase()} darts away behind you.`,
          late: `Too slow. The ${hunt.animal.name.toLowerCase()} vanished into the trees.`,
          hit: '',
        }[outcome];
      }
      const next = await afterAction(userId, 'hunt');
      const payload = {
        embeds: [embed(outcome === 'hit' ? 'success' : 'warning').setTitle(`${titleIcon('hunt')} Hunt › ${outcome === 'hit' ? 'Got it!' : 'Missed'}`)
          .setDescription([text, next.note].filter(Boolean).join('\n')).setFooter({ text: footerText || footer })],
        components: [...bushes({ animalAt: outcome === 'early' ? undefined : hunt.bush, picked, disabled: true }), next.row],
      };
      if (i) await i.update(payload);
      else await interaction.editReply(payload);
    };

    timers.push(setTimeout(() => {
      if (phase !== 'waiting') return;
      interaction.editReply({ embeds: [embed('economy').setTitle(`${titleIcon('hunt')} Hunt`).setDescription(`**THERE!** ${hunt.animal.emoji}`).setFooter({ text: footer })], components: bushes({ animalAt: hunt.bush }) })
        .then(() => {
          if (phase !== 'waiting') return;
          phase = 'shown';
          shownAt = Date.now();
          timers.push(setTimeout(() => end('late', null).catch((err) => logError('hunt', err)), windowMs + 400));
        })
        .catch((err) => logError('hunt', err));
    }, hunt.delayMs));

    const collector = collect(message, { time: 30_000, disableOnEnd: false });
    collector.on('collect', (i) => {
      (async () => {
        const picked = Number(parseId(i.customId).args[0]);
        if (phase === 'waiting') return end('early', i, picked);
        if (phase !== 'shown') return;
        const reaction = Date.now() - shownAt;
        if (picked !== hunt.bush) return end('wrong', i, picked);
        return end(reaction <= windowMs ? 'hit' : 'late', i, picked, reaction);
      })().catch((err) => logError('hunt', err));
    });
    collector.on('end', (_c, reason) => {
      if (reason === 'done' || phase === 'done') return;
      end('late', null).catch((err) => logError('hunt', err));
    });
  },
});
