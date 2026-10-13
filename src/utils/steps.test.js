import { describe, it, expect } from 'vitest'
import { findDurations, leadTimes, describeLead } from './steps'

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
  const says = recipe => leadTimes(recipe).map(describeLead)

  it('finds plan-ahead work and keeps the recipe\'s own qualifier', () => {
    expect(says({ steps: [
      'Leave in a refrigerator to marinate for at least 24 hours. Fresh chicken should marinate for 48 hours for best results.',
      'Grill for 5-8 minutes on each side.',
    ] })).toEqual(['Marinate for at least 24 h'])
    // Idli: an upper limit stays an upper limit.
    expect(says({ steps: ['Soak the rice and urad dal for no more than 2 hours.'] }))
      .toEqual(['Soak for no more than 2 h'])
    expect(says({ steps: ['Let the batter ferment for 8-10 hours.'] })).toEqual(['Ferment for 8 h–10 h'])
    expect(says({ steps: ['Marinate for about an hour.'] })).toEqual(['Marinate for 1 h'])
    expect(says({ steps: ['Soak the chickpeas overnight.'] })).toEqual(['Soak overnight'])
  })

  it('keeps separate chills in different steps, in order', () => {
    expect(says({ steps: ['Chill the base for 2 hours.', 'Add the topping.', 'Chill again for 1 hour.'] }))
      .toEqual(['Chill for 2 h', 'Chill for 1 h'])
  })

  it('ignores storage notes and "up to" limits', () => {
    expect(leadTimes({ steps: [
      'Fry for 2 minutes each side.',
      'Store leftover shrimp tightly covered in the refrigerator for up to 3 days.',
    ] })).toEqual([])
    expect(leadTimes({ steps: ['Chill the dough, up to 3 days.'] })).toEqual([])
    expect(says({ steps: ['Chill for at least 2 hours, or up to 3 days.'] })).toEqual(['Chill for at least 2 h'])
  })

  it('does not count a short rest or a timing in a different sentence', () => {
    expect(leadTimes({ steps: ['Let the dough rest for 10 minutes.'] })).toEqual([])
    expect(leadTimes({ steps: ['Marinate the chicken. Bake for 1 hour.'] })).toEqual([])
    expect(leadTimes({ steps: ['If the dough has chilled longer than 2 hours, let it stand for 15 minutes.'] })).toEqual([])
  })
})
