const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'meme',
  description: 'Sends a random meme',
  async execute(message) {
    const subreddits = ['dankmemes', 'me_irl', 'memes'];
    const sub = subreddits[Math.floor(Math.random() * subreddits.length)];
    try {
      // Reddit removed its /random endpoint, so go through meme-api.com
      const res = await fetch(`https://meme-api.com/gimme/${sub}`);
      const post = await res.json();
      if (!post.url) throw new Error(post.message || 'no meme returned');
      const embed = new EmbedBuilder()
        .setTitle(post.title)
        .setURL(post.postLink)
        .setImage(post.url)
        .setColor('Random')
        .setFooter({ text: `👍 ${post.ups}  •  r/${post.subreddit}` });
      message.channel.send({ embeds: [embed] });
    } catch (err) {
      message.channel.send('Could not fetch a meme right now. Try again later!');
    }
  }
};
