import { test } from 'vitest';

/**
 * Full-app render pulls the entire provider tree and blocks Vitest workers for a long time.
 * Run the dev server or E2E for shell smoke tests; keep unit tests fast.
 */
test.skip('App shell (skipped — use dev server for full mount)', () => {});
