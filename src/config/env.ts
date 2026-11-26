import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // `token` / `MONGODB_SRV` are the v2 names, still accepted so existing .env files keep working
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN (or token) is required'),
  CLIENT_ID: z.string().min(1, 'CLIENT_ID is required'),
  OWNER_ID: z.string().default('460509056487129090'),
  DEV_GUILD_ID: z.string().optional(),
  /** Comma-separated servers for `npm run deploy:guild` (falls back to DEV_GUILD_ID). */
  DEV_GUILD_IDS: z.string().optional(),
  /** Spotify links work only when both are set (Lavalink reads them too, via lavalink server/start.sh). */
  SPOTIFY_CLIENT_ID: z.string().optional(),
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  /** The test bot's application id. deploy:global refuses to run for it without --force. */
  TEST_CLIENT_ID: z.string().default('816413181793665056'),
  ERROR_LOG_CHANNEL_ID: z.string().optional(),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI (or MONGODB_SRV) is required'),
  MONGODB_DEV_URI: z.string().optional(),
  ALLOW_LIVE_DB: z.enum(['true', 'false']).default('false'),

  /** Override the anti-alt thresholds in content/social.ts (e.g. 0 profile days on the test bot). */
  ANTI_ALT_PROFILE_DAYS: z.coerce.number().min(0).optional(),
  ANTI_ALT_DISCORD_DAYS: z.coerce.number().min(0).optional(),

  /** Relaunch date (ISO). Old `!commands` get a slash-command notice for 30 days after it; unset = off. */
  LAUNCH_DATE: z.string().optional(),

  /** When Season 1 starts (ISO date). Unset = seasons haven't started. */
  SEASON_1_START: z.string().optional(),
  /** Season length in days (default 30; shorter on the test bot to see a season end). */
  SEASON_LENGTH_DAYS: z.coerce.number().positive().optional(),

  LAVALINK_HOST: z.string().default('localhost'),
  LAVALINK_PORT: z.coerce.number().int().default(2333),
  LAVALINK_PASSWORD: z.string().default('youshallnotpass'),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const raw = {
    ...process.env,
    DISCORD_TOKEN: process.env.DISCORD_TOKEN ?? process.env.token,
    MONGODB_URI: process.env.MONGODB_URI ?? process.env.MONGODB_SRV,
  };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return parsed.data;
}

export const env = load();

/** Servers that development commands are registered to. */
export function devGuildIds(e: Env = env): string[] {
  const raw = e.DEV_GUILD_IDS ?? e.DEV_GUILD_ID ?? '';
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
}

/** True when running as the test bot rather than the real Oct Bot. */
export function isTestBot(e: Env = env): boolean {
  return e.CLIENT_ID === e.TEST_CLIENT_ID;
}

/** True for hosted (Atlas) connection strings. */
export function isRemoteMongo(uri: string): boolean {
  return uri.startsWith('mongodb+srv://') || uri.includes('.mongodb.net');
}

/**
 * The database the bot should use. Outside production this refuses to touch a hosted
 * database unless ALLOW_LIVE_DB=true, so development can never write to live data.
 */
export function resolveMongoUri(e: Env = env): string {
  if (e.NODE_ENV === 'production') return e.MONGODB_URI;
  if (e.MONGODB_DEV_URI) return e.MONGODB_DEV_URI;
  if (isRemoteMongo(e.MONGODB_URI) && e.ALLOW_LIVE_DB !== 'true') {
    throw new Error(
      'Refusing to use the live database outside production.\n' +
      'Set MONGODB_DEV_URI to a local database, or NODE_ENV=production / ALLOW_LIVE_DB=true if you really mean it.',
    );
  }
  return e.MONGODB_URI;
}
