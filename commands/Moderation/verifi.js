const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'reactionrole',
  description: 'Sets up a reaction role message!',
  async execute(message, args, cmd, client) {
    message.delete().catch(() => {});
    const channelId = '786657488304341023';
    const role = message.guild.roles.cache.find(r => r.name === 'Nons');
    const emoji = '✅';

    const embed = new EmbedBuilder()
      .setColor('#e42643')
      .setTitle('Verification!')
      .setDescription('To get access to the server, react with the ✅ emoji.\nPlease read the rules before verifying.');

    const msg = await message.channel.send({ embeds: [embed] });
    await msg.react(emoji);

    const collector = msg.createReactionCollector({ filter: (r, u) => !u.bot && r.emoji.name === emoji });

    collector.on('collect', async (reaction, user) => {
      const member = message.guild.members.cache.get(user.id);
      if (member && reaction.message.channel.id === channelId) {
        await member.roles.add(role).catch(console.error);
      }
    });
    collector.on('remove', async (reaction, user) => {
      const member = message.guild.members.cache.get(user.id);
      if (member && reaction.message.channel.id === channelId) {
        await member.roles.remove(role).catch(console.error);
      }
    });
  }
};
