import type { DesignInks } from './pattern'

export interface CupDesign {
  id: string
  name: string
  japanese: string
  note: string
  sources: { title: string; url: string }[]
  // Corps SVG en unités de paroi (millièmes) ; chaque motif se répète un nombre entier
  // de fois sur la largeur, donc la jointure tombe entre deux répétitions.
  draw(width: number, height: number): string
}

// Couleur commune aux trois motifs, hors texture : les encres sont des uniformes du shader.
export const designColors: Record<string, string> & DesignInks = {
  body: '#2a3c74', inside: '#060d42', rim: '#354982', border: '#111e54', eyes: '#fffef9',
  background: '#2a3c74', inkA: '#e9e6df', inkB: '#e9e6df'
}

const n = (value: number) => Math.round(value * 1e6) / 1e6

// Copies de part et d'autre de la largeur : un motif coupé par le bord réapparaît de l'autre côté.
function around(width: number, count: number, offset: number, draw: (x: number) => string): string {
  const period = width / count
  let out = ''
  for (let k = -1; k <= count; k++) out += draw(offset + k * period)
  return out
}

export const yunomiDesigns: CupDesign[] = [
  {
    id: 'seigaiha',
    name: 'Waves',
    japanese: 'Seigaiha · 青海波',
    note: 'Overlapping, staggered waves with two broad arcs each. Simplified for small avatars; the repeat count is a composition choice, not a cultural rule.',
    sources: [
      { title: 'JAANUS · Seigaiha wave pattern', url: 'https://www.aisf.or.jp/~jaanus/deta/s/seigaiha.htm' }
    ],
    draw(width, height) {
      const count = 6
      const r = width / count / 2
      const stroke = r * 0.2
      let out = ''
      for (let row = 0, y = height * 0.1 + r; y - r < height; row++, y += r / 2) {
        out += around(width, count, row % 2 ? r : 0, x =>
          `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="var(--body)"/>`
          + [0.86, 0.4].map(k => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r * k)}" fill="none" stroke="var(--ink-a)" stroke-width="${n(stroke)}"/>`).join(''))
      }
      return out
    }
  },
  {
    id: 'tokusa',
    name: 'Stripes',
    japanese: 'Tokusa · 木賊',
    note: 'Bold upright stripes after horsetail stems, a common pattern on Japanese teacups. Ten repeats leave generous gaps; there is no prescribed stripe count.',
    sources: [
      { title: 'Fine Crafters · Tokusa Japanese tableware', url: 'https://www.finecrafters.co.uk/blogs/journal/tokusa-japanese-tableware-timeless-stripes-inspired-by-tradition' },
      { title: 'Musubi Kiln · Tokusa (horsetail) items', url: 'https://musubikiln.com/collections/tokusa-horsetail-motif-items' }
    ],
    draw(width, height) {
      const count = 10
      const stripe = width / count * 0.42
      return around(width, count, width / count / 2, x =>
        `<rect x="${n(x - stripe / 2)}" y="${n(height * 0.12)}" width="${n(stripe)}" height="${n(height * 0.76)}" fill="var(--ink-a)"/>`)
    }
  },
  {
    id: 'mizutama',
    name: 'Dots',
    japanese: 'Mizutama · 水玉',
    note: 'Large round dots in two staggered rows. Mizutama has no single fixed symbolic meaning; this sparse arrangement keeps the dots distinct at small sizes.',
    sources: [
      { title: 'Akizakura · Kimono pattern dictionary, mizutama', url: 'https://akizakura.net/patterndictionary04/' }
    ],
    draw(width, height) {
      const count = 6
      const r = height * 0.16
      return [[height * 0.29, 0.5], [height * 0.73, 0]].map(([y, shift]) =>
        around(width, count, width / count * shift!, x =>
          `<circle cx="${n(x)}" cy="${n(y!)}" r="${n(r)}" fill="var(--ink-a)"/>`)).join('')
    }
  }
]
