import type { DesignInks } from './pattern'
import { vessels } from './catalogue'
import type { VesselDefinition } from './types'

export interface CupDesign {
  id: string
  name: string
  nativeName: string
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
    nativeName: 'Seigaiha · 青海波',
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
    nativeName: 'Tokusa · 木賊',
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
    nativeName: 'Mizutama · 水玉',
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

export const gaiwanColors: Record<string, string> & DesignInks = {
  body: '#eeeae1', inside: '#d5d2c9', rim: '#2f4a8a', border: '#2f4a8a', eyes: '#2f4a8a',
  background: '#eeeae1', inkA: '#2f4a8a', inkB: '#2f4a8a'
}

export const gaiwanDesigns: CupDesign[] = [
  {
    id: 'yunwen',
    name: 'Cloud scrolls',
    nativeName: 'Yunwen · 云纹',
    note: 'Broad lobed clouds with an inward curl, related to ruyi-head decoration. Simplified as a decorative border, not an exact ceremonial design; repeat counts are compositional.',
    sources: [
      { title: 'Legle · Auspicious Clouds Ruyi Gaiwan', url: 'https://legleporcelain.com/product/ruyi-auspicious-cloud-gaiwan/' },
      { title: 'Gotheborg · Ruyi heads and cloud borders', url: 'https://www.gotheborg.com/glossary/ruyi.shtml' }
    ],
    draw(width, height) {
      return around(width, 6, 0, x =>
        `<g transform="translate(${n(x)} 0) scale(${n(width / 6000)} ${n(height / 500)})" fill="none" stroke="var(--ink-a)" stroke-width="110" stroke-linecap="round" stroke-linejoin="round">`
        + '<path d="M -500 360 C -330 360 -320 145 -140 145 C -120 20 70 15 130 120 C 315 50 450 170 380 300 C 335 395 160 420 70 345 C -20 275 45 175 135 190 C 220 200 225 290 145 295 M 380 300 C 420 360 455 360 500 360"/>'
        + '</g>')
    }
  },
  {
    id: 'lianban',
    name: 'Lotus petals',
    nativeName: 'Lianban · 莲瓣',
    note: 'A fan of five broad, pointed petals, inspired by lotus decoration and the lotus panels rising from Chinese bowl feet. This is a decorative interpretation, not a reproduction of the Eight Buddhist Emblems.',
    sources: [
      { title: 'British Museum · Bowl with overlapping lotus panels', url: 'https://www.britishmuseum.org/collection/object/A_PDF-B-658' },
      { title: 'Wing Hop Fung · Blue-and-white lotus gaiwan', url: 'https://winghopfung.com/products/blue-and-white-intertwined-lotus-gaiwan' }
    ],
    draw(width, height) {
      const petalHeight = height * 0.9
      const w = height * 0.3
      return around(width, 4, 0, x =>
        `<g transform="translate(${n(x)} ${n(height * 0.94)})" fill="var(--ink-a)" stroke="var(--body)" stroke-width="${n(height * 0.055)}" stroke-linejoin="round">`
        + [-64, 64, -32, 32, 0].map(angle =>
          `<path transform="rotate(${angle})" d="M 0 0 C ${n(-w)} ${n(-petalHeight * 0.25)} ${n(-w)} ${n(-petalHeight * 0.7)} 0 ${n(-petalHeight)} C ${n(w)} ${n(-petalHeight * 0.7)} ${n(w)} ${n(-petalHeight * 0.25)} 0 0 Z"/>`).join('')
        + '</g>')
    }
  },
  {
    id: 'huiwen',
    name: 'Fret border',
    nativeName: 'Huiwen · 回纹',
    note: 'A continuous angular fret with six large repeats and one open inward return per unit. Thick right-angle turns stay distinct at small sizes. This is not presented as a replica of an ancient bronze thunder pattern.',
    sources: [
      { title: 'British Museum · Bowl with key-fret and lotus borders', url: 'https://www.britishmuseum.org/collection/object/A_PDF-A-421' },
      { title: 'Gotheborg · Meander border variants', url: 'https://www.gotheborg.com/glossary/meander.shtml' }
    ],
    draw(width, height) {
      return around(width, 6, 0, x =>
        `<g transform="translate(${n(x)} 0) scale(${n(width / 6000)} ${n(height / 500)})" fill="none" stroke="var(--ink-a)" stroke-width="110" stroke-linejoin="miter" stroke-linecap="square">`
        + '<path d="M -500 425 H 500 V 75 H -300 V 250 H 180"/>'
        + '</g>')
    }
  }
]

export interface DesignCollection {
  id: string
  label: string
  vessel: VesselDefinition
  colors: Record<string, string> & DesignInks
  colorDescription: string
  designs: CupDesign[]
}

// Les variantes décorées ne modifient jamais le catalogue gris des formes.
function decoratedVessel(id: string, colors: DesignCollection['colors'], centerY: number): VesselDefinition {
  const vessel = vessels.find(vessel => vessel.id === id)!
  return {
    ...vessel, colors: { ...colors }, face: { ...vessel.face, centerY },
    parts: vessel.parts.map(part => ({
      ...part, color: id === 'gaiwan' && ['foot', 'lid-knob'].includes(part.id) ? 'rim' : part.color
    }))
  }
}

export const designCollections: DesignCollection[] = [
  { id: 'japan', label: 'Japan · Yunomi', vessel: decoratedVessel('yunomi', designColors, 1.12), colors: designColors, colorDescription: 'cream on navy', designs: yunomiDesigns },
  { id: 'china', label: 'China · Gaiwan', vessel: decoratedVessel('gaiwan', gaiwanColors, 1), colors: gaiwanColors, colorDescription: 'blue on ivory', designs: gaiwanDesigns }
]
