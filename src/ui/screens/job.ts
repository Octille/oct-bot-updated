import { icon, titleIcon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { coins, num } from '../../lib/format';
import { UserError } from '../../lib/errors';
import { getJob, jobRanks, jobs, nextRank, rankFor } from '../../content/jobs';
import { shiftsIn } from '../../game/jobs';
import { apply } from '../../services/economy';
import { incomeMultiplier, unlockLevel } from '../../services/progression';
import { back, btn, ids, MAIN, NAV, row, select } from '../kit';
import type { ScreenModule } from './types';

const GAMES = ['Unscramble', 'Quick maths', 'Memory', 'Colour click'];

export const job: ScreenModule = {
  render(path, ctx) {
    const p = ctx.profile;
    const level = unlockLevel(p);
    const current = getJob(p.job?.current);
    const options = jobs.map((j) => {
      const shifts = shiftsIn(p.job?.shifts, j.id);
      return {
        label: j.name,
        value: j.id,
        description: j.level > level ? `Unlocks at level ${j.level}` : `${rankFor(shifts).title} · ~${coins(Math.round(j.basePay * rankFor(shifts).mult * incomeMultiplier(p)))}/shift`,
        default: j.id === (path[1] ?? current.id),
      };
    });
    const picker = select(ids.pick(ctx.owner, ctx.origin, 'job'), 'Pick a job', options);

    const id = path[1];
    if (!id) {
      const shifts = shiftsIn(p.job?.shifts, current.id);
      const next = nextRank(shifts);
      return {
        embeds: [embed('economy').setTitle(`${titleIcon('jobs')} Jobs`).setDescription([
          ctx.note,
          `You work as a **${rankFor(shifts).title} ${current.name}** (${num(shifts)} shifts).`,
          next ? `${next.shifts - shifts} more shift(s) until **${next.title}** (${next.mult}× pay).` : "You're at the top rank.",
          '',
          `Promotions: ${jobRanks.map((r) => `${r.title} ${r.shifts}+`).join(' → ')}`,
        ].filter((l) => l !== undefined).join('\n')).setFooter({ text: 'Tip: pick a job to see its pay. Ranks are kept per job.' })],
        components: [picker, row(back(ctx, null), btn(ids.go(ctx.owner, 'work'), 'Start a shift', MAIN))],
      };
    }

    const j = getJob(id);
    const shifts = shiftsIn(p.job?.shifts, j.id);
    const rank = rankFor(shifts);
    const isCurrent = j.id === current.id;
    const locked = j.level > level;
    return {
      embeds: [embed('economy').setTitle(`${titleIcon('jobs')} Jobs › ${j.name}`).setDescription([
        ctx.note,
        `Pay at your rank (${rank.title}): **~${coins(Math.round(j.basePay * rank.mult * incomeMultiplier(p)))}** per shift`,
        `Shifts worked here: ${num(shifts)}`,
        `Minigames: ${GAMES.join(', ')} · difficulty ${'★'.repeat(j.difficulty)}${'☆'.repeat(5 - j.difficulty)}`,
        locked ? `${icon('locked')} Unlocks at account level **${j.level}** (you're ${level}).` : null,
      ].filter(Boolean).join('\n'))],
      components: [picker, row(
        back(ctx, 'job'),
        btn(ids.act(ctx.owner, ctx.origin, `job.${j.id}`, 'switch', j.id), isCurrent ? 'Your current job' : locked ? `Needs level ${j.level}` : `Switch to ${j.name}`, MAIN, { disabled: isCurrent || locked }),
        btn(ids.go(ctx.owner, 'work'), 'Start a shift', NAV),
      )],
    };
  },

  async act(path, action, args, _i, ctx) {
    if (action !== 'switch') return { path: path.join('.') };
    const j = getJob(args[0]);
    if (j.level > unlockLevel(ctx.profile)) throw new UserError(`${j.name} unlocks at level ${j.level}.`);
    await apply(ctx.owner, { set: { 'job.current': j.id } }, { source: 'job.switch' });
    return { path: `job.${j.id}`, note: `${icon('success')} You're now a **${j.name}**. Start a shift when you're ready.` };
  },
};
