/* eslint-env node */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Ship only the recipes the app can actually show.
 *
 * The catalog is append-only — a recipe's key *is* its array index, and seven
 * tables store that index as plain text — so retired recipes are flagged
 * `hidden` rather than removed. That keeps saved ratings and shopping rows
 * pointing at the right thing, but it also means every phone downloads all 454
 * recipes to display 33 of them: 692 kB of JSON, well over half the bundle.
 *
 * Each hidden recipe is replaced with a stub of the same shape at the same
 * index, so nothing moves. The name and category stay: resolveRecipe()
 * deliberately still resolves a hidden recipe, so an old rating or a shared
 * link opens something recognisable instead of a blank modal. Dropping those
 * two fields as well would save another 42 kB and isn't worth it.
 *
 * Build only. Dev and the test suite read the real file, so nothing here can
 * affect what the tests assert about the catalog.
 */
function stripHiddenRecipes() {
  return {
    name: 'strip-hidden-recipes',
    apply: 'build',
    // Ahead of Vite's own JSON handling, so `code` is still the raw file.
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/data/recipes.json')) return null

      const recipes = JSON.parse(code)
      let stripped = 0
      const out = recipes.map(r => {
        if (!r.hidden) return r
        stripped++
        return {
          name: r.name,
          category: r.category,
          dietary: [],
          ingredients: [],
          steps: [],
          hidden: true,
        }
      })

      const before = Buffer.byteLength(code)
      const json = JSON.stringify(out)
      console.log(
        `  strip-hidden-recipes: ${stripped} of ${recipes.length} stubbed, ` +
        `${(before / 1024).toFixed(0)} kB -> ${(Buffer.byteLength(json) / 1024).toFixed(0)} kB`,
      )
      return { code: json, map: null }
    },
  }
}

export default defineConfig({
  plugins: [react(), stripHiddenRecipes()],
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
