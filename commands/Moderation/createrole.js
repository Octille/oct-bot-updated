const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { awaitReply } = require('../../utils');

const COLOURS = {
  '⚫': '#23272A', '🔴': '#ED4245', '🟠': '#E67E22', '🟡': '#FEE75C', '🟢': '#57F287',
  '🔵': '#3498DB', '🟣': '#9B59B6', '🟤': '#8B5A2B', '⚪': '#FFFFFF',
};

module.exports = {
  name: 'createrole',
  aliases: ['cr'],
  description: 'Create a role with a name and colour',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.channel.send('You need the **Manage Roles** permission to run this command!');
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
      return message.channel.send('I need the **Manage Roles** permission to create roles.');

    let name = args.join(' ');
    if (!name) {
      await message.channel.send('Provide a role name.');
      const reply = await awaitReply(message.channel, message.author, 30);
      if (!reply) return message.channel.send('No name provided, cancelled.');
      name = reply.content;
    }

    const prompt = await message.channel.send(`Your role name has been set to \`${name}\`, now react with the colour you want the role to be.`);
    for (const emoji of Object.keys(COLOURS)) await prompt.react(emoji).catch(() => {});

    const collected = await prompt.awaitReactions({
      filter: (r, u) => u.id === message.author.id && COLOURS[r.emoji.name],
      max: 1, time: 30000,
    });
    const emoji = collected.first()?.emoji.name;
    if (!emoji) return message.channel.send('No colour chosen, cancelled.');

    const role = await message.guild.roles.create({ name, color: COLOURS[emoji], reason: `Created by ${message.author.tag}` });
    message.channel.send({ embeds: [new EmbedBuilder().setTitle('Role created').setDescription(`Created ${role}`).setColor(COLOURS[emoji])] });
  },
};
