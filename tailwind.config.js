/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        cream:       '#FDF6E3',
        paper:       '#FAF0D7',
        card:        '#FFFDF7',
        'warm-tan':  '#E8D5B0',
        rim:         '#D9C99A',
        accent:      '#C2885A',
        'accent-dk': '#A0673B',
        ink:         '#3D2B1F',
        muted:       '#7A6047',
        heart:       '#C0392B',
        star:        '#E8A020',
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        sans:    ['Lato', 'ui-sans-serif', 'system-ui'],
      },
      boxShadow: {
        warm:    '0 2px 8px rgba(100,70,30,0.12)',
        'warm-lg': '0 8px 24px rgba(100,70,30,0.18)',
        'warm-xl': '0 20px 60px rgba(60,35,15,0.35)',
      },
    },
  },
  plugins: [],
}
