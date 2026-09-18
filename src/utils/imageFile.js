/**
 * Preparing a picked photo for upload.
 *
 * A phone screenshot is 3-5 MB, and base64 adds another third on top. Sending
 * that raw is slow on mobile data and runs into request size limits, so every
 * image is redrawn smaller before it goes anywhere.
 *
 * Re-encoding also settles the file-type question. The importer used to label
 * every image `image/jpeg` regardless of what it actually was, which was a lie
 * for the PNG that a phone screenshot usually is — it only worked because the
 * model happened to be forgiving. Now the canvas produces a real JPEG, so the
 * label is simply true.
 */

/** The biggest edge we send. Recipe text stays legible well below this. */
const MAX_EDGE = 1400
const QUALITY = 0.85

/** Roughly the most a request should carry, base64 included. */
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('That file isn’t an image we can read.'))
    img.src = src
  })
}

/** The size to draw at: never bigger than the original, never over MAX_EDGE. */
export function fitWithin(width, height, maxEdge = MAX_EDGE) {
  const longest = Math.max(width, height)
  // Never upscale — enlarging a small screenshot adds bytes and no detail.
  if (!longest || longest <= maxEdge) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Redraw a picked file at a sane size.
 *
 * Shared by both exits below — one wants a data URL to send, the other a Blob
 * to upload — so the reading, decoding and resizing only exist once.
 */
async function downscale(file, maxEdge) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('Pick an image file.')
  }

  const original = await readAsDataUrl(file)
  const img = await loadImage(original)
  const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, maxEdge)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // No canvas (older browsers, jsdom) — fall back to the file as it came.
  if (!ctx) return { canvas: null, original }

  ctx.drawImage(img, 0, 0, width, height)
  return { canvas, original }
}

/**
 * A picked file as a downscaled JPEG data URL.
 *
 * Returns the full `data:image/jpeg;base64,…` string rather than bare base64,
 * so whatever receives it is told the type instead of having to assume one.
 */
export async function fileToDataUrl(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  const { canvas, original } = await downscale(file, maxEdge)
  return canvas ? canvas.toDataURL('image/jpeg', quality) : original
}

/**
 * The same, as a Blob — what Supabase Storage wants to upload.
 *
 * A larger default edge than the import path: this one is kept and displayed
 * on a card, where the import copy is read once by a model and thrown away.
 */
export async function fileToBlob(file, { maxEdge = 1600, quality = QUALITY } = {}) {
  const { canvas } = await downscale(file, maxEdge)
  if (!canvas) return file          // no canvas: upload what was picked
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('Could not prepare that photo.'))),
      'image/jpeg',
      quality,
    )
  })
}

/** Rough byte count of a data URL's payload, for the size guard. */
export function dataUrlBytes(dataUrl) {
  const comma = String(dataUrl || '').indexOf(',')
  if (comma === -1) return 0
  // 4 base64 characters carry 3 bytes.
  return Math.floor((String(dataUrl).length - comma - 1) * 3 / 4)
}
