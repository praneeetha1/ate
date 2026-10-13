import { describe, it, expect } from 'vitest'
import { extractSteps } from './stepImages'

const page = (ld: unknown, body = '') =>
  `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>${body}</body></html>`
const URL_ = 'https://example.com/recipes/dal/'

describe('per-step photos from a recipe page', () => {
  it('reads HowToStep images, in order, keeping steps without one', () => {
    const steps = extractSteps(page({
      '@context': 'https://schema.org', '@type': 'Recipe', name: 'Dal',
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Rinse the dal.', image: 'https://example.com/1.jpg' },
        { '@type': 'HowToStep', text: 'Pressure cook &amp; mash.' },
        { '@type': 'HowToStep', text: 'Temper and pour over.', image: { '@type': 'ImageObject', url: '/img/3.jpg' } },
      ],
    }), URL_)
    expect(steps).toEqual([
      { text: 'Rinse the dal.', image: 'https://example.com/1.jpg' },
      { text: 'Pressure cook & mash.', image: null },
      { text: 'Temper and pour over.', image: 'https://example.com/img/3.jpg' },
    ])
  })

  it('finds the recipe inside a Yoast @graph and flattens sections', () => {
    const steps = extractSteps(page({ '@graph': [
      { '@type': 'WebPage' },
      { '@type': ['Recipe'], recipeInstructions: [
        { '@type': 'HowToSection', name: 'Batter', itemListElement: [
          { '@type': 'HowToStep', text: 'Grind.', image: ['https://cdn.example.com/a.jpg'] },
        ] },
        { '@type': 'HowToSection', name: 'Steam', itemListElement: [
          { '@type': 'HowToStep', text: 'Steam 10 minutes.' },
        ] },
      ] },
    ] }), URL_)
    expect(steps?.map(s => s.text)).toEqual(['Grind.', 'Steam 10 minutes.'])
    expect(steps?.[0].image).toBe('https://cdn.example.com/a.jpg')
  })

  it('falls back to WP Recipe Maker markup, reading lazy-loaded images', () => {
    const html = page({ '@type': 'Recipe', recipeInstructions: [{ '@type': 'HowToStep', text: 'Soak.' }] }, `
      <ul><li id="i1" class="wprm-recipe-instruction"><div class="wprm-recipe-instruction-text">Soak rice.</div>
        <div class="wprm-recipe-instruction-media"><img src="data:image/svg+xml,x" data-lazy-src="/wp/soak.jpg"></div></li>
      <li class="wprm-recipe-instruction"><div class="wprm-recipe-instruction-text">Grind <b>smooth</b>.</div></li></ul>`)
    expect(extractSteps(html, URL_)).toEqual([
      { text: 'Soak rice.', image: 'https://example.com/wp/soak.jpg' },
      { text: 'Grind smooth.', image: null },
    ])
  })

  it('returns null when no step has a photo, so the model\'s steps stand', () => {
    expect(extractSteps(page({ '@type': 'Recipe', recipeInstructions: ['Mix.', 'Bake.'] }), URL_)).toBeNull()
    expect(extractSteps('<p>no recipe here</p>', URL_)).toBeNull()
  })

  it('ignores broken JSON-LD and non-http images', () => {
    const html = '<script type="application/ld+json">{oops</script>' + page({ '@type': 'Recipe', recipeInstructions: [
      { '@type': 'HowToStep', text: 'A', image: 'javascript:alert(1)' },
      { '@type': 'HowToStep', text: 'B', image: 'https://x.com/b.jpg' },
    ] })
    expect(extractSteps(html, URL_)).toEqual([
      { text: 'A', image: null },
      { text: 'B', image: 'https://x.com/b.jpg' },
    ])
  })
})

describe('stepwise photos in the article', () => {
  const article = (extra = '') => `
    <h2>Aloo Gobi</h2><p>Intro.</p><img src="https://x.com/hero.jpg">
    <h2 class="wp-block-heading">How to make Aloo Gobi (Stepwise photos)</h2>
    <h3>Preparation</h3>
    <p>1. Prepare the following:</p><ul><li>Cube 2 potatoes.</li><li>Chop &amp; rinse gobi.</li></ul>
    <p>Tip: use firm potatoes.</p>
    <p>2. Heat 2 tablespoons oil.</p>
    <figure><img src="data:image/svg+xml,x" data-lazy-src="https://x.com/2.jpg"><noscript><img src="https://x.com/2.jpg"></noscript></figure>
    <p>3. Add onions.</p><figure><img src="https://x.com/3.jpg"></figure>
    ${extra}
    <h2>FAQs</h2><p>1. Can I freeze it?</p><img src="https://x.com/faq.jpg">`

  it('pairs each numbered step with the photo after it, and stops at the next heading', () => {
    expect(extractSteps(article(), URL_)).toEqual([
      { text: 'Prepare the following: Cube 2 potatoes. Chop & rinse gobi.', image: null },
      { text: 'Heat 2 tablespoons oil.', image: 'https://x.com/2.jpg' },
      { text: 'Add onions.', image: 'https://x.com/3.jpg' },
    ])
  })

  it('stops when the numbering restarts for a second recipe', () => {
    const steps = extractSteps(article('<p>1. Recipe two begins.</p><img src="https://x.com/r2.jpg">'), URL_)
    expect(steps?.map(s => s.text)).not.toContain('Recipe two begins.')
  })
})
