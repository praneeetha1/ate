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
      borderWidth: {
        DEFAULT: '1px',
        '2.5':   '2.5px',
        '3':     '3px',
      },
      borderRadius: {
        // Squarer everywhere, to sit with hand-drawn lines. `full` is a soft
        // square too; real circles (dots, avatar, badges) use `circle`.
        DEFAULT: '3px',
        md:   '4px',
        lg:   '4px',
        xl:   '6px',
        '2xl': '8px',
        full: '6px',
        circle: '9999px',
      },
      boxShadow: {
        // Hard offset, no blur. This is the whole look — if you change
        // one thing back, don't change this.
        pop:       '2px 2px 0 rgb(var(--c-ink))',
        warm:      '3px 3px 0 rgb(var(--c-ink))',
        'warm-lg': '5px 5px 0 rgb(var(--c-ink))',
        'warm-xl': '7px 7px 0 rgb(var(--c-ink))',
        'pop-mint':'3px 3px 0 rgb(var(--c-mint)), 3px 3px 0 1.5px rgb(var(--c-ink))',
      },
    },
  },
  plugins: [],
}
