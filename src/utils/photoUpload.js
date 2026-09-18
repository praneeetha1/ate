import { supabase } from '../lib/supabase'
import { fileToBlob } from './imageFile'

export const PHOTO_BUCKET = 'recipe-photos'

/**
 * Put a photo of the dish in storage and hand back its URL.
 *
 * Imported recipes link the publisher's picture, which costs nothing and keeps
 * it where its owner put it — but a photo of what *you* cooked has to live
 * somewhere, so it goes in a public bucket and `image_url` points at it.
 *
 * Filed under the uploader's own id, which is what the storage policy checks:
 * one cook can't write into another's folder. Downscaled first, so a 4 MB
 * phone photo lands as a couple of hundred kilobytes.
 */
export async function uploadRecipePhoto(file, uid) {
  if (!uid) throw new Error('Sign in to upload a photo.')

  const blob = await fileToBlob(file)
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const path = `${uid}/${id}.jpg`

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })

  if (error) {
    console.error('Photo upload failed:', error)
    // A missing bucket is the one failure worth naming precisely, because the
    // fix is a migration rather than anything the cook can do.
    throw new Error(/bucket/i.test(error.message || '')
      ? 'Photo storage isn’t set up yet — run migration 012.'
      : 'Could not upload that photo.')
  }

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  return data.publicUrl
}
