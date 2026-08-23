import { defineProject } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineProject({
  resolve: {
    alias: {
      '@opencouncil/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
