import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'forks',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // coverage thresholds added in T-040
    coverage: {
      provider: 'v8',
      include: ['src/**/*'],
      // Exclude entry-point, server wiring, type-only, and prompt-text files
      // — these require integration testing (real stdio transport, MCP client)
      exclude: [
        'src/index.ts',
        'src/server.ts',
        'src/prompts/**',
        'src/strapi/types.ts',
        'src/providers/ai/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
})
