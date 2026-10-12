import { describe, it, expect } from 'vitest'
import { findDurations, leadTimes } from './steps'

describe('findDurations', () => {
  const mins = s => findDurations(s).map(d => [d.minutes, d.maxMinutes])

  it('reads plain, ranged and worded durations', () => {
    expect(mins('Simmer for 10 minutes.')).toEqual([[10, 10]])
    expect(mins('Steam for 8-10 minutes, then rest 5 min')).toEqual([[8, 10], [5, 5]])
    expect(mins('Cook on Low for 7 to 8 hours.')).toEqual([[420, 480]])
    expect(mins('marinate for about an hour')).toEqual([[60, 60]])
    expect(mins('Refrigerate for another half an hour.')).toEqual([[30, 30]])
    expect(mins('cook on high heat for ten minutes')).toEqual([[10, 10]])
  })

  it('combines hours and minutes said together', () => {
    expect(mins('Bake for 1 hour 15 minutes')).toEqual([[75, 75]])
  })

  it('flags overnight', () => {
    expect(findDurations('Soak the chickpeas overnight.')[0]).toMatchObject({ overnight: true })
  })

  it('ignores numbers that are not times', () => {
    expect(mins('Cut into 1-inch cubes and add 2 cups of water.')).toEqual([])
  })
})

describe('leadTimes', () => {
  it('finds plan-ahead work at the least it needs', () => {
    const tikka = { steps: [
      'Leave in a refrigerator to marinate for at least 24 hours. Fresh chicken should marinate for 48 hours for best results.',
      'Grill for 5-8 minutes on each side.',
    ] }
    expect(leadTimes(tikka)).toEqual([{ label: 'Marinate', minutes: 1440, overnight: false, step: 0 }])
  })

  it('lists several kinds, longest first', () => {
    const idli = { steps: ['Soak the rice for 2 hours.', 'Let the batter ferment for 8-10 hours.'] }
    expect(leadTimes(idli).map(l => l.label)).toEqual(['Ferment', 'Soak'])
  })

  it('ignores storage notes and "up to" limits', () => {
    expect(leadTimes({ steps: [
      'Fry for 2 minutes each side.',
      'Store leftover shrimp tightly covered in the refrigerator for up to 3 days.',
    ] })).toEqual([])
    expect(leadTimes({ steps: ['Chill the dough, up to 3 days.'] })).toEqual([])
    expect(leadTimes({ steps: ['Chill for at least 2 hours, or up to 3 days.'] }))
      .toEqual([{ label: 'Chill', minutes: 120, overnight: false, step: 0 }])
  })

  it('does not count a short rest or a timing in a different sentence', () => {
    expect(leadTimes({ steps: ['Let the dough rest for 10 minutes.'] })).toEqual([])
    expect(leadTimes({ steps: ['Marinate the chicken. Bake for 1 hour.'] })).toEqual([])
  })
})
