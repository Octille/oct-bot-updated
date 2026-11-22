const { AttachmentBuilder } = require('discord.js');
module.exports = {
  name: 'captcha',
  description: 'Turn someone into a captcha',
  async execute(message) {
    const user = message.mentions.users.first() || message.author;
    const avatar = user.displayAvatarURL({ extension: 'png', size: 512 });
    const loading = await message.channel.send('Loading...');
    try {
      const res = await fetch(`https://nekobot.xyz/api/imagegen?type=captcha&url=${encodeURIComponent(avatar)}&username=${encodeURIComponent(user.username)}`);
      const { message: url } = await res.json();
      await message.channel.send({ files: [new AttachmentBuilder(url, { name: 'captcha.png' })] });
    } catch (err) {
      console.error('[Captcha] Error:', err);
      message.channel.send('Could not generate a captcha right now.');
    }
    loading.delete().catch(() => {});
  },
};
