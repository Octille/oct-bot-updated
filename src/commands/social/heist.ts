import { ButtonStyle, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { defineCommand } from '../../framework/types';
import { heistRules } from '../../content/social';
import { collect } from '../../lib/collect';
import { ANYONE } from '../../lib/customId';
import { embed } from '../../lib/embeds';
import { UserError } from '../../lib/errors';
import { coins } from '../../lib/format';
import { icon, titleIcon } from '../../lib/icons';
import { logError } from '../../lib/logger';
import { button, rows } from '../../lib/ui';
import { User } from '../../models/User';
import type { Profile } from '../../services/economy';
import { heistBlocker, runHeist } from '../../services/heist';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default defineCommand({
  data: new SlashCommandBuilder().setName('heist').setDescription('Gather a crew and rob the Octopolis Vault together'),
  category: 'social',
  guildOnly: true,
  blockedInJail: true,
  defer: 'public',
  async execute({ interaction, profile }) {
    const hostId = interaction.user.id;
    const blocked = heistBlocker(profile);
    if (blocked) throw new UserError(blocked);
    const crew = new Set([hostId]);
    const closesAt = Date.now() + heistRules.lobbySeconds * 1000;
    const title = `${titleIcon('heist')} Heist › Octopolis Vault`;

    const lobby = () => ({
      embeds: [embed('economy').setTitle(title).setDescription([
        `<@${hostId}> is planning a heist. Stake **${coins(heistRules.stake)}** each; success pays **${coins(Math.floor(heistRules.stake * heistRules.payout))}** each.`,
        `Bigger crews do better: ${heistRules.minCrew} → ${pct(heistRules.chance(heistRules.minCrew))}, 4 → ${pct(heistRules.chance(4))}, ${heistRules.maxCrew} → ${pct(heistRules.chance(heistRules.maxCrew))}. Fail and you lose the stake, and might go to jail.`,
        '',
        `**Crew (${crew.size}/${heistRules.maxCrew}):** ${[...crew].map((id) => `<@${id}>`).join(', ')}`,
        `Chance now: **${pct(heistRules.chance(crew.size))}** · Leaves <t:${Math.floor(closesAt / 1000)}:R>`,
      ].join('\n')).setFooter({ text: `Needs account level ${heistRules.minLevel}. ${heistRules.cooldownHours}h cooldown after a heist.` })],
      components: rows([
        button('~heist', ANYONE, ['join'], `Join · ${coins(heistRules.stake)}`, ButtonStyle.Success, undefined, crew.size >= heistRules.maxCrew),
        button('~heist', hostId, ['go'], crew.size >= heistRules.minCrew ? 'Start now' : `Need ${heistRules.minCrew - crew.size} more`, ButtonStyle.Primary, undefined, crew.size < heistRules.minCrew),
        button('~heist', hostId, ['cancel'], 'Cancel', ButtonStyle.Danger),
      ]),
      allowedMentions: { parse: [] as [] },
    });

    const message = await interaction.editReply(lobby());
    let started = false;
    const collector = collect(message, { time: heistRules.lobbySeconds * 1000 , disableOnEnd: false });

    const start = async () => {
      if (started) return;
      started = true;
      collector.stop('started');
      await interaction.editReply({ embeds: [embed('economy').setTitle(title).setDescription(`The crew slips into the vault…`)], components: [], allowedMentions: { parse: [] } });
      await new Promise((r) => setTimeout(r, 2_000));
      const result = await runHeist([...crew], undefined, { guildId: interaction.guildId, channelId: interaction.channelId });
      const droppedLine = result.dropped.length ? `-# Dropped (couldn't pay or join any more): ${result.dropped.map((id) => `<@${id}>`).join(', ')}` : null;
      if ('tooFew' in result) {
        return interaction.editReply({ embeds: [embed('warning').setTitle(title).setDescription([`${icon('warning')} Not enough of the crew could go. Nobody paid anything.`, droppedLine].filter(Boolean).join('\n'))], components: [], allowedMentions: { parse: [] } });
      }
      const names = result.crew.map((id) => `<@${id}>`).join(', ');
      const payout = Math.floor(heistRules.stake * heistRules.payout);
      return interaction.editReply({
        embeds: [embed(result.success ? 'success' : 'error').setTitle(`${title} › ${result.success ? 'Success' : 'Busted'}`).setDescription([
          result.success
            ? `${icon('success')} The vault is open! Each of ${names} gets **${coins(payout)}** (+${coins(payout - heistRules.stake)}).`
            : `${icon('error')} Alarms everywhere. ${names} lost their **${coins(heistRules.stake)}** stakes.`,
          !result.success && result.jailed.length ? `Caught and jailed for ${heistRules.jailMinutes}m: ${result.jailed.map((id) => `<@${id}>`).join(', ')}` : null,
          `-# Crew of ${result.crew.length}, ${pct(result.chance)} chance.`,
          droppedLine,
        ].filter(Boolean).join('\n'))],
        components: [],
        allowedMentions: { parse: [] },
      });
    };

    collector.on('collect', (i) => {
      (async () => {
        const action = i.customId.split(':')[2];
        if (action === 'cancel') {
          started = true;
          collector.stop('cancelled');
          return i.update({ embeds: [embed('warning').setTitle(title).setDescription(`${icon('warning')} The heist was called off.`)], components: [] });
        }
        if (action === 'go') {
          await i.deferUpdate();
          return start();
        }
        // Join (anyone): answer non-members privately right away
        if (crew.has(i.user.id)) return i.reply({ content: "You're already in the crew.", flags: MessageFlags.Ephemeral });
        const p = (await User.findById(i.user.id, null, { lean: true })) as unknown as Profile | null;
        const why = heistBlocker(p);
        if (why) return i.reply({ content: `${icon('error')} ${why}`, flags: MessageFlags.Ephemeral });
        if (crew.size >= heistRules.maxCrew) return i.reply({ content: 'The crew is full.', flags: MessageFlags.Ephemeral });
        crew.add(i.user.id);
        await i.update(lobby());
        if (crew.size >= heistRules.maxCrew) await start();
      })().catch((err) => logError('heist', err));
    });
    collector.on('end', (_c, reason) => {
      if (reason !== 'time' || started) return;
      if (crew.size >= heistRules.minCrew) start().catch((err) => logError('heist', err));
      else {
        started = true;
        interaction.editReply({ embeds: [embed('warning').setTitle(title).setDescription(`${icon('warning')} Nobody else joined. The heist was called off.`)], components: [] }).catch(() => undefined);
      }
    });
  },
});
