const { EmbedBuilder } = require('discord.js');

const categories = {
  economy:    { emoji: '💰', label: 'Economy',    folder: 'economy' },
  misc:       { emoji: '💡', label: 'Misc',        folder: 'Misc' },
  moderation: { emoji: '🔧', label: 'Moderation', folder: 'Moderation' },
  music:      { emoji: '🎶', label: 'Music',       folder: 'Music' },
};

module.exports = {
  name: 'help',
  aliases: ['h'],
  description: 'Shows help',
  async execute(message, args, cmd, client, profileData, settings) {
    const prefix = settings?.prefix || '!';

    // ── Main menu ──────────────────────────────────────────────────────────────
    if (!args.length) {
      const embed = new EmbedBuilder()
        .setAuthor({
          name: 'Oct Bot — Command List',
          iconURL: client.user.displayAvatarURL(),
        })
        .setDescription(`Use \`${prefix}help <category>\` to see commands in that category.\nUse \`${prefix}help <command>\` for info on a specific command.`)
        .addFields(
          Object.entries(categories).map(([key, { emoji, label }]) => ({
            name: `${emoji} ${label}`,
            value: `\`${prefix}help ${key}\``,
            inline: true,
          }))
        )
        .setColor('#5865F2')
        .setFooter({ text: `${client.commands.size} commands loaded` })
        .setTimestamp();
      return message.channel.send({ embeds: [embed] });
    }

    const key = args[0].toLowerCase();

    // ── Category listing ───────────────────────────────────────────────────────
    if (categories[key]) {
      const { emoji, label, folder } = categories[key];
      const commands = client.commands.filter(c => c.category === folder && !c.hidden);
      const cmds = commands.map(c => `\`${prefix}${c.name}\`${c.description ? ` — ${c.description}` : ''}`);

      const embed = new EmbedBuilder()
        .setAuthor({ name: `${emoji} ${label} Commands`, iconURL: client.user.displayAvatarURL() })
        .setDescription(cmds.join('\n') || 'No commands found.')
        .setColor('#5865F2')
        .setFooter({ text: `${commands.size} command${commands.size !== 1 ? 's' : ''} • Use ${prefix}help <command> for more info` });
      return message.channel.send({ embeds: [embed] });
    }

    // ── Individual command ─────────────────────────────────────────────────────
    const command = client.commands.get(key) || client.commands.find(c => c.aliases?.includes(key));
    if (!command) return message.channel.send(`❌ Command \`${key}\` not found.`);

    const embed = new EmbedBuilder()
      .setAuthor({ name: `Command: ${command.name}`, iconURL: client.user.displayAvatarURL() })
      .setColor('#5865F2');

    if (command.description) embed.setDescription(command.description);

    embed.addFields(
      { name: '📌 Usage', value: `\`${prefix}${command.name}\``, inline: true },
      ...(command.aliases?.length ? [{ name: '🔀 Aliases', value: command.aliases.map(a => `\`${a}\``).join(', '), inline: true }] : []),
      ...(command.cooldown ? [{ name: '⏱️ Cooldown', value: `\`${command.cooldown}s\``, inline: true }] : []),
    );

    return message.channel.send({ embeds: [embed] });
  },
};