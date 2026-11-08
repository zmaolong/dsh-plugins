import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    // Client specs opt into jsdom through a per-file pragma; the shared
    // config stays node-env. Offline by construction: no network in specs
    // (the server specs talk to an in-process loopback listener).
  },
})
