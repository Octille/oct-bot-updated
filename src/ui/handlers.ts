import { MessageFlags, type User } from 'discord.js';
import { defineComponent, type ComponentHandler } from '../framework/types';
import { getProfile, type Profile } from '../services/economy';
import { claimOnboardingReward } from '../services/onboarding';
import { itemName } from '../content/items';
import { icon } from '../lib/icons';
import { launchCommand } from '../framework/launch';
import { activities } from './activities';
import { hubExpired } from './screens/hub';
import { moduleFor, render } from './screens';
import type { Origin, Payload, ScreenCtx } from './kit';

function ctxFor(user: User, origin: Origin, profile: Profile, note?: string): ScreenCtx {
  return { owner: user.id, origin, profile, userName: user.globalName ?? user.username, note };
}

/** Opening the hub also hands out the First steps crate when it's been earned. */
async function hubPayload(user: User, profile: Profile, note?: string): Promise<Payload> {
  if (await claimOnboardingReward(profile)) {
    profile = await getProfile(user.id);
    note = [note, `${icon('success')} **First steps complete!** You got a free ${itemName('crate_common')}.`].filter(Boolean).join('\n');
  }
  return render('hub', ctxFor(user, 'h', profile, note));
}

/** The private welcome shown after a brand-new player's first command. */
export async function welcomeHub(user: User): Promise<Payload> {
  return hubPayload(user, await getProfile(user.id), '**Welcome to OctBot!** This is your menu. It shows what you can do right now; open it any time with `/menu`.');
}

export async function openHub(user: User): Promise<Payload> {
  return hubPayload(user, await getProfile(user.id));
}

/** Navigate: `ui:<owner>:<origin>:<path>`. Select menus append the chosen value to the path. */
const navigate = defineComponent({
  prefix: 'ui',
  async execute({ interaction, id, profile }) {
    if (interaction.isModalSubmit()) return;
    const [origin = 'c', base = 'hub'] = id.args;
    const path = interaction.isStringSelectMenu() ? `${base}.${interaction.values[0]}` : base;
    const payload = path === 'hub'
      ? await hubPayload(interaction.user, profile)
      : render(path, ctxFor(interaction.user, origin as Origin, profile));
    await interaction.update(payload);
  },
});

/** Act: `ua:<owner>:<origin>:<path>:<action>:<args...>`, then show the resulting screen. */
const act = defineComponent({
  prefix: 'ua',
  async execute({ interaction, id, profile }) {
    const [origin = 'c', path = 'hub', action = '', ...args] = id.args;
    const mod = moduleFor(path);
    if (!mod.act) return;
    const ctx = ctxFor(interaction.user, origin as Origin, profile);
    const result = await mod.act(path.split('.'), action, args, interaction, ctx);
    if ('handled' in result) return;

    const fresh = await getProfile(interaction.user.id);
    const payload = result.path === 'hub'
      ? await hubPayload(interaction.user, fresh, result.note)
      : render(result.path, { ...ctx, profile: fresh, note: result.note });
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
    else if (interaction.isModalSubmit()) {
      if (interaction.isFromMessage()) await interaction.update(payload);
      else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    } else await interaction.update(payload);
  },
});

/** Go: `go:<owner>:<target>[:<hub stamp>]` — start an activity (public) or open the hub (private). */
const go = defineComponent({
  prefix: 'go',
  async execute({ interaction, id }) {
    if (!interaction.isButton()) return;
    const [target = 'menu', stamp] = id.args;
    if (target === 'menu') {
      await interaction.reply({ ...(await openHub(interaction.user)), flags: MessageFlags.Ephemeral });
      return;
    }
    if (hubExpired(stamp)) {
      await interaction.reply({ content: `${icon('warning')} This menu has expired. Run \`/menu\` again for an up-to-date one.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const activity = activities.find((a) => a.id === target);
    await launchCommand(activity?.command ?? target, interaction);
  },
});

export const uiHandlers: ComponentHandler[] = [navigate, act, go];
