const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  userID:   { type: String, required: true, unique: true },
  serverID: { type: String, required: true },
  coins:    { type: Number, default: 1000 },
  bank:     { type: Number, default: 0 },

  // ── Progression ──────────────────────────────────────────────────────────
  xp:       { type: Number, default: 0 },
  level:    { type: Number, default: 1 },
  prestige: { type: Number, default: 0 },   // max 5, each grants +5% all income

  // ── Daily streak ─────────────────────────────────────────────────────────
  streak:       { type: Number, default: 0 },
  lastDaily:    { type: Date,   default: null },

  // ── Mining ───────────────────────────────────────────────────────────────
  Mine: {
    toolTier:   { type: Number, default: -1 },   // -1 = bare hands
    totalMined: { type: Number, default: 0  },
  },

  // ── Company ──────────────────────────────────────────────────────────────
  Company: {
    workers:          { type: Number, default: 0    },
    hasManager:       { type: Boolean, default: false },  // auto-collects wages
    lastCollected:    { type: Date,   default: null  },   // for manual !collect
    pendingWages:     { type: Number, default: 0     },   // accrued but uncollected
  },

  // ── Items ─────────────────────────────────────────────────────────────────
  Items: {
    Shirt:      { type: Number, default: 0 },
    Pants:      { type: Number, default: 0 },
    Cookies:    { type: Number, default: 0 },
    FishingRod: { type: Number, default: 0 },
    CommonFish: { type: Number, default: 0 },
    RareFish:   { type: Number, default: 0 },
    MythicFish: { type: Number, default: 0 },
  },

  // ── Cooldowns ─────────────────────────────────────────────────────────────
  cooldowns: {
    Beg:    { type: Date },
    Mine:   { type: Date },
    Hourly: { type: Date },
    Heist:  { type: Date },
    Rob:    { type: Date },
    Fish:   { type: Date },
  },

  // ── Jail ──────────────────────────────────────────────────────────────────
  jailUntil: { type: Date, default: null },
});

module.exports = mongoose.model('ProfileModels', profileSchema);