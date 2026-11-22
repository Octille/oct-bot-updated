const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'kyle',
  description: "Kyle's server rules",
  async execute(message) {
    message.channel.send({ embeds: [new EmbedBuilder()
      .setTitle('Oh')
      .setColor(0x0000FF)
      .setDescription([
        '1. There is no room for your political or religious views. Political or religious views will earn you a ban.',
        '2. Be nice to each other and respect the moderators.',
        '3. Profanity and insults will not be tolerated. If you have a problem with another member, turn to a moderator, and if the moderator can\'t help you, send a private message to an administrator.',
        '4. Instructions by the moderator team are to be followed. Do not use the server to post any material which is knowingly false and/or defamatory, inaccurate, rude, disrespectful, abusive, vulgar, hateful, harassing, obscene, profane, sexist, racist, discriminatory, sexually-oriented, threatening, invasive of a person\'s privacy, or otherwise in violation of any law.',
        '5. Absolutely NO flaming. Posts containing hostile language or rudeness directed at staff or other members will not be tolerated. All flames will be immediately deleted and posters who engage in flaming will be issued an official warning from staff.',
        '6. Threatening posters: users who make physical threats against staff or members via posts or direct messages will be immediately banned from the server. Members who receive such threats should immediately contact a staff member and save the original copy of the threat.',
        '7. Links to content of a questionable nature, or asking for/offering help with such content in any way or form, are not tolerated.',
        '8. NO SOLICITING of any drugs, inappropriate content, etc.',
        '9. No promoting streams outside of the promote-your-stream channel. No begging for followers or for people to sub and/or donate to you.',
      ].join('\n\n'))] });
  },
};
