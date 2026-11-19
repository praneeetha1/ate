/** @type {import('tailwindcss').Config} */
export default {
  // Hover styles only where there's a real pointer; on a phone they'd stick
  // after a tap and leave buttons looking pressed.
  future: { hoverOnlyWhenSupported: true },
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Every colour is a CSS variable (see :root in index.css), so the theme
      // can switch between light and dark. `<alpha-value>` keeps /20-style
      // opacity modifiers working.
      colors: Object.fromEntries(
        ['cream', 'paper', 'card', 'warm-tan', 'rim', 'ink', 'muted', 'accent', 'accent-dk', 'mint', 'sun', 'heart', 'star', 'danger-bg', 'ok', 'ok-bg'].map(n => [n, `rgb(var(--c-${n}) / <alpha-value>)`]),
      ),
      fontFamily: {
        display: ['AteHand', 'Kalam', 'system-ui', 'sans-serif'],
        sans:    ['Nunito', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // Thin pen lines: the notebook look. border-2 is overridden too, so
      // every outline in the app follows from these three.
      borderWidth: {
        DEFAULT: '1px',
        '2':     '1.5px',
        '2.5':   '1.5px',
        '3':     '2px',
      },
      borderRadius: {
        // Squarer everywhere, to sit with hand-drawn lines. `full` is a soft
        // square too; real circles (dots, avatar, badges) use `circle`.
        DEFAULT: '4px',
        md:   '6px',
        lg:   '8px',
        xl:   '10px',
        '2xl': '14px',
        full: '9999px',
        circle: '9999px',
      },
      // Soft, offset-down shadows in --c-shadow (near-black in both themes,
      // so dark mode gets depth rather than a cream glow). The hard offset
      // "sticker" shadows were retired for a softer, notebook look.
      boxShadow: {
        pop:       '0 1px 2px rgb(var(--c-shadow) / 0.10), 0 1px 1px rgb(var(--c-shadow) / 0.06)',
        warm:      '0 2px 6px rgb(var(--c-shadow) / 0.10), 0 1px 2px rgb(var(--c-shadow) / 0.06)',
        'warm-lg': '0 6px 16px rgb(var(--c-shadow) / 0.12), 0 2px 4px rgb(var(--c-shadow) / 0.06)',
        'warm-xl': '0 14px 36px rgb(var(--c-shadow) / 0.20), 0 4px 10px rgb(var(--c-shadow) / 0.08)',
        'pop-mint':'0 2px 6px rgb(var(--c-shadow) / 0.10)',
      },
    },
  },
  plugins: [],
}
