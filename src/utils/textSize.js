/**
 * Text size, per device like the theme. Nearly every size in the app is in
 * rem, so setting the root font size scales text and spacing together.
 * index.html applies the stored choice before first paint.
 */
const KEY = 'ate:textSize'
export const TEXT_SIZES = [
  { value: 'small',  label: 'Small',   scale: '93.75%' },
  { value: 'normal', label: 'Default', scale: '100%' },
  { value: 'large',  label: 'Large',   scale: '112.5%' },
  { value: 'larger', label: 'Larger',  scale: '125%' },
]

export function getTextSize() {
  try {
    const v = localStorage.getItem(KEY)
    return TEXT_SIZES.some(t => t.value === v) ? v : 'normal'
  } catch { return 'normal' }
}

export function setTextSize(value) {
  try {
    if (value === 'normal') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, value)
  } catch { /* storage blocked: still applies for this visit */ }
  const size = TEXT_SIZES.find(t => t.value === value) ?? TEXT_SIZES[1]
  document.documentElement.style.fontSize = size.value === 'normal' ? '' : size.scale
}
