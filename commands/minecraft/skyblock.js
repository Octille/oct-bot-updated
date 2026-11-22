const { EmbedBuilder } = require('discord.js');
const colors = require('../../colors.json');
const { getUUID, hypixel, num, run } = require('../../functions/hypixel');

// XP needed for each skill level (levels 1–60)
const SKILL_XP = [
  50, 125, 200, 300, 500, 750, 1000, 1500, 2000, 3500, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000,
  200000, 300000, 400000, 500000, 600000, 700000, 800000, 900000, 1000000, 1100000, 1200000, 1300000, 1400000,
  1500000, 1600000, 1700000, 1800000, 1900000, 2000000, 2100000, 2200000, 2300000, 2400000, 2500000, 2600000,
  2750000, 2900000, 3100000, 3400000, 3700000, 4000000, 4300000, 4600000, 4900000, 5200000, 5500000, 5800000,
  6100000, 6400000, 6700000, 7000000,
];

function skillLevel(xp = 0) {
  let level = 0;
  for (const needed of SKILL_XP) {
    if (xp < needed) break;
    xp -= needed;
    level++;
  }
  return { level, progress: xp, next: SKILL_XP[level] };
}

async function getProfile(name) {
  const { id, name: realName } = await getUUID(name);
  const { profiles } = await hypixel('skyblock/profiles', { uuid: id });
  const profile = profiles?.find(p => p.selected) || profiles?.[0];
  if (!profile) throw Object.assign(new Error(), { friendly: `**${realName}** has no SkyBlock profiles (or their API is off).` });
  return { name: realName, profile, member: profile.members[id] };
}

module.exports = {
  name: 'skyblock',
  aliases: ['sb'],
  description: 'SkyBlock data: `bazaar <item>`, `stats <player>`, `skills <player>`',
  async execute(message, args, cmd, client, profileData, settings) {
    const sub = args[0]?.toLowerCase();
    const p = `${settings.prefix}skyblock`;

    if (sub === 'bazaar' || sub === 'bz') {
      const query = args.slice(1).join('_').toUpperCase();
      if (!query) return message.channel.send(`Please provide an item, e.g. \`${p} bazaar enchanted diamond\``);
      return run(message, async () => {
        const { products } = await hypixel('skyblock/bazaar', {}, false);
        const id = products[query] ? query : Object.keys(products).find(k => k.includes(query));
        if (!id) return message.channel.send('Could not find that item in the bazaar.');
        const qs = products[id].quick_status;
        message.channel.send({ embeds: [new EmbedBuilder()
          .setTitle(`Bazaar: ${id.replace(/_/g, ' ').toLowerCase()}`)
          .setColor(colors.MainColor)
          .addFields(
            { name: 'Instant Buy', value: `${num(Math.round(qs.buyPrice * 10) / 10)} coins`, inline: true },
            { name: 'Instant Sell', value: `${num(Math.round(qs.sellPrice * 10) / 10)} coins`, inline: true },
            { name: 'Weekly Volume', value: `${num(qs.buyMovingWeek)} bought / ${num(qs.sellMovingWeek)} sold` },
          )] });
      });
    }

    if (sub === 'stats' || sub === 'skills') {
      if (!args[1]) return message.channel.send('Please provide a player name.');
      return run(message, async () => {
        let data;
        try {
          data = await getProfile(args[1]);
        } catch (err) {
          if (err.friendly) return message.channel.send(`❌ ${err.friendly}`);
          throw err;
        }
        const { name, profile, member } = data;
        const xp = member.player_data?.experience || {};

        if (sub === 'skills') {
          const skills = Object.entries(xp).filter(([k]) => k.startsWith('SKILL_'));
          if (!skills.length) return message.channel.send(`**${name}** has their skills API turned off.`);
          const embed = new EmbedBuilder().setTitle(`Skills of ${name} (${profile.cute_name})`).setColor(colors.MainColor);
          for (const [key, value] of skills) {
            const { level, progress, next } = skillLevel(value);
            const label = key.slice(6).charAt(0) + key.slice(7).toLowerCase();
            embed.addFields({ name: `${label} ${level}`, value: next ? `${num(Math.floor(progress))} / ${num(next)} XP` : 'MAXED', inline: true });
          }
          return message.channel.send({ embeds: [embed] });
        }

        const skillLevels = Object.entries(xp).filter(([k]) => k.startsWith('SKILL_') && !['SKILL_RUNECRAFTING', 'SKILL_SOCIAL'].includes(k))
          .map(([, v]) => skillLevel(v).level);
        const avg = skillLevels.length ? (skillLevels.reduce((a, b) => a + b, 0) / skillLevels.length).toFixed(1) : 'API off';

        message.channel.send({ embeds: [new EmbedBuilder()
          .setTitle(`${name}'s SkyBlock Stats (${profile.cute_name})`)
          .setColor(colors.MainColor)
          .addFields(
            { name: 'SkyBlock Level', value: `${Math.floor((member.leveling?.experience || 0) / 100)}`, inline: true },
            { name: 'Skill Average', value: `${avg}`, inline: true },
            { name: 'Fairy Souls', value: num(member.fairy_soul?.total_collected), inline: true },
            { name: 'Purse', value: `${num(Math.floor(member.currencies?.coin_purse || 0))} coins`, inline: true },
            { name: 'Bank', value: profile.banking ? `${num(Math.floor(profile.banking.balance))} coins` : 'API off', inline: true },
            { name: 'Profile Type', value: profile.game_mode || 'normal', inline: true },
          )] });
      });
    }

    message.channel.send(`Use: \`${p} bazaar <item>\`, \`${p} stats <player>\`, or \`${p} skills <player>\``);
  },
};
