const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  guildID: String,
  guildName: String,
  prefix: { type: String, default: '!' },
  welcomeID: { type: String, default: '0' },
  InviteLinks: { type: Number, default: 0 },

  // Role given to every new member (!autorole)
  autoRoleID: { type: String, default: null },

  // Counting game (!counting)
  countingChannelID: { type: String, default: null },
  countingNumber:    { type: Number, default: 0 },

  // Reaction ticket panel (!ticketsetup)
  ticket: {
    messageID: { type: String, default: null },
    roleID:    { type: String, default: null },
    number:    { type: Number, default: 0 },
  },
});

module.exports = mongoose.model('Guild', guildSchema, 'guilds');
