const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'meme',
  description: 'Sends a random meme',
  async execute(message) {
    const got = (await import('got')).default;
    const subreddits = ['dankmemes', 'me_irl'];
    const sub = subreddits[Math.floor(Math.random() * subreddits.length)];
    try {
      const response = await got(`https://www.reddit.com/r/${sub}/random/.json`, { responseType: 'json' });
      const post = response.body[0].data.children[0].data;
      const embed = new EmbedBuilder()
        .setTitle(post.title)
        .setURL(`https://reddit.com${post.permalink}`)
        .setImage(post.url)
        .setColor('Random')
        .setFooter({ text: `👍 ${post.ups}  👎 ${post.downs}  💬 ${post.num_comments}` });
      message.channel.send({ embeds: [embed] });
    } catch (err) {
      message.channel.send('Could not fetch a meme right now. Try again later!');
    }
  }
};
