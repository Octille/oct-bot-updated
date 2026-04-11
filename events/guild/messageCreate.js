const profileModel = require('../../models/profileSchema');
const Guild = require('../../models/guild');
const mongoose = require('mongoose');
const { Collection, EmbedBuilder } = require('discord.js');

const cooldowns = new Collection();

module.exports = async (client, message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  // Delete messages in the ticket-creation channel
  if (message.channel.id === '820435226227638302') {
    message.delete().catch(() => {});
  }

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
      message.channel.send('This server was not in our database! I have now added it, and your command will still work.')
        .then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
  } catch (err) {
    console.error('[MessageCreate] Guild settings error:', err);
    settings = { prefix: process.env.PREFIX || '!' };
  }

  // Invite link filter
  if (message.content.includes('discord.gg/') || message.content.includes('discordapp.com/invite/')) {
    if (settings.InviteLinks < 1) {
      message.delete().catch(() => {});
      message.channel.send(`${message.author} Invite links are not allowed on this server`);
    }
  }

  // Mention response with settings
  if (message.mentions.users.has(client.user.id) && message.content.includes('whatsmysettings')) {
    let welcome = settings.WelcomeCID || 'no welcome message setup';
    let invitelinks = settings.InviteLinks == '1' ? 'on' : 'off';
    const embed = new EmbedBuilder()
      .setTitle('Oh, looks like I was mentioned! Here are my settings:')
      .setDescription(`Prefix: \`${settings.prefix}\`\nWelcome Channel: \`${welcome}\`\nInvite Links: \`${invitelinks}\``);
    return message.channel.send({ embeds: [embed] });
  }

  const prefix = settings.prefix || '!';
  if (!message.content.startsWith(prefix)) return;

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

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  const command = client.commands.get(cmd) || client.commands.find(a => a.aliases && a.aliases.includes(cmd));

  if (!command) {
    return message.channel.send('Command not found. Please refer to `!help`');
  }

  // Cooldown handling
  if (!cooldowns.has(command.name)) cooldowns.set(command.name, new Collection());
  const now = Date.now();
  const timestamps = cooldowns.get(command.name);
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
