const { PermissionFlagsBits } = require('discord.js');
module.exports = {
  name: 'hangman',
  description: 'Start a hangman game',
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
      return message.channel.send('You need Manage Messages permission to start hangman.');
    const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
    if (!channel) return message.channel.send('Please specify a channel.');
    const word = args.slice(1).join(' ');
    if (!word) return message.channel.send('Please specify a word to guess.');
    message.delete().catch(() => {});

    let guessed = [];
    let wrong = 0;
    const maxWrong = 6;
    const display = () => word.split('').map(l => (guessed.includes(l) ? l : '_')).join(' ');
    const stages = ['😊', '😟', '😰', '😱', '💀', '☠️', '👻'];

    const gameMsg = await channel.send(
      `🎮 **Hangman!** ${stages[wrong]}\n\`${display()}\`\nWrong guesses: \`${wrong}/${maxWrong}\`\nGuessed: none\nType a letter to guess!`
    );

    const filter = m => m.author.id !== message.client.user.id && /^[a-zA-Z]$/.test(m.content);
    const collector = channel.createMessageCollector({ filter, time: 120000 });

    collector.on('collect', async m => {
      const letter = m.content.toLowerCase();
      m.delete().catch(() => {});
      if (guessed.includes(letter)) return;
      guessed.push(letter);
      if (!word.includes(letter)) wrong++;
      const current = display();
      const won = !current.includes('_');
      const lost = wrong >= maxWrong;
      await gameMsg.edit(
        `🎮 **Hangman!** ${stages[Math.min(wrong, stages.length - 1)]}\n\`${current}\`\nWrong guesses: \`${wrong}/${maxWrong}\`\nGuessed: ${guessed.join(', ')}`
        + (won ? '\n\n🎉 **You win!**' : lost ? `\n\n💀 **Game over!** The word was \`${word}\`` : '')
      );
      if (won || lost) collector.stop();
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') gameMsg.edit(gameMsg.content + `\n\n⏰ **Time\'s up!** The word was \`${word}\``);
    });
  }
};
