const { EmbedBuilder } = require('discord.js');
const profileModel = require('../../models/profileSchema');

const VOTE_REWARD = 500_000;
const VOTE_INTERVAL = 12 * 60 * 60 * 1000;

module.exports = {
  name: 'vote',
  aliases: ['didivote'],
  description: 'Vote for Oct Bot on top.gg, then claim your reward with !didivote',
  async execute(message, args, cmd, client, profileData, settings) {
    const voteURL = `https://top.gg/bot/${client.user.id}/vote`;

    if (cmd !== 'didivote') {
      return message.channel.send({ embeds: [new EmbedBuilder()
        .setColor('Orange')
        .setTitle('Vote for Oct Bot!')
        .setDescription(`Vote for Oct Bot on top.gg for free rewards!\n**Top.gg:** [click here](${voteURL})\n\nRewards: **₪ ${VOTE_REWARD.toLocaleString()}**`)
        .setFooter({ text: `After voting, claim your reward with ${settings.prefix}didivote.` })] });
    }

    if (!process.env.TOPGG_TOKEN) return message.channel.send('Vote rewards are not configured on this bot (missing `TOPGG_TOKEN`).');

    let voted;
    try {
      const res = await fetch(`https://top.gg/api/bots/${client.user.id}/check?userId=${message.author.id}`, {
        headers: { Authorization: process.env.TOPGG_TOKEN },
      });
      if (!res.ok) throw new Error(`top.gg returned ${res.status}`);
      voted = (await res.json()).voted === 1;
    } catch (err) {
      console.error('[Vote] top.gg error:', err.message);
      return message.channel.send('Could not reach top.gg right now. Try again later!');
    }

    if (!voted) {
      return message.channel.send({ embeds: [new EmbedBuilder()
        .setColor('Red')
        .setTitle("You haven't voted")
        .setDescription(`You can vote for me by clicking [here](${voteURL}).\nVoting gets you **₪ ${VOTE_REWARD.toLocaleString()}**!`)] });
    }

    const last = profileData.lastVoteClaim ? new Date(profileData.lastVoteClaim).getTime() : 0;
    if (Date.now() - last < VOTE_INTERVAL) {
      const next = Math.floor((last + VOTE_INTERVAL) / 1000);
      return message.channel.send({ embeds: [new EmbedBuilder()
        .setColor('Green')
        .setTitle('You have voted!')
        .setDescription(`You already claimed this vote's reward. You can vote again <t:${next}:R>.`)] });
    }

    await profileModel.updateOne({ userID: message.author.id }, { $inc: { coins: VOTE_REWARD }, $set: { lastVoteClaim: new Date() } });
    message.channel.send({ embeds: [new EmbedBuilder()
      .setColor('Green')
      .setTitle('Thank you for voting!')
      .setDescription(`As a reward you get **₪ ${VOTE_REWARD.toLocaleString()}**`)] });
  },
};
