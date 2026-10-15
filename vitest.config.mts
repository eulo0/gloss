import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Spike helpers are pure TS; their tests run here so CI covers them. Spike scripts are not.
    include: ['src/**/*.test.{ts,tsx}', 'spikes/*/lib/**/*.test.mts'],
  },
});
