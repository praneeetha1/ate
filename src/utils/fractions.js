export function parseFrac(s) {
  if (!s) return null
  s = String(s).trim()
  let m
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + +m[2] / +m[3]
  if ((m = s.match(/^(\d+)\/(\d+)$/)))           return +m[1] / +m[2]
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
