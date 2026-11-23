const profileModel = require('../../models/profileSchema');
const Guild = require('../../models/guild');
const Afk = require('../../models/Afk');
const mongoose = require('mongoose');
const { Collection, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = async (client, message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Fetch or create guild settings
  let settings;
  try {
    settings = await Guild.findOne({ guildID: message.guild.id });
    if (!settings) {
      settings = await new Guild({
        _id: new mongoose.Types.ObjectId(),
        guildID: message.guild.id,
        guildName: message.guild.name,
        prefix: process.env.PREFIX || '!',
        InviteLinks: 0,
      }).save();
    }
  } catch (err) {
    console.error('[MessageCreate] Guild settings error:', err);
    settings = { prefix: process.env.PREFIX || '!' };
  }

  // Invite link filter (moderators are exempt)
  if (message.content.includes('discord.gg/') || message.content.includes('discordapp.com/invite/')) {
    if (settings.InviteLinks < 1 && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      message.delete().catch(() => {});
      message.channel.send(`${message.author} Invite links are not allowed on this server`);
    }
  }

  await handleAfk(message);

  const prefix = settings.prefix || '!';
  const mentionRegex = new RegExp(`^<@!?${client.user.id}>\\s*`);

  // A bare mention shows the server settings
  if (mentionRegex.test(message.content) && !message.content.replace(mentionRegex, '').trim()) {
    const welcome = settings.welcomeID && settings.welcomeID !== '0' ? `<#${settings.welcomeID}>` : 'no welcome message setup';
    const invitelinks = settings.InviteLinks == '1' ? 'on' : 'off';
    const embed = new EmbedBuilder()
      .setTitle('Here are my settings:')
      .setDescription(`Prefix: \`${prefix}\`\nWelcome Channel: ${welcome}\nInvite Links: \`${invitelinks}\``);
    return message.channel.send({ embeds: [embed] });
  }

  // Commands work with either the prefix or a bot mention
  const prefixRegex = new RegExp(`^(<@!?${client.user.id}>\\s*|${escapeRegex(prefix)})`);
  const matched = message.content.match(prefixRegex);
  if (!matched) return;

  const args = message.content.slice(matched[0].length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  const command = client.commands.get(cmd) || client.commands.find(a => a.aliases && a.aliases.includes(cmd));

  if (!command) {
    return message.channel.send(`Command not found. Please refer to \`${prefix}help\``);
  }

  // Ensure user profile exists
  let profileData;
  try {
    profileData = await profileModel.findOne({ userID: message.author.id });
    if (!profileData) {
      profileData = await profileModel.create({
        userID: message.author.id,
        serverID: message.guild.id,
        coins: 1000,
        bank: 0,
        Company: { miners: 0, workers: 0 },
        Items: { Shirt: 1, Pants: 1 },
      });
      message.channel.send(`Oh no! ${message.author} looks like you weren't in my database, but don't worry — I've added you now, you can use my commands.`);
    }
  } catch (err) {
    console.log(err);
  }

  // Coin penalty for negative balance
  if (profileData && profileData.coins < 0) {
    message.channel.send('Looks like you lost all your coins and had a stroke. You paid the hospital half your bank.');
    const bank = profileData.bank;
    let half = bank < 2 ? 0 : bank * 0.5;
    await profileModel.findOneAndUpdate({ userID: message.author.id }, { $inc: { bank: -half }, $set: { coins: 0 } });
    return;
  }

  // Cooldown handling
  if (!client.cooldowns.has(command.name)) client.cooldowns.set(command.name, new Collection());
  const now = Date.now();
  const timestamps = client.cooldowns.get(command.name);
  const cooldownAmount = (command.cooldown || 3) * 1000;

  if (timestamps.has(message.author.id)) {
    const expirationTime = timestamps.get(message.author.id) + cooldownAmount;
    if (now < expirationTime) {
      const timeLeft = (expirationTime - now) / 1000;
      return message.reply(`Please wait \`${timeLeft.toFixed(1)}\` more second(s) before using **${command.name}** again.`);
    }
  }
  timestamps.set(message.author.id, now);
  setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

  try {
    await command.execute(message, args, cmd, client, profileData, settings);
  } catch (err) {
    console.error('Command execution error:', err);
    const targetChannel = client.channels.cache.get(message.channelId) || message.channel;
    if (targetChannel?.send) {
      targetChannel.send('There was an error executing that command.').catch(err2 => {
        console.error('Failed to send command error message:', err2);
      });
    }
  }
};

// Clears the author's AFK status and tells people when they ping someone who is AFK
async function handleAfk(message) {
  try {
    const own = await Afk.findOneAndDelete({ userID: message.author.id, guildID: message.guild.id });
    if (own) {
      const nick = message.member.displayName;
      if (nick.startsWith('[AFK] ')) message.member.setNickname(nick.slice(6)).catch(() => {});
      message.reply(`Welcome back! I removed your AFK status.`)
        .then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
    }

    const mentioned = message.mentions.users.filter(u => u.id !== message.author.id);
    if (!mentioned.size) return;
    const afks = await Afk.find({ guildID: message.guild.id, userID: { $in: [...mentioned.keys()] } });
    for (const afk of afks) {
      const since = Math.floor(new Date(afk.since).getTime() / 1000);
      message.channel.send(`💤 **${mentioned.get(afk.userID).username}** is AFK: ${afk.reason} (<t:${since}:R>)`);
    }
  } catch (err) {
    console.error('[AFK] Error:', err);
  }
}
