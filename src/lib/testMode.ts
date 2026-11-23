import { isTestBot } from '../config/env';

export const TEST_NOTICE = '🧪 Test version: progress will be reset before launch.';

/** The test-version notice while running as the test bot, otherwise null. */
export function testNotice(): string | null {
  return isTestBot() ? TEST_NOTICE : null;
}
