import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { icon, titleIcon } from '../../lib/icons';
import { embed } from '../../lib/embeds';
import { bar, coins } from '../../lib/format';
import { UserError } from '../../lib/errors';
import { petRules, pets, type PetSpecies } from '../../content/pets';
import { adoptPet, carePet, petHappiness, petPerk, releasePet, renamePet } from '../../services/pets';
import { unlockLevel } from '../../services/progression';
import { back, btn, DANGER, ids, MAIN, NAV, row, select, type Payload, type ScreenCtx } from '../kit';
import type { ScreenModule } from './types';

const SPECIES = Object.keys(pets) as PetSpecies[];

function adoptView(ctx: ScreenCtx): Payload {
  const level = unlockLevel(ctx.profile);
  const e = embed('economy').setTitle(`${titleIcon('pet')} Pet`).setDescription([
    ctx.note,
    "You don't have a pet yet. Keep it happy (feed and play) and it helps you out; its perk grows as it levels up.",
    '',
    ...SPECIES.map((s) => `${pets[s].emoji} **${pets[s].name}** · ${coins(pets[s].price)}\n-# ${pets[s].perk}`),
    level < petRules.minLevel ? `\n${icon('locked')} Pets unlock at account level ${petRules.minLevel}.` : null,
  ].filter((l) => l !== null && l !== undefined).join('\n'));
  const components = [];
  if (level >= petRules.minLevel) {
    components.push(select(ids.act(ctx.owner, ctx.origin, 'pet', 'adopt'), 'Adopt a pet…', SPECIES.map((s) => ({
      label: `${pets[s].name} · ${coins(pets[s].price)}`, value: s, description: pets[s].perk, emoji: pets[s].emoji,
    }))));
  }
  components.push(row(back(ctx, null)));
  return { embeds: [e], components };
}

function petView(ctx: ScreenCtx): Payload {
  const p = ctx.profile;
  const pet = p.pet!;
  const info = pets[pet.species as PetSpecies];
  const now = Date.now();
  const happy = petHappiness(p, now);
  const perk = petPerk(p, pet.species as PetSpecies, now);
  const level = pet.level ?? 1;
  const ready = (at: Date | null | undefined, hours: number) => !at || new Date(at).getTime() + hours * 3_600_000 <= now;
  const perkText = perk > 0
    ? `${icon('success')} Perk active: ${info.perk.toLowerCase()} (${pet.species === 'cat' ? `+${perk.toFixed(1)} luck` : `${Math.round(perk * 100)}%`})`
    : `${icon('warning')} ${pet.name} is unhappy, so its perk is off. Feed or play with it.`;
  const e = embed('economy').setTitle(`${titleIcon('pet')} Pet › ${pet.name}`).setDescription([
    ctx.note,
    `${info.emoji} **${pet.name}** the ${info.name} · Level ${level}${level >= petRules.maxLevel ? ' (max)' : ''}`,
    `Happiness ${bar(happy, 100)} ${happy}%`,
    level < petRules.maxLevel ? `XP ${bar(pet.xp ?? 0, petRules.xpToNext(level))} ${pet.xp ?? 0} / ${petRules.xpToNext(level)}` : null,
    '',
    perkText,
    `-# Happiness drops ${petRules.decayPerHour}% an hour. Feeding: +${petRules.feed.happiness}% every ${petRules.feed.cooldownHours}h. Playing: +${petRules.play.happiness}% every ${petRules.play.cooldownHours}h.`,
  ].filter((l) => l !== null && l !== undefined).join('\n'));
  const fedReady = ready(pet.fedAt, petRules.feed.cooldownHours);
  const playReady = ready(pet.playedAt, petRules.play.cooldownHours);
  return {
    embeds: [e],
    components: [row(
      back(ctx, null),
      btn(ids.act(ctx.owner, ctx.origin, 'pet', 'rename'), 'Rename', NAV),
      btn(ids.nav(ctx.owner, ctx.origin, 'pet.release'), 'Release', NAV),
      btn(ids.act(ctx.owner, ctx.origin, 'pet', 'play'), playReady ? 'Play' : 'Play later', MAIN, { disabled: !playReady }),
      btn(ids.act(ctx.owner, ctx.origin, 'pet', 'feed'), fedReady ? `Feed · ${coins(petRules.feed.cost)}` : 'Fed recently', MAIN, { disabled: !fedReady }),
    )],
  };
}

function releaseView(ctx: ScreenCtx): Payload {
  const pet = ctx.profile.pet!;
  return {
    embeds: [embed('economy').setTitle(`${titleIcon('pet')} Pet › Release ${pet.name}?`).setDescription(`${icon('warning')} ${pet.name} will leave for good. Its level is lost, and there's no refund.`)],
    components: [row(back(ctx, 'pet'), btn(ids.act(ctx.owner, ctx.origin, 'pet', 'release'), `Release ${pet.name}`, DANGER))],
  };
}

/** pet · pet.release */
export const petScreen: ScreenModule = {
  render(path, ctx) {
    if (!ctx.profile.pet?.species) return adoptView(ctx);
    if (path[1] === 'release') return releaseView(ctx);
    return petView(ctx);
  },

  async act(_path, action, _args, interaction, ctx) {
    try {
      switch (action) {
        case 'adopt': {
          if (!interaction.isStringSelectMenu()) return { path: 'pet' };
          const species = interaction.values[0] as PetSpecies;
          await adoptPet(ctx.owner, species, pets[species].name);
          return { path: 'pet', note: `${icon('success')} Welcome home! Rename your ${pets[species].name.toLowerCase()} any time.` };
        }
        case 'feed':
        case 'play': {
          const r = await carePet(ctx.owner, action);
          return { path: 'pet', note: `${icon('success')} ${action === 'feed' ? 'Fed' : 'Played with'} ${ctx.profile.pet?.name}. Happiness ${r.happiness}%.${r.levelUp ? ' **Level up!**' : ''}` };
        }
        case 'rename': {
          if (!interaction.isButton()) return { path: 'pet' };
          const input = new TextInputBuilder().setCustomId('name').setLabel('New name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setValue(ctx.profile.pet?.name ?? '');
          await interaction.showModal(new ModalBuilder().setCustomId(ids.act(ctx.owner, ctx.origin, 'pet', 'renamesub')).setTitle('Rename your pet').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input)));
          return { handled: true };
        }
        case 'renamesub': {
          if (!interaction.isModalSubmit()) return { path: 'pet' };
          const name = interaction.fields.getTextInputValue('name');
          await renamePet(ctx.owner, name);
          return { path: 'pet', note: `${icon('success')} Renamed to **${name.trim().slice(0, 20)}**.` };
        }
        case 'release':
          await releasePet(ctx.owner);
          return { path: 'pet', note: 'Your pet has gone to a good home.' };
      }
    } catch (err) {
      if (err instanceof UserError) return { path: 'pet', note: `${icon('error')} ${err.message}` };
      throw err;
    }
    return { path: 'pet' };
  },
};
