import path from 'path';
import { defineConfig } from 'vitest/config';

// Tests μόνο για το Synthetic Research Lab (δεν αγγίζουν τη NORAYA).
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    include: ['tests/synthetic-lab/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/synthetic-lab/setup.ts'],
    testTimeout: 120_000,
    pool: 'forks'
  }
});
