/**
 * A recipe page's method, step by step, with the photo each step carries.
 *
 * The model rewrites steps — merging, splitting, rewording — so a photo can't
 * be matched to its step after the fact. When the page itself says which
 * photo belongs to which step, the steps are taken from the page as published
 * and the photos travel with them, in order.
 *
 * Three sources, best first:
 *   1. schema.org JSON-LD: HowToStep.image, which recipe plugins emit
 *      (WP Recipe Maker, Tasty, Yoast, Mediavine) whenever a step has a photo.
 *   2. WP Recipe Maker's own markup, for pages whose JSON-LD leaves it out:
 *      <li class="wprm-recipe-instruction"> with an <img> inside.
 *   3. A "How to make … (stepwise photos)" section in the article: numbered
 *      paragraphs, each followed by its photo. This is how most Indian recipe
 *      sites publish step photos (checked against Indian Healthy Recipes and
 *      Veg Recipes of India) — their recipe cards carry none. Those steps are
 *      the site's own, more detailed walk-through, so they are used as written.
 *
 * Photos loose in the article, not tied to any step, are left out on purpose:
 * guessing which step one belongs to would put the wrong picture beside an
 * instruction, which is worse than no picture.
 *
 * Returns null when the page gives no per-step photos at all, so the caller
 * keeps the model's steps as before.
 */
export type Step = { text: string; image: string | null }

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?)])/g, '$1')   // a removed </b> leaves "smooth ."
    .trim()
}

/** An absolute http(s) URL, or null. Relative paths resolve against the page. */
function absolute(src: unknown, base: string): string | null {
  if (typeof src !== 'string' || !src.trim() || src.startsWith('data:')) return null
  try {
    const u = new URL(src.trim(), base)
    return /^https?:$/.test(u.protocol) ? u.toString() : null
  } catch { return null }
}

/** JSON-LD's image field: a URL, an ImageObject, or a list of either. */
function imageOf(v: unknown, base: string): string | null {
  if (Array.isArray(v)) {
    for (const x of v) { const u = imageOf(x, base); if (u) return u }
    return null
  }
  if (v && typeof v === 'object') return absolute((v as any).url ?? (v as any).contentUrl, base)
  return absolute(v, base)
}

const isRecipe = (n: any) =>
  n && (n['@type'] === 'Recipe' || (Array.isArray(n['@type']) && n['@type'].includes('Recipe')))

function findRecipe(node: any): any {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n); if (r) return r }
    return null
  }
  if (isRecipe(node)) return node
  return findRecipe(node['@graph'])
}

/** Flattens HowToSection groups ("For the sauce" …) into one ordered list. */
function flatten(instructions: any, base: string, out: Step[] = []): Step[] {
  if (!instructions) return out
  if (typeof instructions === 'string') {
    const text = decode(instructions)
    if (text) out.push({ text, image: null })
    return out
  }
  if (Array.isArray(instructions)) {
    for (const i of instructions) flatten(i, base, out)
    return out
  }
  if (typeof instructions === 'object') {
    if (instructions.itemListElement) return flatten(instructions.itemListElement, base, out)
    const text = decode(String(instructions.text ?? instructions.name ?? ''))
    if (text) out.push({ text, image: imageOf(instructions.image, base) })
  }
  return out
}

function fromJsonLd(html: string, base: string): Step[] | null {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const [, body] of blocks) {
    let data: unknown
    try { data = JSON.parse(body) } catch { continue }
    const recipe = findRecipe(data)
    if (recipe) return flatten(recipe.recipeInstructions, base)
  }
  return null
}

/** The real address of an <img>: lazy loaders park it in data-src or srcset. */
function imgSrc(tag: string, base: string): string | null {
  const attr = (name: string) => tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, 'i'))?.[1]
  for (const name of ['data-lazy-src', 'data-src', 'src']) {
    const u = absolute(attr(name), base)
    if (u) return u
  }
  const set = attr('data-srcset') ?? attr('srcset')
  return set ? absolute(set.split(',')[0].trim().split(/\s+/)[0], base) : null
}

function fromWprm(html: string, base: string): Step[] | null {
  const items = [...html.matchAll(/<li[^>]+class=["'][^"']*wprm-recipe-instruction\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)]
  if (!items.length) return null
  return items.map(([, inner]) => {
    const textPart = inner.match(/class=["'][^"']*wprm-recipe-instruction-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? inner
    const img = inner.match(/<img\b[^>]*>/i)?.[0]
    return { text: decode(textPart), image: img ? imgSrc(img, base) : null }
  }).filter(s => s.text)
}

const STEPWISE_HEADING = /\b(how to make|step[- ]?by[- ]?step|step[- ]?wise|with (?:step )?photos)\b/i

function fromArticle(html: string, base: string): Step[] | null {
  const heads = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
  const at = heads.findIndex(h => STEPWISE_HEADING.test(decode(h[1])))
  if (at < 0) return null
  const start = heads[at].index!
  const end = heads[at + 1]?.index ?? start + 300000
  const section = html.slice(start, end)

  const steps: Step[] = []
  let current: Step | null = null
  const tokens = /<p\b[^>]*>([\s\S]*?)<\/p>|<(ul|ol)\b[^>]*>([\s\S]*?)<\/\2>|<img\b[^>]*>/gi
  for (const m of section.matchAll(tokens)) {
    if (m[1] !== undefined) {
      const numbered = decode(m[1]).match(/^(\d{1,2})[.)]\s+(.+)/)
      if (!numbered) continue                       // a tip or aside, not a step
      // Numbering back at 1 means a second recipe ("Recipe 2") has begun.
      if (+numbered[1] === 1 && steps.length) break
      current = { text: numbered[2], image: null }
      steps.push(current)
    } else if (m[2] !== undefined) {
      // A list under a step ("1. Prepare the following:") belongs to it.
      if (current && !current.image) {
        const items = [...m[3].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map(li => decode(li[1])).filter(Boolean)
        if (items.length) current.text += ' ' + items.join(' ')
      }
    } else if (current && !current.image) {
      current.image = imgSrc(m[0], base)
    }
  }
  return steps.length >= 3 && steps.filter(s => s.image).length >= 2 ? steps : null
}

export function extractSteps(html: string, pageUrl: string): Step[] | null {
  for (const steps of [fromJsonLd(html, pageUrl), fromWprm(html, pageUrl), fromArticle(html, pageUrl)]) {
    if (steps && steps.length && steps.some(s => s.image)) return steps
  }
  return null
}
