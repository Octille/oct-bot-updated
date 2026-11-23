import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // `token` / `MONGODB_SRV` are the v2 names, still accepted so existing .env files keep working
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN (or token) is required'),
  CLIENT_ID: z.string().min(1, 'CLIENT_ID is required'),
  OWNER_ID: z.string().default('460509056487129090'),
  DEV_GUILD_ID: z.string().optional(),
  ERROR_LOG_CHANNEL_ID: z.string().optional(),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI (or MONGODB_SRV) is required'),
  MONGODB_DEV_URI: z.string().optional(),
  ALLOW_LIVE_DB: z.enum(['true', 'false']).default('false'),

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
