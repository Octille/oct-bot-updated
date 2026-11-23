import { describe, expect, it } from 'vitest';
import { devGuildIds, isTestBot, resolveMongoUri, type Env } from '../src/config/env';

const base: Env = {
  NODE_ENV: 'development',
  DISCORD_TOKEN: 't',
  CLIENT_ID: 'c',
  OWNER_ID: 'o',
  TEST_CLIENT_ID: 'test-app',
  MONGODB_URI: 'mongodb+srv://user:pw@cluster.mongodb.net/db',
  ALLOW_LIVE_DB: 'false',
  LAVALINK_HOST: 'localhost',
  LAVALINK_PORT: 2333,
  LAVALINK_PASSWORD: 'x',
};

describe('test bot detection', () => {
  it('knows when it is running as the test bot', () => {
    expect(isTestBot({ ...base, CLIENT_ID: 'test-app' })).toBe(true);
    expect(isTestBot({ ...base, CLIENT_ID: 'real-app' })).toBe(false);
    expect(devGuildIds({ ...base, DEV_GUILD_IDS: '1, 2,2 ,3' })).toEqual(['1', '2', '3']);
    expect(devGuildIds({ ...base, DEV_GUILD_ID: '9' })).toEqual(['9']);
  });
});

describe('database guard', () => {
  it('refuses the live database outside production', () => {
    expect(() => resolveMongoUri(base)).toThrow(/Refusing to use the live database/);
  });

  it('uses the dev database when one is configured', () => {
    expect(resolveMongoUri({ ...base, MONGODB_DEV_URI: 'mongodb://localhost:27018/dev' })).toBe('mongodb://localhost:27018/dev');
  });

  it('allows the live database in production or when explicitly allowed', () => {
    expect(resolveMongoUri({ ...base, NODE_ENV: 'production' })).toBe(base.MONGODB_URI);
    expect(resolveMongoUri({ ...base, ALLOW_LIVE_DB: 'true' })).toBe(base.MONGODB_URI);
  });

  it('allows local databases in development', () => {
    expect(resolveMongoUri({ ...base, MONGODB_URI: 'mongodb://localhost:27017/x' })).toBe('mongodb://localhost:27017/x');
  });
});
