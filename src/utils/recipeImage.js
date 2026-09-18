import { ingredientLabel } from './recipe'

/**
 * A recipe drawn as a shareable card.
 *
 * A link asks whoever you sent it to for a lot: open an unfamiliar app, wait
 * for a megabyte of bundle, and it renders as a naked URL in the chat because
 * GitHub Pages can't emit per-recipe Open Graph tags. An image just appears.
 *
 * Drawn by hand on a canvas rather than through html2canvas — the layout is a
 * title, two lists and a footer, which is far less code than a 200 kB DOM
 * rasteriser, and it renders identically everywhere instead of depending on
 * which CSS features the library happens to support.
 *
 * And it round-trips: another cook can import the image straight back through
 * the vision importer, so a picture isn't a dead end.
 */

const W = 1080
const PAD = 64
const INK = '#2B2320'
const MUTED = '#6B5C55'
const ACCENT = '#E8663A'
const CREAM = '#FFF4E6'
const CARD = '#FFFFFF'

const display = (size, weight = 600) => `${weight} ${size}px Fredoka, ui-rounded, system-ui, sans-serif`
const sans = (size, weight = 600) => `${weight} ${size}px Nunito, ui-sans-serif, system-ui, sans-serif`

/**
 * Split `text` into lines that fit `maxWidth`.
 *
 * Takes a measuring function rather than a canvas context so the wrapping can
 * be tested without one — jsdom has no 2D context, and this is the only part
 * with logic worth guarding.
 */
export function wrapText(text, maxWidth, measure) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines = []
  let line = words[0]
  for (const word of words.slice(1)) {
    const candidate = `${line} ${word}`
    // A single word longer than the line still gets its own line rather than
    // being dropped: overflowing is better than losing an ingredient.
    if (measure(candidate) <= maxWidth) line = candidate
    else { lines.push(line); line = word }
  }
  lines.push(line)
  return lines
}

/** Load an image for the canvas, or nothing if it can't be used. */
function loadImage(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null)
    const img = new Image()
    // Without this the canvas is tainted the moment a cross-origin photo is
    // drawn on it, and toBlob() then throws SecurityError — losing the whole
    // card, not just the picture. With it, a host that sends no CORS headers
    // fails to load instead, and we simply draw the card without a photo.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Renders the card and hands back a PNG blob.
 *
 * Two passes: measure every block to find the height, then draw. A recipe's
 * length isn't known until its steps are wrapped, and a canvas can't be
 * resized without clearing it.
 */
export async function renderRecipeCard(recipe) {
  if (typeof document === 'undefined') return null

  // Otherwise the first render falls back to a system font mid-draw.
  try { await document.fonts?.ready } catch { /* not fatal */ }

  const photo = await loadImage(recipe.image || recipe.image_url)

  const measurer = document.createElement('canvas').getContext('2d')
  if (!measurer) return null
  const widthOf = (text, font) => { measurer.font = font; return measurer.measureText(text).width }

  const inner = W - PAD * 2
  const photoH = photo ? 560 : 0

  // ── pass 1: lay everything out ──────────────────────────────
  const titleLines = wrapText(recipe.name, inner, t => widthOf(t, display(66, 700)))
  const meta = [
    recipe.category,
    recipe.timeMinutes ? `${recipe.timeMinutes} min` : null,
    recipe.servings ? `${recipe.servings} servings` : null,
  ].filter(Boolean).join('  ·  ')

  const ingredients = (recipe.ingredients || []).map(ing => {
    const { measure: amount, item } = ingredientLabel(ing, 1)
    const amountW = amount ? widthOf(`${amount}  `, sans(32, 800)) : 0
    return { amount, lines: wrapText(item, inner - amountW, t => widthOf(t, sans(32, 600))), amountW }
  })

  const steps = (recipe.steps || []).map((step, i) => ({
    n: i + 1,
    lines: wrapText(step, inner - 62, t => widthOf(t, sans(30, 600))),
  }))

  let y = photoH + PAD
  const titleY = y;      y += titleLines.length * 76
  const metaY  = y + 8;  y += meta ? 56 : 0
  const ingHeadY = y + 34; y += 34 + 52
  const ingY = y
  for (const ing of ingredients) y += ing.lines.length * 44 + 10
  const stepHeadY = y + 26; y += 26 + 52
  const stepY = y
  for (const s of steps) y += s.lines.length * 42 + 22
  const footY = y + 34
  const H = footY + 70

  // ── pass 2: draw ────────────────────────────────────────────
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = CREAM
  ctx.fillRect(0, 0, W, H)

  if (photo) {
    // Cover-crop, so a portrait photo isn't squashed into a landscape band.
    const scale = Math.max(W / photo.width, photoH / photo.height)
    const dw = photo.width * scale
    const dh = photo.height * scale
    ctx.save()
    ctx.beginPath(); ctx.rect(0, 0, W, photoH); ctx.clip()
    ctx.drawImage(photo, (W - dw) / 2, (photoH - dh) / 2, dw, dh)
    ctx.restore()
    ctx.fillStyle = INK
    ctx.fillRect(0, photoH - 5, W, 5)
  }

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = INK
  ctx.font = display(66, 700)
  titleLines.forEach((line, i) => ctx.fillText(line, PAD, titleY + 58 + i * 76))

  if (meta) {
    ctx.fillStyle = MUTED
    ctx.font = sans(30, 600)
    ctx.fillText(meta, PAD, metaY + 40)
  }

  const heading = (text, atY) => {
    ctx.fillStyle = ACCENT
    ctx.font = sans(26, 800)
    ctx.fillText(text.toUpperCase(), PAD, atY + 26)
    ctx.fillStyle = '#E8D9C0'
    ctx.fillRect(PAD, atY + 42, inner, 3)
  }

  heading('Ingredients', ingHeadY)
  let cursor = ingY
  for (const ing of ingredients) {
    if (ing.amount) {
      ctx.fillStyle = ACCENT
      ctx.font = sans(32, 800)
      ctx.fillText(ing.amount, PAD, cursor + 32)
    }
    ctx.fillStyle = INK
    ctx.font = sans(32, 600)
    ing.lines.forEach((line, i) => ctx.fillText(line, PAD + ing.amountW, cursor + 32 + i * 44))
    cursor += ing.lines.length * 44 + 10
  }

  heading('Method', stepHeadY)
  cursor = stepY
  for (const s of steps) {
    ctx.fillStyle = ACCENT
    ctx.beginPath(); ctx.arc(PAD + 17, cursor + 22, 17, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = CARD
    ctx.font = sans(22, 800)
    ctx.textAlign = 'center'
    ctx.fillText(String(s.n), PAD + 17, cursor + 30)
    ctx.textAlign = 'left'

    ctx.fillStyle = INK
    ctx.font = sans(30, 600)
    s.lines.forEach((line, i) => ctx.fillText(line, PAD + 62, cursor + 30 + i * 42))
    cursor += s.lines.length * 42 + 22
  }

  // Wordmark, and the credit if this came from somewhere.
  ctx.fillStyle = MUTED
  ctx.font = sans(24, 600)
  const from = recipe.sourceUrl || recipe.source_url
  if (from) {
    try { ctx.fillText(`Recipe from ${new URL(from).hostname.replace(/^www\./, '')}`, PAD, footY + 24) }
    catch { /* a malformed source is not worth failing the card over */ }
  }
  ctx.fillStyle = INK
  ctx.font = display(30, 700)
  ctx.textAlign = 'right'
  ctx.fillText('ate.', W - PAD, footY + 24)

  return new Promise(resolve => {
    // Tainted canvases throw here rather than returning null, and a failed
    // image share should fall back to the link, not crash the modal.
    try { canvas.toBlob(resolve, 'image/png') } catch { resolve(null) }
  })
}
