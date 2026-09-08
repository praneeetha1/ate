/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Sticker-book palette ─────────────────────────────
        // Warm paper grounds, one hard ink for every outline, and
        // three candy accents. Everything cute comes from the
        // ink outline + hard offset shadow, not from the fills.
        cream:       '#FFF4E6',   // app background
        paper:       '#FFEBD3',   // secondary surface (header, nav, sunk rows)
        card:        '#FFFFFF',   // card faces
        'warm-tan':  '#E4D6C8',   // inactive / disabled marks — never a border
        rim:         '#2B2320',   // every outline: same ink as text
        ink:         '#2B2320',
        muted:       '#6B5C55',
        accent:      '#FF8B5E',   // coral — primary action
        'accent-dk': '#E8663A',
        mint:        '#4EC6B0',   // secondary accent
        sun:         '#FFD166',   // tertiary accent
        heart:       '#FF5D73',
        star:        '#FFB627',
      },
      fontFamily: {
        display: ['Fredoka', 'ui-rounded', 'system-ui', 'sans-serif'],
        sans:    ['Nunito', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderWidth: {
        DEFAULT: '1px',
        '2.5':   '2.5px',
        '3':     '3px',
      },
      borderRadius: {
        // Nudged up across the board — 'xl' is the card radius, and
        // bumping it here rounds every existing rounded-xl at once.
        lg:  '0.75rem',   // 12px
        xl:  '1.125rem',  // 18px
        '2xl': '1.375rem',// 22px
      },
      boxShadow: {
        // Hard offset, no blur. This is the whole look — if you change
        // one thing back, don't change this.
        pop:       '2px 2px 0 #2B2320',
        warm:      '3px 3px 0 #2B2320',
        'warm-lg': '5px 5px 0 #2B2320',
        'warm-xl': '7px 7px 0 #2B2320',
        'pop-mint':'3px 3px 0 #4EC6B0, 3px 3px 0 1.5px #2B2320',
      },
    },
  },
  plugins: [],
}
