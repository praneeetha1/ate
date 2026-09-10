/**
 * The typed part of a suggestion, emphasised inside the whole name.
 *
 * Shared by the two ingredient boxes — Search's picker and the pantry's add
 * field — so a suggestion list looks the same wherever it appears.
 */
export default function Highlight({ text, query }) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <em className="text-accent-dk font-bold not-italic">{text.slice(idx, idx + query.length)}</em>
      {text.slice(idx + query.length)}
    </>
  )
}
