import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The in-memory Mongo replica set takes a few seconds to boot on first run
    hookTimeout: 120_000,
    testTimeout: 30_000,
    pool: 'forks',
  },
});
