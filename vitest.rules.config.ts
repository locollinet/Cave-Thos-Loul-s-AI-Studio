import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Tests des règles Firestore : exécutés dans l'émulateur via `npm run test:rules` (Java requis).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/rules/**/*.rules.ts'],
      testTimeout: 30_000,
      hookTimeout: 30_000,
      fileParallelism: false,
    },
  }),
);
