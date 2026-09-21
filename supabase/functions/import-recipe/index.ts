/**
 * import-recipe — turns a link, a blob of text, or a screenshot into a draft.
 *
 * This exists because the browser can't do either half of the job: it can't
 * fetch a recipe page (CORS), and it can't hold the model API key (anything in
 * the bundle is public). So the key lives here as a Supabase secret and the
 * client only ever sees its own stable shape back.
 *
 * Deliberately one interface for all three inputs, so the client has one code
 * path whether the user pasted a URL, a YouTube description, or a screenshot
 * of an Instagram post:
 *
 *   POST { url }         -> fetch the page, feed it to the model
 *   POST { text }        -> feed the text straight to the model
 *   POST { images: [dataUrl] } -> feed the pictures to a vision model
 *   <-   { recipe: {...}, warning? }
 *
 * The model is behind this boundary on purpose. Swapping provider is a change
 * to CHAT_URL/MODEL and nothing else — no client redeploy.
 *
 * Deploy:
 *   supabase secrets set GROQ_API_KEY=...
 *   supabase functions deploy import-recipe
 */

import { looksLikeRecipe } from './recipeSignal.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Groq speaks the OpenAI chat API, so switching to another OpenAI-compatible
// provider is a URL and a key. Model ids move around — override with a secret
// rather than editing this file.
const CHAT_URL = Deno.env.get('CHAT_URL') ?? 'https://api.groq.com/openai/v1/chat/completions'
const MODEL        = Deno.env.get('GROQ_MODEL')        ?? 'llama-3.3-70b-versatile'
const VISION_MODEL = Deno.env.get('GROQ_VISION_MODEL') ?? MODEL

// The catalog's own categories. Kept in step with CATALOG_CATEGORIES on the
// client: a value outside this list falls through tagStyles() to the generic
// swatch and matches no section.
const CATEGORIES = [
  'Bread & Baking', 'Breakfast', 'Dessert', 'Drink', 'Main Dish',
  'Pasta & Noodles', 'Quick Meal', 'Salad', 'Side Dish',
  'Snack & Appetizer', 'Soup & Stew', 'Vegetarian',
]

const SYSTEM = `You extract recipes into strict JSON. Reply with JSON only.

Schema:
{
  "name": string,
  "category": one of ${JSON.stringify(CATEGORIES)},
  "dietary": array of any of ["vegetarian","vegan","gluten-free","dairy-free"],
  "ingredients": [{ "amount": string, "unit": string, "item": string }],
  "steps": [string],
  "timeMinutes": number or null,
  "servings": number or null,
  "image": string URL or null
}

Rules:
- amount is digits only, as written: "2", "1/2", "1 1/2". Empty string if none.
- unit is a single word: cup, tablespoon, teaspoon, g, ml, clove. Empty if none.
- item is the ingredient alone, without its quantity.
- steps are the method in order, one sentence or more each, plain text.
- NEVER invent a quantity. If the source doesn't give one, use "".
- If the input is not a recipe, return {"error":"not a recipe"}.`

/**
 * Sites that serve a login wall to anything without a session.
 *
 * Fetching an Instagram post returns 727 kB of HTML containing `accounts/login`
 * and no caption — and a *made-up* post id returns the same 200, so there is
 * nothing to detect after the fact either. Their oEmbed now needs an approved
 * app, so this isn't a gap to close later; the door is shut.
 *
 * Caught before the fetch rather than after: it saves pulling down a megabyte
 * of login page, and it lets the message name the real problem. The generic
 * "that doesn't look like a recipe" implied the cook's recipe was at fault
 * when no link from these hosts can ever work.
 *
 * Matched on hostname, not substring — "instagram.com.example.org" is not
 * Instagram.
 */
const CLOSED_PLATFORMS: Array<[RegExp, string]> = [
  [/(^|\.)instagram\.com$/i, 'Instagram'],
  [/(^|\.)tiktok\.com$/i,    'TikTok'],
  [/(^|\.)facebook\.com$/i,  'Facebook'],
  [/(^|\.)fb\.watch$/i,      'Facebook'],
  [/(^|\.)threads\.net$/i,   'Threads'],
  [/(^|\.)x\.com$/i,         'X'],
  [/(^|\.)twitter\.com$/i,   'X'],
  [/(^|\.)snapchat\.com$/i,  'Snapchat'],
]

function closedPlatform(hostname: string): string | null {
  for (const [pattern, name] of CLOSED_PLATFORMS) {
    if (pattern.test(hostname)) return name
  }
  return null
}

const YOUTUBE =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/

function unescapeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** A <meta> value, whichever order the attributes happen to be in. */
function meta(html: string, prop: string): string {
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i')) ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
  return m ? unescapeEntities(m[1]) : ''
}

/**
 * A video's title, description and thumbnail.
 *
 * A YouTube page is a JavaScript shell — stripping its tags yields nothing a
 * model can read, which is why pasting a video link used to fail. The real
 * description is in the `ytInitialPlayerResponse` blob the page ships with, as
 * a JSON-escaped string, and the thumbnail is in the usual og: tags.
 *
 * This only ever works as well as the creator's description. Plenty of cooking
 * channels put the full recipe there; plenty put "link in bio". The caller
 * says so plainly rather than feeding the model a description with no recipe
 * in it and passing on whatever it invents.
 */
/**
 * A video's details from the official Data API.
 *
 * Scraping the watch page works from a laptop and fails from here: YouTube
 * serves a consent/bot interstitial to datacenter IPs for most videos — four
 * real cooking videos tested, all walled, while one heavily-cached video came
 * through. Consent cookies (CONSENT, SOCS) don't lift it, so this isn't a
 * header we're missing; the scrape is simply unreliable from a server.
 *
 * The API has none of that problem and is free: the default quota is 10,000
 * units a day and `videos.list` costs 1, so a personal app will never approach
 * it. Without a key we fall back to scraping, which still works for some
 * videos and degrades to a clear message for the rest.
 *
 * Get a key: Google Cloud console -> enable "YouTube Data API v3" -> create an
 * API key -> `supabase secrets set YOUTUBE_API_KEY=...`
 */
async function youtubeFromApi(videoId: string) {
  const key = Deno.env.get('YOUTUBE_API_KEY')
  if (!key) return null

  const endpoint = 'https://www.googleapis.com/youtube/v3/videos'
    + `?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`
  try {
    const res = await fetch(endpoint)
    if (!res.ok) {
      console.error('youtube data api', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const snippet = (await res.json())?.items?.[0]?.snippet
    if (!snippet) return null
    const thumbs = snippet.thumbnails || {}
    return {
      description: String(snippet.description || ''),
      title: String(snippet.title || ''),
      image: String((thumbs.maxres || thumbs.high || thumbs.medium || {}).url || ''),
    }
  } catch (err) {
    console.error('youtube data api failed', err)
    return null
  }
}

function youtubeContent(html: string) {
  let description = ''
  const m = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)
  if (m) {
    try { description = JSON.parse(`"${m[1]}"`) } catch { /* leave it blank */ }
  }
  return { description, title: meta(html, 'og:title'), image: meta(html, 'og:image') }
}

/** Strip a page to something worth spending tokens on. */
function pageToText(html: string): string {
  // A recipe page that publishes JSON-LD has already done the extraction work,
  // so hand the model that instead of the whole document. Not a second parser
  // — just better input. Falls through to the text when absent or unusable.
  const blocks = [...html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )]
  for (const [, body] of blocks) {
    if (/"@type"\s*:\s*"?Recipe/i.test(body)) return body.slice(0, 20000)
  }

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000)
}

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Coerce whatever the model returned into the shape the app stores. */
function normalize(raw: any, sourceUrl: string | null) {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const num = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }

  const ingredients = (Array.isArray(raw?.ingredients) ? raw.ingredients : [])
    .map((i: any) => ({ amount: str(i?.amount), unit: str(i?.unit), item: str(i?.item) }))
    .filter((i: any) => i.item)

  const steps = (Array.isArray(raw?.steps) ? raw.steps : [])
    .map((s: any) => (typeof s === 'string' ? s.trim() : str(s?.text)))
    .filter(Boolean)

  const recipe: Record<string, unknown> = {
    name: str(raw?.name) || 'Untitled recipe',
    category: CATEGORIES.includes(str(raw?.category)) ? str(raw.category) : 'Main Dish',
    dietary: (Array.isArray(raw?.dietary) ? raw.dietary : []).filter(
      (d: unknown) => typeof d === 'string',
    ),
    ingredients,
    steps,
  }
  const t = num(raw?.timeMinutes); if (t) recipe.timeMinutes = t
  const s = num(raw?.servings);    if (s) recipe.servings = s
  const img = str(raw?.image);     if (/^https?:\/\//.test(img)) recipe.image = img
  if (sourceUrl) recipe.sourceUrl = sourceUrl

  return recipe
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return bad('POST only', 405)

  // Without this the function is an open URL fetcher anyone can point at
  // anything. Supabase verifies the JWT ahead of us; this just refuses the
  // anonymous case rather than doing work for it.
  if (!req.headers.get('Authorization')) return bad('Sign in to import recipes.', 401)

  const key = Deno.env.get('GROQ_API_KEY')
  if (!key) return bad('Import is not configured: GROQ_API_KEY is unset.', 500)

  let body: any
  try { body = await req.json() } catch { return bad('Expected a JSON body.') }

  const { url, text, images, imageBase64 } = body ?? {}

  /**
   * Pictures arrive as full `data:image/…;base64,…` URLs, so the file type
   * travels with the bytes. This used to take bare base64 and label all of it
   * `image/jpeg`, which was wrong for the PNG a phone screenshot usually is —
   * it only worked because the model was forgiving.
   *
   * An array, because one recipe often doesn't fit in one screenshot: the
   * ingredients in the first, the method in the second. They go into a single
   * message so the model reads them as one recipe rather than several.
   *
   * `imageBase64` is still accepted so an older client isn't broken by this.
   */
  const pictures: string[] = Array.isArray(images)
    ? images.filter((p: unknown) => typeof p === 'string')
    : typeof imageBase64 === 'string' && imageBase64
      ? [`data:image/jpeg;base64,${imageBase64}`]
      : []

  if (pictures.length) {
    if (pictures.length > 4) return bad('Four images at most.')
    if (!pictures.every(p => /^data:image\/(jpe?g|png|webp|gif);base64,/i.test(p))) {
      return bad('Images must be sent as data URLs.')
    }
    const bytes = pictures.reduce((n, p) => n + Math.floor(p.length * 3 / 4), 0)
    // Beyond this the request is refused upstream anyway, and a clear message
    // beats a generic 413. The client downscales precisely to stay under it.
    if (bytes > 6 * 1024 * 1024) return bad('Those images are too large — try fewer, or smaller ones.')
  }
  let content: unknown
  let sourceUrl: string | null = null
  // A video has a thumbnail but the description never names it, so it comes
  // from the page rather than from anything the model returns.
  let fallbackImage = ''

  try {
    if (url) {
      let target: URL
      try { target = new URL(url) } catch { return bad('That doesn’t look like a link.') }
      if (!/^https?:$/.test(target.protocol)) return bad('Only http and https links work.')

      const closed = closedPlatform(target.hostname)
      if (closed) {
        return bad(`${closed} doesn’t let apps read posts. Take a screenshot and use the camera button instead — it reads the recipe straight off the picture.`)
      }

      sourceUrl = target.toString()

      // Some sites serve a stub to anything that doesn't look like a browser.
      const page = await fetch(target, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ate-recipe-import/1.0)' },
        redirect: 'follow',
      })
      if (!page.ok) return bad(`That page returned ${page.status}.`)
      const html = await page.text()

      if (YOUTUBE.test(target.href)) {
        // The API when a key is configured, the scrape otherwise.
        const videoId = target.href.match(YOUTUBE)?.[1] ?? ''
        const video = (videoId && await youtubeFromApi(videoId)) || youtubeContent(html)
        // Short enough to be "subscribe for more" and nothing else. Better to
        // say so than to hand the model 40 characters and publish its guess.
        if (video.description.trim().length < 40) {
          return bad(Deno.env.get('YOUTUBE_API_KEY')
            ? 'That video’s description has no recipe in it. Open the video, copy the ingredients and method from the description, and paste those here instead.'
            : 'Couldn’t read that video’s description — YouTube blocks most server-side reads. Copy the recipe out of the description and paste it here, or set YOUTUBE_API_KEY to read videos directly.')
        }
        // Long enough isn't the same as being a recipe: "follow me on
        // Instagram, shot on a Sony ZV-E10, music by Epidemic Sound" clears 40
        // characters easily. Both fields are already in hand, so reading them
        // costs nothing and saves a model call on links that were never
        // cooking videos.
        if (!looksLikeRecipe(`${video.title}\n${video.description}`)) {
          return bad('That doesn’t look like a cooking video — there’s no recipe in its title or description. If it is one, copy the ingredients and method out of the description and paste them here.')
        }
        fallbackImage = video.image
        content = `${video.title}\n\n${video.description}`.slice(0, 12000)
      } else {
        content = pageToText(html)
      }
      if (!content) return bad('Nothing readable on that page.')
    } else if (text) {
      content = String(text).slice(0, 12000)
    } else if (pictures.length) {
      content = null   // the images are the content; see below
    } else {
      return bad('Send a url, some text, or one or more images.')
    }

    const messages = pictures.length
      ? [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: [
            { type: 'text', text: pictures.length > 1
              ? `These ${pictures.length} images are one recipe between them. Extract it once.`
              : 'Extract the recipe from this image.' },
            ...pictures.map(p => ({ type: 'image_url', image_url: { url: p } })),
          ] },
        ]
      : [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Extract the recipe.\n\n${content}` },
        ]

    const res = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: pictures.length ? VISION_MODEL : MODEL,
        messages,
        temperature: 0,               // extraction, not writing
        response_format: { type: 'json_object' },
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error('model call failed', res.status, detail.slice(0, 500))

      // The upstream reason, surfaced rather than swallowed. "Could not read
      // that" is the same message whether the model id is wrong, the key is
      // rejected, or the quota is spent — three problems with three different
      // fixes, and no way to tell them apart from the client. None of this is
      // sensitive: it is configuration, not credentials.
      let reason = ''
      try { reason = JSON.parse(detail)?.error?.message ?? '' } catch { /* not JSON */ }
      reason = String(reason).slice(0, 300)

      if (res.status === 429) {
        return bad('The importer is rate limited right now — try again in a minute.', 502)
      }
      if (res.status === 401 || res.status === 403) {
        return bad('The importer’s API key was rejected. Check GROQ_API_KEY.', 502)
      }
      if (res.status === 404 || /model/i.test(reason)) {
        return bad(`The importer’s model looks wrong — set GROQ_MODEL. Upstream said: ${reason || res.status}`, 502)
      }
      return bad(`The importer failed (${res.status}). ${reason}`.trim(), 502)
    }

    const payload = await res.json()
    const reply = payload?.choices?.[0]?.message?.content ?? ''
    let parsed: any
    try { parsed = JSON.parse(reply) } catch {
      console.error('model returned non-JSON', reply.slice(0, 500))
      return bad('The importer could not read that.', 502)
    }
    if (parsed?.error) return bad('That doesn’t look like a recipe.')

    const recipe = normalize(parsed, sourceUrl)
    if (!recipe.image && fallbackImage) recipe.image = fallbackImage
    if (!recipe.ingredients.length && !recipe.steps.length) {
      return bad('No ingredients or steps found there.')
    }

    // Surfaced rather than silently accepted: a half-read recipe is worth
    // reviewing, and the client lands this in an editable form anyway.
    const warning = !recipe.ingredients.length ? 'No ingredients found — add them by hand.'
      : !recipe.steps.length ? 'No method found — add the steps by hand.'
      : undefined

    return new Response(JSON.stringify({ recipe, warning }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('import failed', err)
    return bad('Could not reach that page.', 502)
  }
})
