const { Chess } = require('chess.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const {
  AttachmentBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const C = {
  light: '#EEEED2',
  dark: '#769656',
  hlLight: '#F6F669',
  hlDark: '#BACA2B',
  border: '#272421',
  coordLight: '#769656',
  coordDark: '#EEEED2',
};

const SQ = 80;
const PAD = 24;
const SIZE = SQ * 8 + PAD * 2;

const PIECE_BASE = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/cburnett';
const pieceCache = new Map();
const games = new Map();

async function loadPiece(key) {
  if (pieceCache.has(key)) return pieceCache.get(key);
  const img = await loadImage(`${PIECE_BASE}/${key}.svg`);
  pieceCache.set(key, img);
  return img;
}

function pieceKey(piece) {
  return `${piece.color}${piece.type.toUpperCase()}`;
}

async function renderBoard(chess, lastMove = null, flipped = false) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = C.border;
  ctx.fillRect(0, 0, SIZE, SIZE);

  const hlSqs = new Set(lastMove ? [lastMove.slice(0, 2), lastMove.slice(2, 4)] : []);

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sqName = `${'abcdefgh'[file]}${8 - rank}`;
      const isLight = (rank + file) % 2 === 0;
      const col = flipped ? 7 - file : file;
      const row = flipped ? 7 - rank : rank;
      const x = PAD + col * SQ;
      const y = PAD + row * SQ;

      ctx.fillStyle = hlSqs.has(sqName)
        ? (isLight ? C.hlLight : C.hlDark)
        : (isLight ? C.light : C.dark);
      ctx.fillRect(x, y, SQ, SQ);

      ctx.font = 'bold 15px serif';
      const isBottomRow = row === 7;
      const isRightCol = col === 7;

      if (isBottomRow) {
        ctx.fillStyle = isLight ? C.coordLight : C.coordDark;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('abcdefgh'[file], x + 4, y + SQ - 4);
      }

      if (isRightCol) {
        ctx.fillStyle = isLight ? C.coordLight : C.coordDark;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(String(8 - rank), x + SQ - 4, y + 4);
      }
    }
  }

  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (!piece) continue;

      const col = flipped ? 7 - f : f;
      const row = flipped ? 7 - r : r;
      const x = PAD + col * SQ;
      const y = PAD + row * SQ;

      const img = await loadPiece(pieceKey(piece));
      ctx.drawImage(img, x, y, SQ, SQ);
    }
  }

  return canvas.toBuffer('image/png');
}

class Game {
  constructor(white, black) {
    this.chess = new Chess();
    this.white = white;
    this.black = black;
    this.lastMove = null;
    this.selected = null;
    this.boardMessage = null;
  }

  get turn() {
    return this.chess.turn();
  }

  get currentPlayer() {
    return this.turn === 'w' ? this.white : this.black;
  }

  get waitingPlayer() {
    return this.turn === 'w' ? this.black : this.white;
  }
}

function buildComponents(game) {
  const legal = game.chess.moves({ verbose: true });
  const fromSquares = [...new Set(legal.map(m => m.from))].slice(0, 25);

  const rows = [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('chess_piece')
        .setPlaceholder('Select a piece')
        .addOptions(fromSquares.map(s => ({
          label: `Piece on ${s}`,
          value: s,
        })))
    )
  ];

  if (game.selected) {
    const moves = game.chess.moves({ square: game.selected, verbose: true });
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('chess_move')
          .setPlaceholder(`Move ${game.selected}`)
          .addOptions(moves.map(m => ({
            label: `${m.from} → ${m.to}`,
            description: m.san,
            value: m.to,
          })).slice(0, 25))
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('chess_resign')
        .setLabel('Resign')
        .setStyle(ButtonStyle.Danger)
    )
  );

  return rows;
}

async function sendBoard(channel, game, caption = null) {
  const png = await renderBoard(game.chess, game.lastMove, game.turn === 'b');
  const file = new AttachmentBuilder(png, { name: 'board.png' });

  const embed = new EmbedBuilder()
    .setColor(0x769656)
    .setDescription(
      (caption ? caption + '\n\n' : '') +
      `🎮 **${game.turn === 'w' ? 'White' : 'Black'} to move** — <@${game.currentPlayer.id}>`
    )
    .setImage('attachment://board.png')
    .setFooter({ text: `⬜ ${game.white.username} vs ⬛ ${game.black.username}` });

  if (game.boardMessage) {
    try { await game.boardMessage.delete(); } catch {}
  }

  const sent = await channel.send({
    embeds: [embed],
    files: [file],
    components: buildComponents(game),
  });

  game.boardMessage = sent;
  return sent;
}

module.exports = {
  name: 'chess',
  description: 'Interactive chess',

  async execute(message) {
    const opponent = message.mentions.users.first();
    const cid = message.channel.id;

    if (!opponent) {
      return message.channel.send('❌ Mention someone to challenge. Example: `!chess @friend`');
    }

    const game = new Game(message.author, opponent);
    games.set(cid, game);
    return sendBoard(message.channel, game);
  },

  async handleInteraction(interaction) {
    if (!interaction.customId?.startsWith('chess_')) return;

    const game = games.get(interaction.channel.id);
    if (!game) {
      return interaction.reply({ content: '❌ No active game.', ephemeral: true });
    }

    if (interaction.user.id !== game.currentPlayer.id) {
      return interaction.reply({ content: '❌ Not your turn.', ephemeral: true });
    }

    if (interaction.customId === 'chess_piece') {
      game.selected = interaction.values[0];
      return interaction.update({ components: buildComponents(game) });
    }

    if (interaction.customId === 'chess_move') {
      const from = game.selected;
      const to = interaction.values[0];

      const move = game.chess.move({
        from,
        to,
        promotion: 'q',
      });

      if (!move) {
        return interaction.reply({ content: '❌ Illegal move.', ephemeral: true });
      }

      game.lastMove = from + to;
      game.selected = null;

      await interaction.deferUpdate();
      return sendBoard(interaction.channel, game, `✅ **${move.san} played**`);
    }

    if (interaction.customId === 'chess_resign') {
      const winner = game.waitingPlayer;
      games.delete(interaction.channel.id);
      await interaction.deferUpdate();

      if (game.boardMessage) {
        try { await game.boardMessage.delete(); } catch {}
      }

      return interaction.channel.send(`🏳️ <@${interaction.user.id}> resigned. <@${winner.id}> wins!`);
    }
  }
};