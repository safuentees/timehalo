// Shared constants for the Playwright suite. Exported here so seed
// scripts, the auth.setup project, and individual specs can reference
// the same values without drifting out of sync.
//
// If you change a value here, the next `pnpm exec playwright test`
// run will recreate the test user via e2e/global-setup.ts.

export const TEST_EMAIL = "hydration-e2e@test.local";
export const TEST_PASSWORD = "test-password-hydration-1234";
export const TEST_HANDLE = "hydration-e2e";
