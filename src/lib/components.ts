import {
  ActionRowBuilder,
  ButtonBuilder,
  ComponentType,
  StringSelectMenuBuilder,
  type ActionRow,
  type Message,
  type MessageActionRowComponent,
} from 'discord.js';

type Row = ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>;

/** Copies a message's component rows with every button and select menu disabled. */
export function disabledRows(rows: readonly ActionRow<MessageActionRowComponent>[]): Row[] {
  return rows.map((row) => {
    const first = row.components[0];
    if (first?.type === ComponentType.StringSelect) {
      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        row.components.map((c) => StringSelectMenuBuilder.from(c as never).setDisabled(true)),
      );
    }
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      row.components
        .filter((c) => c.type === ComponentType.Button)
        .map((c) => ButtonBuilder.from(c as never).setDisabled(true)),
    );
  });
}

/** Disables all components on a message (used when a collector ends). Ignores deleted messages. */
export async function disableComponents(message: Message): Promise<void> {
  if (!message.components.length) return;
  const rows = message.components.filter((r): r is ActionRow<MessageActionRowComponent> => r.type === ComponentType.ActionRow);
  await message.edit({ components: disabledRows(rows) }).catch(() => undefined);
}
