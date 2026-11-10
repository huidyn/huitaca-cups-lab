import type { PatternBand, Point2 } from './types'

export interface DesignInks {
  background: string
  inkA: string
  inkB: string
}

// Dans le masque, chaque encre a son canal : rouge pour A, vert pour B, noir pour le corps.
export const MASK_INKS: DesignInks = { background: '#000', inkA: '#f00', inkB: '#0f0' }

function cumulative(outline: Point2[]): number[] {
  const lengths = [0]
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1]!
    const b = outline[i]!
    lengths.push(lengths[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  return lengths
}

function arcAtY(outline: Point2[], lengths: number[], y: number): number {
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1]!
    const b = outline[i]!
    if (b[1] > a[1] && y >= a[1] && y <= b[1]) {
      const t = (y - a[1]) / (b[1] - a[1])
      return lengths[i - 1]! + (lengths[i]! - lengths[i - 1]!) * t
    }
  }
  throw new Error(`Pattern band outside the outline at y=${y}`)
}

// La bande se mesure le long de la paroi, pas en hauteur : un motif rond reste rond
// sur la partie droite, et le fond arrondi ne l'écrase pas verticalement.
export function bandLayout(outline: Point2[], band: PatternBand) {
  if (!(band.to > band.from)) throw new Error('Invalid pattern band')
  const lengths = cumulative(outline)
  const start = arcAtY(outline, lengths, band.from)
  const end = arcAtY(outline, lengths, band.to)
  let radius = 0
  for (const [r, y] of outline) if (y >= band.from && y <= band.to) radius = Math.max(radius, r)
  for (const y of [band.from, band.to]) {
    for (let i = 1; i < outline.length; i++) {
      const a = outline[i - 1]!
      const b = outline[i]!
      if (b[1] > a[1] && y >= a[1] && y <= b[1]) {
        radius = Math.max(radius, a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]))
        break
      }
    }
  }
  return {
    // v = 0 en bas de la bande, 1 en haut ; hors bande, le shader ne lit rien.
    v: lengths.map(s => (s - start) / (end - start)),
    circumference: 2 * Math.PI * radius,
    length: end - start
  }
}

// Paliers de 128 px : une petite marge de qualité n'impose pas un grand saut de mémoire.
export function maskWidth(pixelsPerUnit: number, circumference: number, limit: number): number {
  const wanted = Math.ceil(pixelsPerUnit * circumference / 128) * 128
  return Math.max(512, Math.min(wanted, Math.floor(limit / 128) * 128))
}

export function designSvg(body: string, width: number, height: number, pixels: [number, number], inks: DesignInks,
  view: [number, number, number, number] = [0, 0, width, height]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels[0]}" height="${pixels[1]}" viewBox="${view.join(' ')}" preserveAspectRatio="none">`
    + `<rect x="${view[0]}" y="${view[1]}" width="${view[2]}" height="${view[3]}" fill="${inks.background}"/>`
    + body.replaceAll('var(--ink-a)', inks.inkA).replaceAll('var(--ink-b)', inks.inkB).replaceAll('var(--body)', inks.background)
    + '</svg>'
}

export async function rasterizeSvg(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D unavailable')
  context.drawImage(image, 0, 0, width, height)
  return canvas
}
