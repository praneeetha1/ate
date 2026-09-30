/** The vulgar fractions fmtFrac can emit, so its output can be read back in. */
const VULGAR = {
  '\u00bd': 1/2, '\u2153': 1/3, '\u2154': 2/3, '\u00bc': 1/4, '\u00be': 3/4,
  '\u215b': 1/8, '\u215c': 3/8, '\u215d': 5/8, '\u215e': 7/8,
  '\u2155': 1/5, '\u2156': 2/5, '\u2157': 3/5, '\u2158': 4/5,
  '\u2159': 1/6, '\u215a': 5/6,
}

export function parseFrac(s) {
  if (!s) return null
  s = String(s).trim()
  let m

  // "2 1/4" and "2 and 1/4" alike. Publishers write both and the importer
  // passes through whichever the page used — Sally's writes "2 and 1/4", and
  // without the "and" branch that parsed as a bare 2, quietly losing the
  // quarter and scaling every serving wrong.
  if ((m = s.match(/^(\d+)\s+(?:and\s+)?(\d+)\/(\d+)$/i))) return +m[1] + +m[2] / +m[3]
  if ((m = s.match(/^(\d+)\/(\d+)$/)))                        return +m[1] / +m[2]

  // "2\u00bc", "2 \u00bc", "\u00bc" — what fmtFrac renders, which an edited amount
  // can hand straight back.
  if ((m = s.match(/^(\d*)\s*([\u00bd\u2153\u2154\u00bc\u00be\u215b\u215c\u215d\u215e\u2155\u2156\u2157\u2158\u2159\u215a])$/)))
    return (+m[1] || 0) + VULGAR[m[2]]

  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

export function fmtFrac(x) {
  if (x == null || x <= 0) return ''
  const FRACS = [[1/8,'⅛'],[1/4,'¼'],[1/3,'⅓'],[3/8,'⅜'],[1/2,'½'],[5/8,'⅝'],[2/3,'⅔'],[3/4,'¾'],[7/8,'⅞']]
  const whole = Math.floor(x + 0.04)
  const rem   = x - whole
  let fStr = ''
  if (rem > 0.05) {
    let best = null, bd = 0.08
    for (const [v, sym] of FRACS) {
      const d = Math.abs(rem - v)
      if (d < bd) { bd = d; best = sym }
    }
    fStr = best || ''
  }
  if (whole && fStr) return `${whole} ${fStr}`
  if (whole) return String(whole)
  return fStr || String(Math.round(x * 100) / 100)
}
