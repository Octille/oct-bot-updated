const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  guildID: String,
  guildName: String,
  prefix: { type: String, default: '!' },
  welcomeID: { type: String, default: '0' },
  InviteLinks: { type: Number, default: 0 }
});

module.exports = mongoose.model('Guild', guildSchema, 'guilds');
