import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    include: ['tests/**/*.test.ts'],
    // setupFiles added in T-032 when tests/setup.ts is created
    // coverage thresholds added in T-040
    coverage: {
      provider: 'v8',
      include: ['src/**/*'],
    },
  },
})
