/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Sketchbook palette (sketch-ui branch) ───────────
        // Ink on paper, and colour only where it means something. The one
        // accent is the mustard of the drawn star; red is the muted red of the
        // drawn non-veg mark. Names are kept from the sticker palette so every
        // component picks this up without a class change.
        cream:       '#FAF8F5',   // app background: plain paper
        paper:       '#F2EFEA',   // secondary surface
        card:        '#FFFFFF',
        'warm-tan':  '#DCD7CF',   // hairlines, inactive marks
        rim:         '#1C1B19',
        ink:         '#1C1B19',
        muted:       '#5E5852',
        accent:      '#F6E4A6',   // pastel butter (buttons, active chips)
        'accent-dk': '#7A5F0E',   // readable text in the accent family
        mint:        '#86A98A',   // the drawn veg mark's green
        sun:         '#F5EBC4',   // pale accent for warnings (Plan ahead)
        heart:       '#B5676B',   // the drawn non-veg mark's red
        star:        '#E2C76A',
      },
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
        pop:       '2px 2px 0 #1C1B19',
        warm:      '3px 3px 0 #1C1B19',
        'warm-lg': '5px 5px 0 #1C1B19',
        'warm-xl': '7px 7px 0 #1C1B19',
        'pop-mint':'3px 3px 0 #4EC6B0, 3px 3px 0 1.5px #1C1B19',
      },
    },
  },
  plugins: [],
}
