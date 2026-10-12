/**
 * Reading times out of free-text steps.
 *
 * Neither the catalog nor imported recipes carry structured timings — just
 * "simmer for 10-12 minutes" in a sentence — so both the cook-mode timers and
 * the plan-ahead warning come from here. Conservative on purpose: a missed
 * timer costs the cook a tap on their own clock, a phantom one is noise.
 */

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 }

function num(s) {
  if (!s) return null
  s = s.trim().toLowerCase()
  if (s in WORDS) return WORDS[s]
  let m
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + +m[2] / +m[3]
  if ((m = s.match(/^(\d+)\/(\d+)$/)))         return +m[1] / +m[2]
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

const N    = '(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|an?|one|two|three|four|five|six|eight|ten|twelve|fifteen|twenty|thirty)'
const UNIT = '(days?|weeks?|hours?|hrs?|minutes?|mins?)'
const DURATION = new RegExp(
  // "1 hour 30 minutes" / "1 hr and 15 min"
  `\\b${N}\\s*(?:hours?|hrs?)\\s*(?:and\\s*)?(\\d+)\\s*(?:minutes?|mins?)\\b` +
  // "10-12 minutes", "2 to 3 hours", "45 min"
  `|\\b${N}(?:\\s*(?:-|–|to|or)\\s*${N})?\\s*${UNIT}\\b` +
  `|\\b(half an hour|overnight)\\b`,
  'gi',
)

const toMin = (n, unit) =>
  /^w/i.test(unit) ? n * 7 * 1440 : /^d/i.test(unit) ? n * 1440 : /^h/i.test(unit) ? n * 60 : n

/**
 * Every duration mentioned in one step, in order.
 * [{ text, minutes, maxMinutes, overnight, upTo }] — `minutes` is the low end
 * of a range, which is when you should first check. `upTo` marks a limit
 * ("keeps for up to 3 days") rather than an instruction.
 */
export function findDurations(step) {
  const out = []
  step = String(step || '')
  for (const m of step.matchAll(DURATION)) {
    let lo, hi, overnight = false
    if (m[1] != null) {
      lo = hi = num(m[1]) * 60 + +m[2]
    } else if (m[3] != null) {
      const a = num(m[3]), b = num(m[4])
      if (a == null) continue
      lo = toMin(a, m[5]); hi = b != null ? toMin(b, m[5]) : lo
    } else if (/half/i.test(m[6])) {
      lo = hi = 30
    } else {
      lo = hi = 8 * 60; overnight = true
    }
    if (!(lo > 0)) continue
    // Only "up to": "soak for no more than 2 hours" caps a soak you still
    // have to do, whereas "keeps for up to 3 days" is optional.
    const upTo = /\bup to\s*$/i.test(step.slice(0, m.index))
    out.push({ text: m[0], minutes: Math.round(lo), maxMinutes: Math.round(hi), overnight, upTo })
  }
  return out
}

/**
 * Work that has to start well before cooking does.
 *
 * Only these verbs count, because they're the ones you can't speed up or
 * do while something else cooks. Marinating and soaking flag from 30 minutes;
 * the rest from an hour — a 20-minute rest is part of cooking, not planning.
 */
const PREP = [
  ['Marinate', /\bmarinat/i, 30],
  ['Soak',     /\bsoak/i, 30],
  ['Ferment',  /\bferment/i, 30],
  ['Rise',     /\b(rise|prove|proof)\b/i, 60],
  ['Chill',    /\b(chill|refrigerat|fridge|freeze)/i, 60],
  ['Set',      /\bset\b/i, 60],
  ['Rest',     /\brest\b/i, 60],
]

const STORAGE = /\b(store|stored|leftovers?|keeps?|will keep|lasts?)\b/i

/** [{ label, minutes, overnight, step }], longest first, one per kind, at its minimum. */
export function leadTimes(recipe) {
  const found = new Map()
  ;(recipe?.steps || []).forEach((step, i) => {
    // Sentence by sentence, so "Marinate the chicken. Bake for 1 hour" doesn't
    // turn the bake into an hour of marinating.
    for (const sentence of String(step).split(/(?<=[.;!?])\s+/)) {
      // Storing leftovers isn't prep: "Store in the refrigerator for up to 3
      // days" was coming out as "Chill for at least 72 h" before you start.
      if (STORAGE.test(sentence)) continue
      // The first real instruction; later ones are usually "…or 48 hours for
      // best results", and an "up to 3 days" is a limit, not a requirement.
      const d = findDurations(sentence).find(x => !x.upTo)
      if (!d) continue
      for (const [label, rx, min] of PREP) {
        if (!rx.test(sentence)) continue
        if (!d.overnight && d.maxMinutes < min) continue
        // The least you can get away with: that's what has to be planned for.
        const prev = found.get(label)
        if (!prev || d.minutes < prev.minutes) {
          found.set(label, { label, minutes: d.minutes, overnight: d.overnight, step: i })
        }
        break
      }
    }
  })
  return [...found.values()].sort((a, b) => b.minutes - a.minutes)
}
