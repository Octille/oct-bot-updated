const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
module.exports = {
  name: 'tictactoe',
  aliases: ['ttt'],
  description: 'Play Tic Tac Toe',
  async execute(message, args) {
    const opponent = message.mentions.members.first();
    if (!opponent) return message.channel.send('Please mention someone to play against.');
    if (opponent.id === message.author.id) return message.channel.send("You can't play against yourself!");

    const board = Array(9).fill(null);
    let currentPlayer = message.author;
    let currentSymbol = '❌';
    const symbols = { [message.author.id]: '❌', [opponent.id]: '⭕' };

    const renderBoard = () => {
      const rows = [];
      for (let r = 0; r < 3; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 3; c++) {
          const i = r * 3 + c;
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`ttt_${i}`)
              .setLabel(board[i] || '‎')
              .setStyle(board[i] === '❌' ? ButtonStyle.Danger : board[i] === '⭕' ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setDisabled(board[i] !== null)
          );
        }
        rows.push(row);
      }
      return rows;
    };

    const checkWinner = () => {
      const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      for (const [a,b,c] of wins) if (board[a] && board[a] === board[b] && board[b] === board[c]) return board[a];
      return board.every(Boolean) ? 'tie' : null;
    };

    const embed = new EmbedBuilder()
      .setTitle('Tic Tac Toe')
      .setDescription(`${message.author} ❌ vs ${opponent} ⭕\n\nTurn: ${currentPlayer}`)
      .setColor('Blue');

    const msg = await message.channel.send({ embeds: [embed], components: renderBoard() });

    const collector = msg.createMessageComponentCollector({ time: 60000 });
    collector.on('collect', async interaction => {
      if (interaction.user.id !== currentPlayer.id) {
        return interaction.reply({ content: "It's not your turn!", ephemeral: true });
      }
      const index = parseInt(interaction.customId.split('_')[1]);
      board[index] = symbols[currentPlayer.id];

      const winner = checkWinner();
      if (winner) {
        const resultText = winner === 'tie' ? "It's a tie! 🤝" : `${currentPlayer} wins! ${winner}`;
        embed.setDescription(resultText).setColor(winner === 'tie' ? 'Yellow' : 'Green');
        const disabledRows = renderBoard().map(row => {
          row.components.forEach(b => b.setDisabled(true));
          return row;
        });
        await interaction.update({ embeds: [embed], components: disabledRows });
        return collector.stop();
      }

      currentPlayer = currentPlayer.id === message.author.id ? opponent.user : message.author;
      currentSymbol = currentPlayer.id === message.author.id ? '❌' : '⭕';
      embed.setDescription(`${message.author} ❌ vs ${opponent} ⭕\n\nTurn: ${currentPlayer}`);
      await interaction.update({ embeds: [embed], components: renderBoard() });
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        embed.setDescription('Game timed out!').setColor('Red');
        const disabledRows = renderBoard().map(row => { row.components.forEach(b => b.setDisabled(true)); return row; });
        msg.edit({ embeds: [embed], components: disabledRows }).catch(() => {});
      }
    });
  }
};
