const mongoose = require('mongoose');

const reactionRoleSchema = new mongoose.Schema({
  GuildID:   String,
  ChannelID: String,
  MessageID: String,
  Emoji:     String, // unicode emoji, or the custom emoji's id
  RoleID:    String,
});

module.exports = mongoose.model('ReactionRole', reactionRoleSchema);
