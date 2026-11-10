import type { DesignInks } from './pattern'
import { vessels } from './catalogue'
import type { VesselDefinition } from './types'
import { palette } from './palette'

export interface CupDesign {
  id: string
  name: string
  nativeName: string
  // Centre de la vignette en fraction du tour, indépendant du visage.
  previewCenter?: number
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

const LOTUS_PHASE = 1 / 6

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
    previewCenter: LOTUS_PHASE,
    note: 'Five broad, pointed petals with clear gaps. Three spacious fans sit symmetrically beside the face and at the back, leaving the area under the eyes clear. A decorative interpretation, not a reproduction of the Eight Buddhist Emblems.',
    sources: [
      { title: 'British Museum · Bowl with overlapping lotus panels', url: 'https://www.britishmuseum.org/collection/object/A_PDF-B-658' },
      { title: 'Wing Hop Fung · Blue-and-white lotus gaiwan', url: 'https://winghopfung.com/products/blue-and-white-intertwined-lotus-gaiwan' }
    ],
    draw(width, height) {
      const petalHeight = height * 0.9
      const w = height * 0.3
      return around(width, 3, width * LOTUS_PHASE, x =>
        `<g transform="translate(${n(x)} ${n(height * 0.94)}) scale(1.2 1)" fill="var(--ink-a)" stroke="var(--body)" stroke-width="${n(height * 0.07)}" stroke-linejoin="round">`
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

const COLOMBIAN_GRAPHICS = 'https://www.americanistas.es/wp-content/uploads/2024/10/19-005-Ballestas-Rincon-Luz-Helena-Relaciones-formales-de-la-grafica-precolombina-de-Colombia-Mexico-y-Peru-Congreso-Santiago-de-Compostela-Universidade-de-Santiago-de-Compostela-2022-1.pdf'
const RAQUIRA_POTTERY = {
  title: 'Artesanías de Colombia · Ráquira pottery context, not motif attribution',
  url: 'https://artesaniasdecolombia.com.co/PortalAC/Noticia/colombia-artesanal-raquira-de-arcilla-a-objeto-artesanal_6273'
}
const terracotta = palette.find(option => option.id === 'terracotta')!.colors

export const colombianColors: Record<string, string> & DesignInks = {
  ...terracotta, background: terracotta.body, inkA: '#f3eadb', inkB: '#f3eadb'
}

export const colombianDesigns: CupDesign[] = [
  {
    id: 'colombia-stepped',
    name: 'Stepped band',
    nativeName: 'Banda escalonada',
    previewCenter: 1 / 12,
    note: 'The supplied reference’s broad stepped band, with two stair levels and a separate upper rule. The study links Colombian ceramic geometric families; it does not authenticate this exact modern composition or assign it a community-specific meaning.',
    sources: [
      { title: 'L. H. Ballestas Rincón · Colombian ceramic examples, fig. 1 / p. 44', url: `${COLOMBIAN_GRAPHICS}#page=2` },
      RAQUIRA_POTTERY
    ],
    draw(width, height) {
      const period = width / 6
      return `<rect y="${n(height * 0.02)}" width="${n(width)}" height="${n(height * 0.12)}" fill="var(--ink-a)"/>`
        + around(width, 6, period / 2, x =>
          `<path d="M ${n(x - period * 0.5)} ${n(height * 0.36)} H ${n(x - period * 0.34)} V ${n(height * 0.59)} H ${n(x - period * 0.18)} V ${n(height * 0.82)} H ${n(x + period * 0.18)} V ${n(height * 0.59)} H ${n(x + period * 0.34)} V ${n(height * 0.36)} H ${n(x + period * 0.5)}" fill="none" stroke="var(--ink-a)" stroke-width="${n(height * 0.18)}" stroke-linejoin="miter" stroke-linecap="square"/>`)
    }
  },
  {
    id: 'colombia-square-spirals',
    name: 'Square spirals',
    nativeName: 'Espirales cuadradas',
    note: 'Large open square spirals and a separate upper rule, following the supplied mug reference. The comparative study documents the spiral family, not the provenance of this exact band; no sacred meaning or traditional repeat count is claimed.',
    sources: [
      { title: 'L. H. Ballestas Rincón · Colombian spiral morphology, fig. 5 / p. 45', url: `${COLOMBIAN_GRAPHICS}#page=3` },
      RAQUIRA_POTTERY
    ],
    draw(width, height) {
      const period = width / 8
      return `<rect y="${n(height * 0.02)}" width="${n(width)}" height="${n(height * 0.12)}" fill="var(--ink-a)"/>`
        + around(width, 8, 0, x =>
          `<path d="M ${n(x - period * 0.4)} ${n(height * 0.92)} V ${n(height * 0.28)} H ${n(x + period * 0.38)} V ${n(height * 0.92)} H ${n(x - period * 0.16)} V ${n(height * 0.49)} H ${n(x + period * 0.14)} V ${n(height * 0.71)} H ${n(x + period * 0.04)}" fill="none" stroke="var(--ink-a)" stroke-width="${n(height * 0.12)}" stroke-linejoin="miter" stroke-linecap="square"/>`)
    }
  },
  {
    id: 'colombia-diagonals',
    name: 'Diagonal band',
    nativeName: 'Triángulos y diagonales',
    previewCenter: 0.14,
    note: 'Closed upright and inverted triangles alternate with groups of parallel diagonal lines between two rules, following the supplied sketch. Thick strokes and open triangle centres keep the band readable at a distance; no community-specific meaning is claimed.',
    sources: [
      { title: 'L. H. Ballestas Rincón · Colombian ceramic examples, fig. 1 / p. 44', url: `${COLOMBIAN_GRAPHICS}#page=2` },
      RAQUIRA_POTTERY
    ],
    draw(width, height) {
      const period = width / 2
      return [0.01, 0.87].map(y =>
        `<rect y="${n(height * y)}" width="${n(width)}" height="${n(height * 0.12)}" fill="var(--ink-a)"/>`).join('')
        + around(width, 2, -period * 0.4, x =>
          `<g transform="translate(${n(x)} 0)" fill="none" stroke="var(--ink-a)" stroke-width="${n(height * 0.14)}" stroke-linejoin="round" stroke-linecap="butt">`
          + `<path d="M ${n(period * 0.015)} ${n(height * 0.74)} L ${n(period * 0.135)} ${n(height * 0.36)} L ${n(period * 0.255)} ${n(height * 0.74)} Z"/>`
          + `<path d="M ${n(period * 0.575)} ${n(height * 0.26)} L ${n(period * 0.815)} ${n(height * 0.26)} L ${n(period * 0.695)} ${n(height * 0.64)} Z"/>`
          + [0.17, 0.29, 0.41].map(start =>
            `<path d="M ${n(period * start)} ${n(height * 0.07)} L ${n(period * (start + 0.25))} ${n(height * 0.93)}"/>`).join('')
          + [0.73, 0.85].map(start =>
            `<path d="M ${n(period * start)} ${n(height * 0.93)} L ${n(period * (start + 0.25))} ${n(height * 0.07)}"/>`).join('')
          + '</g>')
    }
  }
]

export const cayColors: Record<string, string> & DesignInks = {
  body: '#2fa3a0', inside: '#227e7b', rim: '#c9a24b', border: '#268d8a', eyes: '#f6f4ee',
  background: '#2fa3a0', inkA: '#f6f4ee', inkB: '#f6f4ee'
}

function cayRules(width: number, height: number): string {
  return [0.02, 0.9].map(y =>
    `<rect y="${n(height * y)}" width="${n(width)}" height="${n(height * 0.08)}" fill="var(--ink-a)"/>`).join('')
}

export const cayDesigns: CupDesign[] = [
  {
    id: 'cay-stars',
    name: 'Eight-point stars',
    nativeName: 'Sekiz köşeli yıldızlar',
    note: 'Bold eight-point star outlines linked into a border, preserving the supplied reference. Anatolian Seljuk star-shaped tiles at Kubadabad provide context; this is a new geometric interpretation, not a copy of their figures or royal imagery.',
    sources: [
      { title: 'Archnet · Kubadabad Palace, Anatolian Seljuk star tiles', url: 'https://www.archnet.org/sites/4018' },
      { title: 'The Met · Geometric Patterns in Islamic Art', url: 'https://www.metmuseum.org/essays/geometric-patterns-in-islamic-art' }
    ],
    draw(width, height) {
      const period = width / 8
      const radius = height * 0.32
      return cayRules(width, height) + around(width, 8, 0, x => {
        const points = Array.from({ length: 16 }, (_, i) => {
          const angle = i * Math.PI / 8
          const r = radius * (i % 2 ? 0.68 : 1)
          return `${n(x + Math.cos(angle) * r)},${n(height / 2 + Math.sin(angle) * r)}`
        }).join(' ')
        return `<polygon points="${points}" fill="none" stroke="var(--ink-a)" stroke-width="${n(height * 0.11)}" stroke-linejoin="miter"/>`
          + `<path d="M ${n(x + radius)} ${n(height / 2)} H ${n(x + period - radius)}" fill="none" stroke="var(--ink-a)" stroke-width="${n(height * 0.11)}"/>`
      })
    }
  },
  {
    id: 'cay-diamonds',
    name: 'Diamond lattice',
    nativeName: 'Baklava örgüsü',
    note: 'A continuous chain of large open diamonds between two rules, following the supplied glass. A simple square-based geometric lattice, not a claim that this exact band is an exclusive or named historical Turkish pattern.',
    sources: [
      { title: 'The Met · Repeated and interlaced squares in Islamic geometric design', url: 'https://www.metmuseum.org/essays/geometric-patterns-in-islamic-art' }
    ],
    draw(width, height) {
      const period = width / 8
      return cayRules(width, height) + around(width, 8, 0, x =>
        `<path d="M ${n(x - period / 2)} ${n(height / 2)} L ${n(x)} ${n(height * 0.13)} L ${n(x + period / 2)} ${n(height / 2)} L ${n(x)} ${n(height * 0.87)} Z" fill="none" stroke="var(--ink-a)" stroke-width="${n(height * 0.13)}" stroke-linejoin="miter"/>`)
    }
  },
  {
    id: 'cay-cintamani',
    name: 'Çintamani',
    nativeName: 'Üç benek ve dalgalı çizgiler',
    previewCenter: 0,
    note: 'Upright and inverted three-roundel groups alternate between paired, tapered diagonal stripes, following the exact İznik tile photograph. Small coloured centres are omitted for readability. The arrangement remains a contemporary interpretation, not a historical tea-glass reproduction.',
    sources: [
      { title: 'The Met · İznik tile with Çintamani design, ca. 1560–70', url: 'https://www.metmuseum.org/art/collection/search/823310' },
      { title: 'The Met · Exact tile photograph, DP-19634-001', url: 'https://images.metmuseum.org/CRDImages/is/original/DP-19634-001.jpg' },
      { title: 'V&A · Ottoman ball-and-stripe tile, 1560–90', url: 'https://collections.vam.ac.uk/item/O113294/tile-unknown/' }
    ],
    draw(width, height) {
      const period = width / 2
      // Deux fuseaux effilés partagent leurs pointes, de part et d'autre d'une diagonale.
      const separator = (centre: number, direction: number) => {
        const topX = centre - direction * period * 0.13
        const bottomX = centre + direction * period * 0.13
        const firstX = topX + (bottomX - topX) / 3
        const secondX = topX + (bottomX - topX) * 2 / 3
        const firstY = height * (0.06 + 0.88 / 3)
        const secondY = height * (0.06 + 0.88 * 2 / 3)
        return [-1, 1].map(side =>
          `<path d="M ${n(topX)} ${n(height * 0.06)} C ${n(firstX + side * height * 0.23)} ${n(firstY)} ${n(secondX + side * height * 0.23)} ${n(secondY)} ${n(bottomX)} ${n(height * 0.94)} C ${n(secondX + side * height * 0.055)} ${n(secondY)} ${n(firstX + side * height * 0.055)} ${n(firstY)} ${n(topX)} ${n(height * 0.06)} Z" fill="var(--ink-a)"/>`).join('')
      }
      return around(width, 2, 0, x =>
        `<g transform="translate(${n(x)} 0)">`
        + [[-0.22, 0.28], [0.22, 0.28], [0, 0.7]].map(([cx, cy]) =>
          `<circle cx="${n(height * cx!)}" cy="${n(height * cy!)}" r="${n(height * 0.14)}" fill="var(--ink-a)"/>`).join('')
        + [[0, 0.3], [-0.22, 0.72], [0.22, 0.72]].map(([cx, cy]) =>
          `<circle cx="${n(period / 2 + height * cx!)}" cy="${n(height * cy!)}" r="${n(height * 0.14)}" fill="var(--ink-a)"/>`).join('')
        + separator(period / 4, -1)
        + separator(period * 0.75, 1)
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
  { id: 'china', label: 'China · Gaiwan', vessel: decoratedVessel('gaiwan', gaiwanColors, 1), colors: gaiwanColors, colorDescription: 'blue on ivory', designs: gaiwanDesigns },
  { id: 'colombia', label: 'Colombia · Clay mug', vessel: decoratedVessel('colombian-mug', colombianColors, 1.16), colors: colombianColors, colorDescription: 'cream on terracotta', designs: colombianDesigns },
  { id: 'turkiye', label: 'Türkiye · Çay glass', vessel: decoratedVessel('cay-glass', cayColors, 1.22), colors: cayColors, colorDescription: 'cream on turquoise with a gold rim', designs: cayDesigns }
]
