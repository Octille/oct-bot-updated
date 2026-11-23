import { ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { MAX_PAYOUT } from '../../content/gambling';
import { crashMultiplierAt, crashPoint, crashTimeFor } from '../../game/gambling/crash';
import { collect } from '../../lib/collect';
import { embed } from '../../lib/embeds';
import { coins } from '../../lib/format';
import { icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { defaultRng } from '../../lib/rng';
import { button, rows } from '../../lib/ui';
import { assertGamblingAllowed, netText, parseBet, payOut, takeBet } from '../../services/gambling';
import { btn, ids, NAV, row } from '../../ui/kit';
import { resultKind } from './round';

const TICK_MS = 1_500;
const CLICK_GRACE_MS = 800;

export default defineCommand({
  data: new SlashCommandBuilder().setName('crash').setDescription('The multiplier climbs until it crashes. Cash out in time')
    .addStringOption((o) => o.setName('bet').setDescription('e.g. 500, 2.5k, half, all').setRequired(true))
    .addNumberOption((o) => o.setName('auto').setDescription('Cash out automatically at this multiplier, e.g. 2').setMinValue(1.01).setMaxValue(1000)),
  category: 'gambling',
  guildOnly: true,
  blockedInJail: true,
  defer: 'public',
  async execute({ interaction, profile }) {
    await assertGamblingAllowed(interaction);
    const userId = interaction.user.id;
    const bet = parseBet(interaction.options.getString('bet', true), profile, 'crash');
    // Never pay past the per-round cap: cashing out there is automatic
    const capAt = Math.floor((MAX_PAYOUT / bet) * 100) / 100;
    const auto = Math.min(interaction.options.getNumber('auto') ?? Infinity, capAt);
    await takeBet(userId, 'crash', bet);
    const point = crashPoint(defaultRng);
    const crashMs = crashTimeFor(point);

    const live = (m: number) => ({
      embeds: [embed('economy').setTitle(`${titleIcon('crash')} Crash`).setDescription([
        `# ${m.toFixed(2)}×`,
        `Cash out now: **${coins(Math.floor(bet * m))}**${Number.isFinite(auto) ? ` · auto at ${auto}×` : ''}`,
      ].join('\n'))],
      components: rows([button('~crash', userId, ['cash'], `Cash out · ${coins(Math.floor(bet * m))}`, ButtonStyle.Success)]),
    });

    const message = await interaction.editReply(live(1));
    // Round time is measured on Discord's clock: from this message to the click
    const startTs = message.editedTimestamp ?? message.createdTimestamp;
    const localStart = Date.now();
    let settled = false;

    const finish = async (cashedAt: number | null) => {
      if (settled) return null;
      settled = true;
      collector.stop('done');
      const payout = cashedAt ? Math.floor(bet * cashedAt) : 0;
      const after = await payOut(userId, 'crash', bet, payout);
      const kind = resultKind(bet, payout);
      return {
        embeds: [embed(kind).setTitle(`${titleIcon('crash')} Crash › ${cashedAt ? `Cashed out at ${cashedAt.toFixed(2)}×` : `Crashed at ${point.toFixed(2)}×`}`).setDescription([
          `${icon(kind === 'error' ? 'error' : 'success')} **${netText(bet, payout)}**${cashedAt ? ` · it crashed at ${point.toFixed(2)}×` : ''}`,
          `Bet ${coins(bet)} · Wallet ${coins(after.wallet)}`,
        ].join('\n'))],
        components: [row(btn(ids.nav(userId, 'c', 'casino'), 'Casino', NAV))],
      };
    };

    const collector = collect(message, { time: crashMs + 60_000 });
    collector.on('collect', (i) => {
      (async () => {
        if (settled) return i.deferUpdate();
        const elapsed = i.createdTimestamp - startTs;
        const at = Math.min(crashMultiplierAt(elapsed), auto);
        const view = await finish(elapsed < crashMs ? at : null);
        if (view) await i.update(view);
        else await i.deferUpdate();
      })().catch((err) => logError('crash', err));
    });

    // Animate, then end at the crash (or the auto cash-out, whichever comes first)
    const autoMs = Number.isFinite(auto) ? crashTimeFor(auto) : Infinity;
    const endMs = Math.min(crashMs, autoMs);
    const tick = async () => {
      if (settled) return;
      const elapsed = Date.now() - localStart;
      if (elapsed >= endMs) {
        const crashed = autoMs > crashMs;
        // Clicks Discord stamped just before the crash may still be on their way: give them a moment
        if (crashed) await new Promise((r) => setTimeout(r, CLICK_GRACE_MS));
        const view = await finish(crashed ? null : auto);
        if (view) await interaction.editReply(view);
        return;
      }
      await interaction.editReply(live(crashMultiplierAt(elapsed)));
      setTimeout(() => void tick().catch((err) => logError('crash', err)), Math.min(TICK_MS, endMs - elapsed));
    };
    setTimeout(() => void tick().catch((err) => logError('crash', err)), Math.min(TICK_MS, endMs));
  },
});
