const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { promptMessage } = require('../../functions');
module.exports = {
  name: 'ban',
  description: 'Bans a member',
  async execute(message, args) {
    if (message.deletable) message.delete().catch(() => {});
    if (!args[0]) return message.reply('Please provide a person to ban.');

    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply('❌ You do not have permission to ban members.');
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.BanMembers))
      return message.reply('❌ I do not have permission to ban members.');

    const toBan = message.mentions.members.first();
    if (!toBan) return message.reply("Couldn't find that member.");
    if (toBan.id === message.author.id) return message.reply("You can't ban yourself...");
    if (!toBan.bannable) return message.reply("I can't ban that person due to their high role.");

    await message.channel.send(`Type a reason to ban ${toBan} below:`);
    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, max: 1, time: 15000 });

    collector.on('collect', async m => {
      const reason = m.content;
      const promptEmbed = new EmbedBuilder()
        .setColor('Green')
        .setDescription(`Do you want to ban ${toBan}? (This prompt expires in 30s)`);

      const msg = await message.channel.send({ embeds: [promptEmbed] });
      const emoji = await promptMessage(msg, message.author, 30, ['✅', '❌']);

      if (emoji === '✅') {
        await toBan.ban({ reason });
        const embed = new EmbedBuilder()
          .setColor('#ff0000')
          .setTimestamp()
          .setDescription(`**Banned:** ${toBan} (${toBan.id})\n**By:** ${message.member} (${message.member.id})\n**Reason:** ${reason}`);
        message.channel.send({ embeds: [embed] });
      } else {
        message.reply('Ban cancelled.');
      }
      msg.delete().catch(() => {});
    });
  }
};
