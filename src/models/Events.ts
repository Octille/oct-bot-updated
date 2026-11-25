import { Schema, model } from 'mongoose';

/** A chat drop waiting to be grabbed. The status flips exactly once. */
const dropSchema = new Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, default: null },
    coins: { type: Number, default: 0 },
    item: { type: String, default: null },
    status: { type: String, enum: ['open', 'claimed', 'expired'], default: 'open' },
    claimedBy: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'drops', timestamps: true, versionKey: false },
);
dropSchema.index({ status: 1, expiresAt: 1 });
export const Drop = model('Drop', dropSchema);

/** A server's weekly boss. `damage` maps user id → damage dealt. */
const raidSchema = new Schema(
  {
    guildId: { type: String, required: true },
    week: { type: Number, required: true },
    bossId: { type: String, required: true },
    maxHp: { type: Number, required: true },
    hp: { type: Number, required: true },
    damage: { type: Map, of: Number, default: () => new Map() },
    status: { type: String, enum: ['active', 'defeated', 'escaped'], default: 'active' },
    endsAt: { type: Date, required: true },
    channelId: { type: String, default: null },
    /** The result has been posted in the events channel. */
    announced: { type: Boolean, default: false },
    /** "A boss appears" has been posted. */
    opened: { type: Boolean, default: false },
  },
  { collection: 'raids', timestamps: true, versionKey: false },
);
raidSchema.index({ guildId: 1, week: 1 }, { unique: true });
raidSchema.index({ status: 1, endsAt: 1 });
raidSchema.index({ status: 1 }, { partialFilterExpression: { announced: false } });
export const Raid = model('Raid', raidSchema);

/** A server's weekly community goal. `contributors` maps user id → contributions. */
const goalSchema = new Schema(
  {
    guildId: { type: String, required: true },
    week: { type: Number, required: true },
    metric: { type: String, required: true },
    target: { type: Number, required: true },
    progress: { type: Number, default: 0 },
    contributors: { type: Map, of: Number, default: () => new Map() },
    status: { type: String, enum: ['active', 'done', 'failed'], default: 'active' },
    endsAt: { type: Date, required: true },
    channelId: { type: String, default: null },
    announced: { type: Boolean, default: false },
    opened: { type: Boolean, default: false },
  },
  { collection: 'community_goals', timestamps: true, versionKey: false },
);
goalSchema.index({ guildId: 1, week: 1 }, { unique: true });
goalSchema.index({ status: 1, endsAt: 1 });
goalSchema.index({ status: 1 }, { partialFilterExpression: { announced: false } });
export const CommunityGoal = model('CommunityGoal', goalSchema);

/** Season points per player. */
const seasonScoreSchema = new Schema(
  {
    season: { type: Number, required: true },
    userId: { type: String, required: true },
    points: { type: Number, default: 0 },
  },
  { collection: 'season_scores', versionKey: false },
);
seasonScoreSchema.index({ season: 1, userId: 1 }, { unique: true });
seasonScoreSchema.index({ season: 1, points: -1, userId: 1 });
export const SeasonScore = model('SeasonScore', seasonScoreSchema);

/** One row per finished season once its rewards are paid (so they're paid once). */
const seasonEndSchema = new Schema(
  { _id: { type: Number, required: true }, paidAt: { type: Date, default: () => new Date() }, winners: { type: Number, default: 0 } },
  { collection: 'season_ends', versionKey: false },
);
export const SeasonEnd = model('SeasonEnd', seasonEndSchema);
