import { useState } from 'react'

/**
 * The photo a recipe page published for one step.
 *
 * Linked from the publisher, like the recipe's main image, so it can go away
 * or be refused: a dead or blocked link hides the frame rather than showing a
 * broken-image glyph beside an instruction. No referrer is sent, which is what
 * most image hosts' hotlink checks let through.
 */
export default function StepPhoto({ src, step, className = '' }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  return (
    <img
      src={src}
      alt={`Step ${step}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`w-full max-h-72 object-cover rounded-xl border-2 border-ink bg-paper ${className}`}
    />
  )
}

/** A recipe's step photos, whichever spelling it arrived in. */
export const stepImagesOf = recipe => recipe?.stepImages ?? recipe?.step_images ?? []
