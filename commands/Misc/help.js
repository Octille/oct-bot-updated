const { EmbedBuilder } = require('discord.js');
const { readdirSync } = require('fs');
module.exports = {
  name: 'help',
  aliases: ['h'],
  description: 'Shows help',
  async execute(message, args, cmd, client, profileData, settings) {
    const prefix = settings?.prefix || '!';
    if (!args.length) {
      const embed = new EmbedBuilder()
        .setAuthor({ name: 'Oct Bot Commands', iconURL: 'https://cdn.discordapp.com/avatars/741776473613926490/9254bec36f20830f7632e521b1ef8148.webp' })
        .addFields(
          { name: '💰 Economy', value: `\`${prefix}help economy\``, inline: true },
          { name: '😄 Fun', value: `\`${prefix}help fun\``, inline: true },
          { name: '🗺️ Minecraft', value: `\`${prefix}help minecraft\``, inline: true },
          { name: '🔧 Moderation', value: `\`${prefix}help moderation\``, inline: true },
          { name: '💡 Misc', value: `\`${prefix}help misc\``, inline: true },
          { name: '🎶 Music', value: `\`${prefix}help music\``, inline: true }
        )
        .setColor('Blue');
      return message.channel.send({ embeds: [embed] });
    }

    const folderMap = {
      economy: 'economy', fun: 'fun', misc: 'Misc', minecraft: 'Minecraft',
      moderation: 'Moderation', music: 'Music'
    };
    const titleMap = {
      economy: '💰 Economy', fun: '😄 Fun', misc: '💡 Misc', minecraft: '🗺️ Minecraft',
      moderation: '🔧 Moderation', music: '🎶 Music'
    };

    const key = args[0].toLowerCase();
    if (folderMap[key]) {
      try {
        const files = readdirSync(`./commands/${folderMap[key]}/`).filter(f => f.endsWith('.js') && f !== 'a.js');
        const cmds = files.map(f => `\`${f.replace('.js', '')}\``).join(', ');
        const embed = new EmbedBuilder()
          .setTitle(`${titleMap[key]} commands`)
          .setDescription(cmds)
          .setFooter({ text: `Use \`${prefix}\` before every command` });
        return message.channel.send({ embeds: [embed] });
      } catch {
        return message.channel.send('Could not load that category.');
      }
    }

    // Individual command help
    const command = client.commands.get(key) || client.commands.find(c => c.aliases?.includes(key));
    if (!command) return message.channel.send(`Command \`${key}\` not found.`);
    const data = [`**Name:** ${command.name}`];
    if (command.aliases) data.push(`**Aliases:** ${command.aliases.join(', ')}`);
    if (command.description) data.push(`**Description:** ${command.description}`);
    if (command.cooldown) data.push(`**Cooldown:** ${command.cooldown}s`);
    message.channel.send(data.join('\n'));
  }
};
