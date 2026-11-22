const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');
const { isOwner } = require('../../utils');

module.exports = {
  name: 'dev',
  aliases: ['devcommand'],
  hidden: true,
  description: 'Developer tools: cooldowns, resetcooldown, promote, demote, givecookie',
  async execute(message, args, cmd, client, profileData, settings) {
    const owner = isOwner(message.author.id);
    if (!owner && !profileData?.isDeveloper) return message.channel.send('Command is unavailable.');

    const sub = args[0]?.toLowerCase();
    const target = message.mentions.users.first();
    const p = settings.prefix;

    if (!sub || !target) {
      return message.channel.send({ embeds: [new EmbedBuilder()
        .setTitle('Developer commands')
        .setColor('Blue')
        .setDescription([
          `\`${p}dev cooldowns @user on|off\` — enable/disable cooldowns for a user`,
          `\`${p}dev resetcooldown @user [command]\` — clear a user's cooldowns`,
          `\`${p}dev givecookie @user <amount>\` — give 🍪 cookies`,
          `\`${p}dev promote @user\` / \`${p}dev demote @user\` — owner only`,
        ].join('\n'))] });
    }

    const update = (set) => profileModel.findOneAndUpdate(
      { userID: target.id },
      { ...set, $setOnInsert: { serverID: message.guild.id } },
      { upsert: true }
    );

    switch (sub) {
      case 'cooldowns':
      case 'cooldown': {
        const state = args.find(a => ['on', 'off', 'enable', 'disable'].includes(a?.toLowerCase()))?.toLowerCase();
        if (!state) {
          const data = await profileModel.findOne({ userID: target.id });
          return message.channel.send(`${target} has cooldowns ${data?.cooldownsDisabled ? 'disabled' : 'enabled'}.`);
        }
        const disabled = state === 'off' || state === 'disable';
        await update({ $set: { cooldownsDisabled: disabled } });
        return message.channel.send(`${disabled ? 'Disabled' : 'Enabled'} cooldowns for ${target}`);
      }
      case 'resetcooldown':
      case 'removecooldown': {
        const name = args.slice(1).find(a => !a.startsWith('<@'))?.toLowerCase();
        let cleared = 0;
        for (const [cmdName, timestamps] of client.cooldowns) {
          if (name && cmdName !== name) continue;
          if (timestamps.delete(target.id)) cleared++;
        }
        // Economy commands also keep their own cooldown timestamps in the profile
        const field = name ? `cooldowns.${name.charAt(0).toUpperCase()}${name.slice(1)}` : 'cooldowns';
        await profileModel.updateOne({ userID: target.id }, { $unset: { [field]: '' } });
        return message.channel.send(`Removed ${name ? `\`${name}\` cooldown` : 'all cooldowns'} for ${target}${cleared ? ` (${cleared} active)` : ''}.`);
      }
      case 'givecookie':
      case 'givecookies': {
        const amount = parseInt(args.find(a => /^\d+$/.test(a)));
        if (!amount || amount <= 0) return message.channel.send('Amount must be a positive whole number.');
        await update({ $inc: { 'Items.Cookies': amount } });
        return message.channel.send(`${target} has been given **🍪 ${amount.toLocaleString()}**`);
      }
      case 'promote':
      case 'demote': {
        if (!owner) return message.channel.send('Command is unavailable.');
        await update({ $set: { isDeveloper: sub === 'promote' } });
        return message.channel.send(`${target} has been ${sub === 'promote' ? 'promoted to `Developer`' : 'demoted to `User`'}.`);
      }
      default:
        return message.channel.send(`Unknown subcommand. Use \`${p}dev\` to see options.`);
    }
  },
};
