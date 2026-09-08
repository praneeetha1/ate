/**
 * The app's icon set.
 *
 * Emoji were pulling against the sticker look — they render glossy, in their
 * own colours, and differently on every platform. These are flat outlines
 * drawn on the same 24px grid at the same ink weight as the card borders
 * (2.2 on 24 reads as ~2.5px at the sizes we use), stroked in currentColor so
 * an icon always matches the text beside it.
 *
 * `heart` and `star` also have a filled state, since both double as toggles.
 */

const PATHS = {
  home: (
    <>
      <path d="M3.2 10.6 12 3.3l8.8 7.3" />
      <path d="M5.6 9.6V19a1.6 1.6 0 0 0 1.6 1.6h9.6A1.6 1.6 0 0 0 18.4 19V9.6" />
      <path d="M9.6 20.6v-5.2h4.8v5.2" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.6" />
      <path d="M15.6 15.6 20.6 20.6" />
    </>
  ),
  heart: <path d="M12 20.4C10.2 19 3.9 14.7 3.9 10.1a4.3 4.3 0 0 1 8.1-2.1 4.3 4.3 0 0 1 8.1 2.1c0 4.6-6.3 8.9-8.1 10.3Z" />,
  users: (
    <>
      <circle cx="9" cy="8.4" r="3.6" />
      <path d="M2.8 20.2a6.2 6.2 0 0 1 12.4 0" />
      <path d="M16.2 5.2a3.6 3.6 0 0 1 0 6.9" />
      <path d="M17.6 14.6a6.2 6.2 0 0 1 3.6 5.6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.2" r="3.9" />
      <path d="M4.9 20.4a7.1 7.1 0 0 1 14.2 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.2V12l3.2 2.2" />
    </>
  ),
  leaf: (
    <>
      <path d="M20 4.2c0 8.4-4.3 12.4-9.2 12.4A4.9 4.9 0 0 1 6 11.7C6 6.6 11.5 4.2 20 4.2Z" />
      <path d="M16.4 7.8 4.6 19.8" />
    </>
  ),
  star: <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.5 9.8l5.9-.8Z" />,
  cart: (
    <>
      <path d="M2.8 3.8h2.6l2.4 10.6h9.3l2.1-7.6H6.2" />
      <circle cx="9.4" cy="19" r="1.7" />
      <circle cx="17.2" cy="19" r="1.7" />
    </>
  ),
  list: (
    <>
      <path d="M8.4 4.4H6.6A1.6 1.6 0 0 0 5 6v13a1.6 1.6 0 0 0 1.6 1.6h10.8A1.6 1.6 0 0 0 19 19V6a1.6 1.6 0 0 0-1.6-1.6h-1.8" />
      <path d="M9.2 2.8h5.6v3.2H9.2z" />
      <path d="M8.8 11.4h6.4M8.8 15.4h4.2" />
    </>
  ),
  book: (
    <>
      <path d="M3.4 4.6h5a3 3 0 0 1 3.6 2.8v12a2.4 2.4 0 0 0-2.8-2H3.4Z" />
      <path d="M20.6 4.6h-5A3 3 0 0 0 12 7.4v12a2.4 2.4 0 0 1 2.8-2h5.8Z" />
    </>
  ),
  dice: (
    <>
      <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4" />
      <circle cx="8.6" cy="8.6" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="15.4" r="1.15" fill="currentColor" stroke="none" />
    </>
  ),
  plate: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <circle cx="12" cy="12" r="4.6" />
    </>
  ),
  pan: (
    <>
      <circle cx="10.2" cy="13.4" r="6.6" />
      <path d="M16.4 10.6 21.4 6" />
      <circle cx="10.2" cy="13.4" r="2.4" />
    </>
  ),
  close: <path d="M6 6 18 18M18 6 6 18" />,
  pencil: (
    <>
      <path d="M16.2 3.8 20.2 7.8 8.6 19.4l-5 1 1-5Z" />
      <path d="M14.2 5.8 18.2 9.8" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  grid: (
    <>
      <rect x="3.8" y="3.8" width="7" height="7" rx="1.8" />
      <rect x="13.2" y="3.8" width="7" height="7" rx="1.8" />
      <rect x="3.8" y="13.2" width="7" height="7" rx="1.8" />
      <rect x="13.2" y="13.2" width="7" height="7" rx="1.8" />
    </>
  ),
  check: <path d="m4.6 12.6 4.8 4.8 10-10.8" />,
  plus: <path d="M12 4.8v14.4M4.8 12h14.4" />,
  share: (
    <>
      <path d="M20 4h-7M20 4v7M20 4 11 13" />
      <path d="M18 14.6V19a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6V7.6A1.6 1.6 0 0 1 5 6h4.4" />
    </>
  ),
  arrowRight: <path d="M4.4 12h15.2M13.6 6l6 6-6 6" />,
  arrowDown: <path d="M12 4.4v15.2M6 13.6l6 6 6-6" />,
  plug: (
    <>
      <path d="M9 2.8v5.4M15 2.8v5.4" />
      <path d="M5.6 8.2h12.8v3a6.4 6.4 0 0 1-12.8 0Z" />
      <path d="M12 17.6v3.6" />
    </>
  ),
}

export const ICON_NAMES = Object.keys(PATHS)

export default function Icon({ name, size = 20, filled = false, label, className = '', strokeWidth = 2.2 }) {
  const glyph = PATHS[name]
  if (!glyph) return null

  // Decorative by default. Pass `label` only where the icon is the sole
  // carrier of meaning, so screen readers don't announce it twice next to
  // a visible text label.
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      focusable="false"
      {...a11y}
    >
      {glyph}
    </svg>
  )
}
