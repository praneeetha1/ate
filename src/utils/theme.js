/**
 * Light, dark, or whatever the device uses ('system').
 *
 * Stored per device rather than per account: it's about the screen you're
 * holding. index.html applies the stored choice before first paint; this
 * keeps it in step afterwards. 'system' means no data-theme attribute, so the
 * prefers-color-scheme rule in index.css decides.
 */
const KEY = 'ate:theme'
export const THEMES = ['light', 'dark', 'system']

export function getTheme() {
  try { return THEMES.includes(localStorage.getItem(KEY)) ? localStorage.getItem(KEY) : 'system' } catch { return 'system' }
}

export function setTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch { /* storage blocked: still applies for this visit */ }
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  // The phone's status bar matches the page.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = getComputedStyle(document.body).backgroundColor
}
