import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/ate/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    /**
     * Vitest's 5s default is too low for the Home tests, which render the
     * whole visible catalog — a few hundred RecipeCards — and some of which
     * toggle pantry mode on and off, so they render it twice in one test.
     *
     * That is genuine work, not a hang: the pantry ranking itself measures
     * ~21ms over 415 recipes, so what costs the time is jsdom mounting the
     * cards, which scales with the catalog. A CI runner is roughly 4-5x
     * slower than a dev laptop, which is where the 5s default started
     * failing once the catalog grew past 300 recipes.
     */
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
