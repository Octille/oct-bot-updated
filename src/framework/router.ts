import { MessageFlags, type Client, type Interaction, type ChatInputCommandInteraction } from 'discord.js';
import { env } from '../config/env';
import { UserError } from '../lib/errors';
import { ANYONE, parseId } from '../lib/customId';
import { duration, relative } from '../lib/format';
import { logError } from '../lib/logger';
import { loadProfile, loadProfileDetailed } from '../services/economy';
import { welcomeHub } from '../ui/handlers';
import * as cooldowns from '../services/cooldowns';
import { commandRegistry, componentRegistry } from './registry';
import { setCommandRunner } from './commandList';
import { respondError } from './respond';
import { icon } from '../lib/icons';
import type { ComponentInteraction } from './types';

/** How long to wait before telling someone a collector-managed button has expired. */
const EXPIRED_GRACE_MS = 2_500;

export async function routeInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand()) return runCommand(interaction);
  if (interaction.isAutocomplete()) {
    const command = commandRegistry.get(interaction.commandName);
    await command?.autocomplete?.(interaction).catch((err) => logError(`autocomplete /${interaction.commandName}`, err));
    return;
  }
  if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
    return runComponent(interaction);
  }
}

/** Runs a slash command (or a button that launches one — see framework/launch.ts). */
export async function runCommand(interaction: ChatInputCommandInteraction, command = commandRegistry.get(interaction.commandName)): Promise<void> {
  if (!command) return respondError(interaction, 'That command no longer exists.');

  let claimedCooldown = false;
  try {
    if (command.guildOnly && !interaction.inGuild()) throw new UserError('That command only works in a server.');
    if (command.ownerOnly && interaction.user.id !== env.OWNER_ID) throw new UserError('Only the bot owner can use that.');

    if (command.defer) {
      await interaction.deferReply(command.defer === 'ephemeral' ? { flags: MessageFlags.Ephemeral } : {});
    }

    const { profile, created } = await loadProfileDetailed(interaction.user.id);
    if (created) newPlayers.add(interaction.user.id);

    if (command.blockedInJail && profile.jailUntil && profile.jailUntil.getTime() > Date.now()) {
      throw new UserError(`You're in jail. You'll be released ${relative(profile.jailUntil)}, or pay your way out with \`/bail\`.`);
    }

    if (command.cooldown) {
      const result = await cooldowns.claim(interaction.user.id, command.cooldown.key, command.cooldown.seconds * 1000);
      if (!result.ok) {
        throw new UserError(`\`/${command.data.name}\` is ready again in **${duration(result.remainingMs)}** (${relative(result.expiresAt)}).`);
      }
      claimedCooldown = true;
    }

    await command.execute({ interaction, client: interaction.client, profile });
    await greetNewPlayer(interaction);
  } catch (err) {
    await greetNewPlayer(interaction);
    if (claimedCooldown && command.cooldown) {
      await cooldowns.release(interaction.user.id, command.cooldown.key).catch(() => undefined);
    }
    if (err instanceof UserError) return respondError(interaction, err.message);
    logError(`/${interaction.commandName}`, err);
    return respondError(interaction, 'Something went wrong running that command. It has been reported.');
  }
}

setCommandRunner((interaction, command) => runCommand(interaction, command));

/** Players whose profile was created by this command; they get a private welcome hub. */
const newPlayers = new Set<string>();

async function greetNewPlayer(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!newPlayers.delete(interaction.user.id)) return;
  await interaction.followUp({ ...(await welcomeHub(interaction.user)), flags: MessageFlags.Ephemeral }).catch(() => undefined);
}

async function runComponent(interaction: ComponentInteraction): Promise<void> {
  const id = parseId(interaction.customId);

  if (id.ownerId !== ANYONE && id.ownerId !== interaction.user.id) {
    await interaction.reply({ content: `${icon('error')} This isn't yours — run the command yourself.`, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    return;
  }

  // Collector-managed components (`~prefix`) are handled by the collector that created them.
  // If nothing answers within the grace period, the collector is gone (ended or bot restarted).
  if (id.prefix.startsWith('~')) {
    setTimeout(() => {
      if (interaction.replied || interaction.deferred) return;
      interaction
        .reply({ content: `${icon('warning')} This has expired. Run the command again.`, flags: MessageFlags.Ephemeral })
        .catch(() => undefined);
    }, EXPIRED_GRACE_MS);
    return;
  }

  const handler = componentRegistry.get(id.prefix);
  if (!handler) {
    await interaction.reply({ content: `${icon('warning')} This has expired.`, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    return;
  }

  try {
    const profile = await loadProfile(interaction.user.id);
    await handler.execute({ interaction, client: interaction.client, id, profile });
  } catch (err) {
    if (err instanceof UserError) return respondError(interaction, err.message);
    logError(`component ${id.prefix}`, err);
    return respondError(interaction, 'Something went wrong. It has been reported.');
  }
}
