module.exports = {
  name: 'createinvite',
  aliases: ['ci'],
  description: 'Create an invite link for this channel',
  async execute(message) {
    try {
      const invite = await message.channel.createInvite();
      message.channel.send(`Invite URL for this channel: ${invite.url}`);
    } catch {
      message.channel.send('I do not have permission to create invites here.');
    }
  },
};
