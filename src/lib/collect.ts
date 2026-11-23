import {
  ComponentType,
  type ButtonInteraction,
  type Message,
  type StringSelectMenuInteraction,
  type InteractionCollector,
} from 'discord.js';
import { disableComponents } from './components';
import { ANYONE, parseId } from './customId';

type Collected = ButtonInteraction | StringSelectMenuInteraction;

/**
 * Collects button/select presses on a message from the component's owner only
 * (the router tells everyone else "this isn't yours"), and disables the components when it ends.
 * Use `~prefix` custom IDs for components handled this way.
 */
export function collect(
  message: Message,
  opts: { time: number; max?: number; idle?: number; disableOnEnd?: boolean },
): InteractionCollector<Collected> {
  const collector = message.createMessageComponentCollector({
    time: opts.time,
    max: opts.max,
    idle: opts.idle,
    filter: (i) => {
      if (i.componentType !== ComponentType.Button && i.componentType !== ComponentType.StringSelect) return false;
      const { ownerId } = parseId(i.customId);
      return ownerId === ANYONE || ownerId === i.user.id;
    },
  }) as InteractionCollector<Collected>;

  if (opts.disableOnEnd !== false) {
    collector.on('end', () => {
      disableComponents(message).catch(() => undefined);
    });
  }
  return collector;
}
