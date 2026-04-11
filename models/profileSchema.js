const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  userID: { type: String, required: true, unique: true },
  serverID: { type: String, required: true },
  coins: { type: Number, default: 1000 },
  bank: { type: Number, default: 0 },
  Company: {
    miners: { type: Number, default: 0 },
    workers: { type: Number, default: 0 }
  },
  Items: {
    Shirt: { type: Number, default: 0 },
    Pants: { type: Number, default: 0 },
    Cookies: { type: Number, default: 0 },
    FishingRod: { type: Number, default: 0 },
    CommonFish: { type: Number, default: 0 },
    RareFish: { type: Number, default: 0 },
    MythicFish: { type: Number, default: 0 }
  },
  cooldowns: {
    Beg: { type: Date },
    Mine: { type: Date },
    Hourly: { type: Date }
  }
});

module.exports = mongoose.model('ProfileModels', profileSchema);
