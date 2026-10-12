import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    coverage: { include: ['packages/shared/src/**'], reporter: ['text', 'html'] },
  },
});
