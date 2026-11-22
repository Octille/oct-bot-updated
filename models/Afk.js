const mongoose = require('mongoose');

const afkSchema = new mongoose.Schema({
  userID:  String,
  guildID: String,
  reason:  { type: String, default: 'AFK' },
  since:   { type: Date, default: Date.now },
});

module.exports = mongoose.model('Afk', afkSchema);
