import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/*/src/**/*.{test,spec}.ts',
      'apps/*/tests/**/*.{test,spec}.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/server/**'],
      exclude: ['**/dist/**', '**/.nuxt/**', '**/node_modules/**'],
    },
  },
})
