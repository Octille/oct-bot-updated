import { afterAction } from '../../ui/next';
import { ButtonStyle, SlashCommandBuilder, type ButtonInteraction, type StringSelectMenuInteraction } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { embed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { collect } from '../../lib/collect';
import { parseId } from '../../lib/customId';
import { button, levelUpText, rows } from '../../lib/ui';
import { logError } from '../../lib/logger';
import { cooldowns } from '../../content/earning';
import { getJob, nextRank, rankFor } from '../../content/jobs';
import { isPerfect, performanceFor, randomMinigame, type Minigame, type MinigameKind } from '../../game/minigames';
import { PERFECT_BONUS, shiftPay, shiftsIn } from '../../game/jobs';
import { grant, incomeMultiplier } from '../../services/progression';

/** Last minigame each user played, so the next shift is a different one. */
const lastGame = new Map<string, MinigameKind>();

function gameButtons(game: Minigame, ownerId: string, pressed: number[], reveal: { wrong?: number } | null) {
  return rows(game.buttons.map((b, i) => {
    const isPressed = pressed.includes(i);
    let style = b.style;
    if (reveal) {
      if (game.solution.includes(i)) style = ButtonStyle.Success;
      else if (reveal.wrong === i) style = ButtonStyle.Danger;
      else style = ButtonStyle.Secondary;
    } else if (isPressed) style = ButtonStyle.Success;
    return button('~work', ownerId, [i], b.label, style, b.emoji, reveal !== null || isPressed);
  }));
}

export default defineCommand({
  data: new SlashCommandBuilder().setName('work').setDescription('Work a shift at your job (a quick minigame)'),
  category: 'economy',
  defer: 'public',
  blockedInJail: true,
  cooldown: { key: 'work', seconds: cooldowns.work },
  async execute({ interaction, profile }) {
    const userId = interaction.user.id;
    const level = profile.account?.level ?? 0;
    let job = getJob(profile.job?.current);
    if (job.level > level) job = getJob('barista');

    const shifts = shiftsIn(profile.job?.shifts, job.id);
    const rank = rankFor(shifts);
    const game = randomMinigame(job, undefined, lastGame.get(userId));
    lastGame.set(userId, game.kind);

    const header = `${job.emoji} **${rank.title} ${job.name}** — shift #${num(shifts + 1)} • ⏱️ ${game.timeLimitMs / 1000}s`;
    const title = `💼 Work › ${job.name} › ${game.title}`;

    if (game.preview) {
      await interaction.editReply({ embeds: [embed('economy').setTitle(title).setDescription(`${header}\n\n${game.preview.text}`)] });
      await new Promise((r) => setTimeout(r, game.preview!.ms));
    }

    const pressed: number[] = [];
    const message = await interaction.editReply({
      embeds: [embed('economy').setTitle(title).setDescription(`${header}\n\n${game.prompt}`)],
      components: gameButtons(game, userId, pressed, null),
    });
    const startedAt = Date.now();
    let finished = false;

    const finish = async (success: boolean, i: ButtonInteraction | StringSelectMenuInteraction | null, wrong?: number) => {
      if (finished) return;
      finished = true;
      collector.stop('done');
      const elapsed = (i ? Date.now() : startedAt + game.timeLimitMs) - startedAt;
      const perf = performanceFor(success, elapsed, game.timeLimitMs);
      const perfect = isPerfect(success, elapsed, game.timeLimitMs);
      const pay = shiftPay(job, shifts, perf, incomeMultiplier(profile), perfect);

      const { xp, levelUp } = await grant(userId, {
        wallet: pay,
        inc: { 'stats.worked': 1, [`job.shifts.${job.id}`]: 1, ...(perfect ? { 'stats.perfectShifts': 1 } : {}) },
      }, { source: 'work', xp: 'work', profile, meta: { job: job.id, game: game.kind, success } });

      const promoted = rankFor(shifts + 1).title !== rank.title ? `\n📈 **Promoted to ${rankFor(shifts + 1).title} ${job.name}!** Shifts pay more now.` : '';
      const next = nextRank(shifts + 1);
      const verdict = !success
        ? i ? '❌ Wrong! Your manager sighs.' : '⌛ Too slow! You stood there blinking.'
        : perfect ? `⚡ **Perfect shift!** ${(elapsed / 1000).toFixed(1)}s (+${Math.round((PERFECT_BONUS - 1) * 100)}% bonus)` : `✅ Done in ${(elapsed / 1000).toFixed(1)}s`;
      const result = embed(success ? 'economy' : 'warning')
        .setTitle(title)
        .setDescription([
          header,
          '',
          game.prompt,
          verdict,
          `💰 **+${coins(pay)}**${success ? '' : ' (pity pay)'}`,
          promoted || null,
          levelUpText(levelUp),
        ].filter((l) => l !== null).join('\n'))
        .setFooter({ text: `+${xp} XP • ${next ? `${next.shifts - shifts - 1} shifts to ${next.title}` : 'Max rank'} • /job to switch jobs` });

      const after = await afterAction(userId, 'work');
      if (after.note) result.setDescription(`${result.data.description}\n${after.note}`);
      const payload = { embeds: [result], components: [...gameButtons(game, userId, pressed, { wrong }), after.row] };
      if (i) await i.update(payload);
      else await interaction.editReply(payload);
    };

    const collector = collect(message, { time: game.timeLimitMs, disableOnEnd: false });
    collector.on('collect', (i) => {
      const index = Number(parseId(i.customId).args[0]);
      const expected = game.solution[pressed.length];
      const run = async () => {
        if (index !== expected) return finish(false, i, index);
        pressed.push(index);
        if (pressed.length === game.solution.length) return finish(true, i);
        await i.update({ components: gameButtons(game, userId, pressed, null) });
      };
      run().catch((err) => logError('work', err));
    });
    collector.on('end', () => {
      finish(false, null).catch((err) => logError('work', err));
    });
  },
});
