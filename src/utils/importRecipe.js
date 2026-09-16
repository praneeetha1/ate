import { supabase } from '../lib/supabase'

/**
 * Ask the import-recipe function to turn a link, some text, or a screenshot
 * into a draft recipe.
 *
 * One call for all three inputs, because the function returns the same shape
 * whichever it was given — so the caller never branches on where the recipe
 * came from. Always resolves to a draft the user reviews before saving: the
 * model can misread a quantity, and nothing here writes to the database.
 *
 * `invoke` attaches the signed-in user's token, which the function requires —
 * otherwise it would be an open URL fetcher for anyone who found the endpoint.
 */
export async function importRecipe(input) {
  const { data, error } = await supabase.functions.invoke('import-recipe', { body: input })

  if (error) {
    // A non-2xx from the function carries our own message in the body, which
    // is far more useful than "Edge Function returned a non-2xx status code".
    let detail = ''
    try { detail = (await error.context?.json())?.error || '' } catch { /* keep the generic one */ }
    throw new Error(detail || 'Could not import that recipe.')
  }
  if (data?.error) throw new Error(data.error)
  if (!data?.recipe) throw new Error('Could not import that recipe.')

  return data
}

/** True for something worth sending as a URL rather than as pasted text. */
export function looksLikeUrl(value) {
  const s = String(value || '').trim()
  if (/\s/.test(s)) return false
  return /^https?:\/\/\S+\.\S+/i.test(s)
}
