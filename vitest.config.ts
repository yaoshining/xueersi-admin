import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'apps/**/*.test.ts',
      'packages/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/api/src/app.ts'],
      exclude: ['**/*.test.ts', '**/schema.ts'],
    },
  },
});
