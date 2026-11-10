import { describe, expect, it, vi } from 'vitest'
import { Mesh, ShaderMaterial, Color } from 'three'
import { vessels } from './catalogue'
import { createCup } from './geometry'
import { cayDesigns, colombianDesigns, designCollections, designColors, gaiwanDesigns, yunomiDesigns } from './designs'
import { bandLayout, designSvg, MASK_INKS, maskWidth } from './pattern'
import { maskDimensions } from './renderer'

const yunomi = vessels.find(vessel => vessel.id === 'yunomi')!
const body = yunomi.parts.find(part => part.id === 'body')!

describe('bold recolourable yunomi patterns', () => {
  it('maps the band along wall distance and leaves the raised eyes clear', () => {
    const layout = bandLayout(body.outline, yunomi.pattern!)
    expect(layout.length).toBeGreaterThan(yunomi.pattern!.to - yunomi.pattern!.from)
    expect(layout.v.at(-1)).toBeGreaterThan(1)
    expect(1.12 - yunomi.face.eyeHeight / 2 - yunomi.pattern!.to).toBeGreaterThan(0.15)
  })

  it('buckets screen resolution and caps the largest mask', () => {
    expect(maskWidth(100, 4.5, 2048)).toBe(512)
    expect(maskWidth(101, 4.5, 2048)).toBe(512)
    expect(maskWidth(10000, 4.5, 2048)).toBe(2048)
    const screen = maskDimensions(yunomi, 100, 2048)
    expect(screen.width).toBe(640)
    expect(screen.height).toBe(Math.round(screen.width * bandLayout(body.outline, yunomi.pattern!).length / (2 * Math.PI * 0.73)))
    const size = maskDimensions(yunomi, 10000, 2048)
    expect(size.width).toBe(2048)
    expect(size.height).toBeLessThan(512)
  })

  it.each(yunomiDesigns)('$name uses a colour-free mask with periodic copies at the seam', design => {
    const size = maskDimensions(yunomi, 100, 2048)
    const drawing = design.draw(size.viewWidth, size.viewHeight)
    const svg = designSvg(drawing, size.viewWidth, size.viewHeight, [512, 128], MASK_INKS)
    expect(svg).not.toContain('var(')
    expect(svg).not.toContain(designColors.body)
    expect(svg).toContain('#f00')
    expect(svg).toMatch(/(?:cx|x)="-/)
    expect(drawing).not.toMatch(/NaN|undefined/)
  })

  it('has two broad wave arcs, ten stripes, and two sparse dot rows', () => {
    const waves = yunomiDesigns[0]!.draw(4800, 1000)
    expect(waves).toContain('stroke-width="80"')
    expect(waves).not.toContain('r="80" fill="var(--ink-a)"')
    expect(yunomiDesigns[1]!.draw(4800, 1000).match(/<rect /g)).toHaveLength(12)
    expect(yunomiDesigns[2]!.draw(4800, 1000).match(/<circle /g)).toHaveLength(16)
  })

  it('overlaps successive wave rows instead of separating them into rings', () => {
    const drawing = yunomiDesigns[0]!.draw(4800, 1000)
    const centres = [...drawing.matchAll(/cy="([\d.]+)" r="400" fill="var\(--body\)"/g)]
    const rows = [...new Set(centres.map(match => Number(match[1])))]
    expect(rows.length).toBeGreaterThan(1)
    for (let i = 1; i < rows.length; i++) expect(rows[i]! - rows[i - 1]!).toBe(200)
  })

  it('keeps seam vertices coincident and changes ink without replacing the texture', () => {
    const cup = createCup({ ...yunomi, colors: { ...designColors } }, { pattern: true })
    try {
      const mesh = cup.root.getObjectByName('body') as Mesh
      const geometry = mesh.geometry
      const uv = geometry.attributes.uv!
      const position = geometry.attributes.position!
      for (let row = 0; row < body.outline.length; row++) {
        const end = uv.count - body.outline.length + row
        expect(position.getX(row)).toBeCloseTo(position.getX(end), 6)
        expect(position.getZ(row)).toBeCloseTo(position.getZ(end), 6)
        expect(uv.getY(row)).toBe(uv.getY(end))
        expect(uv.getX(row)).toBe(0)
        expect(uv.getX(end)).toBe(1)
      }
      const material = mesh.material as ShaderMaterial
      cup.setMask({ width: 512, height: 128 } as HTMLCanvasElement)
      const texture = material.uniforms.mask!.value
      const dispose = vi.spyOn(texture, 'dispose')
      cup.setColors({ inkA: '#ff0000', body: '#123456' })
      expect(material.uniforms.inkA!.value).toEqual(new Color('#ff0000'))
      expect(material.uniforms.mask!.value).toBe(texture)
      cup.setMask(null)
      expect(dispose).toHaveBeenCalledOnce()
      expect(material.uniforms.masked!.value).toBe(0)
    } finally {
      cup.dispose()
    }
  })
})

describe('cultural pattern collections', () => {
  it('provides three designs per culture and keeps the grey source vessels unchanged', () => {
    expect(designCollections.map(option => option.vessel.id)).toEqual(['yunomi', 'gaiwan', 'colombian-mug', 'cay-glass'])
    expect(new Set(designCollections.flatMap(option => option.designs.map(design => design.id))).size).toBe(12)
    for (const option of designCollections) {
      expect(option.designs).toHaveLength(3)
      expect(option.vessel.colors.body).toBe(option.colors.background)
      const original = vessels.find(vessel => vessel.id === option.vessel.id)!
      expect(original.colors.body).toBe('#959693')
      expect(option.vessel.face.centerY).toBeGreaterThan(original.face.centerY)
      expect(option.vessel.face.centerY - option.vessel.face.eyeHeight / 2 - option.vessel.pattern!.to).toBeGreaterThan(0.12)
      for (const part of original.parts) expect(option.vessel.parts.find(p => p.id === part.id)!.outline).toEqual(part.outline)
    }
    expect(vessels.find(v => v.id === 'gaiwan')!.parts.find(p => p.id === 'lid-knob')!.color).toBe('body')
  })

  it.each(gaiwanDesigns)('$name stays bold, periodic, colour-independent and sourced', design => {
    const gaiwan = designCollections[1]!.vessel
    const size = maskDimensions(gaiwan, 100, 2048)
    const drawing = design.draw(size.viewWidth, size.viewHeight)
    const svg = designSvg(drawing, size.viewWidth, size.viewHeight, [size.width, size.height], MASK_INKS)
    expect(svg).toContain('#f00')
    expect(svg).not.toMatch(/var\(|NaN|undefined|#2f4a8a/)
    expect(drawing).toMatch(/translate\(-/)
    expect(drawing).not.toMatch(/<image|<text|filter=/)
    expect(design.sources.length).toBeGreaterThanOrEqual(2)
    expect(design.nativeName).toMatch(/[\u4e00-\u9fff]/)
  })

  it('adds no meshes or vertices to the gaiwan and keeps ink changes in shader uniforms', () => {
    const vessel = designCollections[1]!.vessel
    const plain = createCup(vessel)
    const decorated = createCup(vessel, { pattern: true })
    try {
      expect(decorated.root.children.length).toBe(plain.root.children.length)
      const a = plain.root.getObjectByName('body') as Mesh
      const b = decorated.root.getObjectByName('body') as Mesh
      expect(b.geometry.attributes.position!.count).toBe(a.geometry.attributes.position!.count)
      expect(b.material).toBeInstanceOf(ShaderMaterial)
      const shader = b.material as ShaderMaterial
      decorated.setColors({ inkA: '#bd321f', body: '#e5dfd1' })
      expect(shader.uniforms.inkA!.value).toEqual(new Color('#bd321f'))
      expect(shader.uniforms.body!.value).toEqual(new Color('#e5dfd1'))
      const uv = b.geometry.attributes.uv!
      const rows = vessel.parts.find(part => part.id === 'body')!.outline.length
      for (let row = 0; row < rows; row++) expect(uv.getY(row)).toBe(uv.getY(uv.count - rows + row))
    } finally {
      plain.dispose()
      decorated.dispose()
    }
  })

  it('uses fewer, thicker fret repeats with an open gap between the horizontal strokes', () => {
    const fret = gaiwanDesigns.find(design => design.id === 'huiwen')!
    const drawing = fret.draw(6000, 500)
    expect(drawing.match(/stroke-width="110"/g)).toHaveLength(8)
    expect(drawing).toContain('M -500 425 H 500 V 75 H -300 V 250 H 180')
    expect(250 - 75 - 110).toBeGreaterThan(110 / 2)
    expect(425 - 250 - 110).toBeGreaterThan(110 / 2)
  })

  it('widens the lotus fans and leaves more room between petals and repeats', () => {
    const lotus = gaiwanDesigns.find(design => design.id === 'lianban')!
    const drawing = lotus.draw(6000, 500)
    expect(drawing.match(/<g /g)).toHaveLength(5)
    expect(drawing.match(/<path /g)).toHaveLength(25)
    expect(drawing.match(/scale\(1\.2 1\)/g)).toHaveLength(5)
    expect(drawing.match(/stroke-width="35"/g)).toHaveLength(5)
    expect(drawing).toContain('translate(3000 470)')
  })

  it('places the lotus fans symmetrically at the sides and back, not beneath the face', () => {
    const lotus = gaiwanDesigns.find(design => design.id === 'lianban')!
    const centres = [...lotus.draw(6000, 500).matchAll(/<g transform="translate\(([-\d.]+) /g)]
      .map(match => ((Number(match[1]) % 6000) + 6000) % 6000)
    expect([...new Set(centres)].sort((a, b) => a - b)).toEqual([1000, 3000, 5000])
    expect(lotus.previewCenter).toBe(1 / 6)
  })

  it.each(colombianDesigns)('$name uses sourced, colour-independent geometry with copies across the seam', design => {
    const vessel = designCollections.find(option => option.id === 'colombia')!.vessel
    const size = maskDimensions(vessel, 100, 2048)
    const drawing = design.draw(size.viewWidth, size.viewHeight)
    const mask = designSvg(drawing, size.viewWidth, size.viewHeight, [size.width, size.height], MASK_INKS)
    expect(mask).toContain('#f00')
    expect(mask).not.toMatch(/var\(|NaN|undefined|#b5533c|<image|<text/)
    expect(drawing).toMatch(/(?:M |translate\()-/)
    expect(design.sources[0]!.url).toContain('Ballestas-Rincon')
    expect(design.sources[0]!.url).toMatch(/#page=[234]$/)
  })

  it('keeps the stepped band, restores staged square spirals second, and retains diagonals third', () => {
    expect(colombianDesigns.map(design => design.id)).toEqual([
      'colombia-stepped', 'colombia-square-spirals', 'colombia-diagonals'
    ])
    const stepped = colombianDesigns[0]!
    const drawing = stepped.draw(6000, 500)
    expect(drawing).toContain('<rect y="10" width="6000" height="60"')
    expect(drawing).toContain('M 0 180 H 160 V 295 H 320 V 410 H 680 V 295 H 840 V 180 H 1000')
    expect(drawing.match(/stroke-width="90"/g)).toHaveLength(8)
    expect(drawing).not.toContain('scale(')
    expect(stepped.previewCenter).toBe(1 / 12)
  })

  it('restores the staged square-spiral geometry with its separate upper rule', () => {
    const drawing = colombianDesigns[1]!.draw(8000, 500)
    expect(drawing.match(/<path /g)).toHaveLength(10)
    expect(drawing.match(/stroke-width="60"/g)).toHaveLength(10)
    expect(drawing).toContain('<rect y="10" width="8000" height="60"')
    expect(drawing).toContain('M -400 460 V 140 H 380 V 460 H -160 V 245 H 140 V 355 H 40')
    expect(drawing).not.toContain('scale(')
  })

  it('alternates closed upright and inverted triangles with thick diagonals between two rails', () => {
    const drawing = colombianDesigns[2]!.draw(4000, 500)
    expect(drawing.match(/<rect /g)).toHaveLength(2)
    expect(drawing.match(/<g /g)).toHaveLength(4)
    expect(drawing.match(/<path /g)).toHaveLength(28)
    expect(drawing.match(/ Z"/g)).toHaveLength(8)
    expect(drawing).toContain('M 30 370 L 270 180 L 510 370 Z')
    expect(drawing).toContain('M 1150 130 L 1630 130 L 1390 320 Z')
    for (const start of [340, 580, 820]) {
      expect(drawing).toContain(`M ${start} 35 L ${start + 500} 465`)
    }
    for (const start of [1460, 1700]) {
      expect(drawing).toContain(`M ${start} 465 L ${start + 500} 35`)
    }
    expect(drawing.match(/stroke-width="70"/g)).toHaveLength(4)
    expect(drawing.match(/stroke-linejoin="round" stroke-linecap="butt"/g)).toHaveLength(4)
    expect(drawing).not.toMatch(/scale\(|\d [HV] /)
  })

  it('centres triangles between the neighbouring diagonals and joins every line to both rails', () => {
    const drawing = colombianDesigns[2]!.draw(4000, 500)
    const paths = [...drawing.matchAll(/<path d="([^"]+)"/g)].slice(0, 7)
      .map(match => [...match[1]!.matchAll(/-?\d+(?:\.\d+)?/g)].map(value => Number(value[0])))
    const [upright, inverted, firstFalling, , lastFalling, firstRising, lastRising] = paths as number[][]
    const centre = (triangle: number[]) => (triangle[0]! + triangle[2]! + triangle[4]!) / 3
    expect(centre(upright!)).toBe((firstFalling![0]! + lastRising![2]! - 2000) / 2)
    expect(centre(upright!)).toBe((firstFalling![2]! + lastRising![0]! - 2000) / 2)
    expect(centre(inverted!)).toBe((lastFalling![0]! + firstRising![2]!) / 2)
    expect(centre(inverted!)).toBe((lastFalling![2]! + firstRising![0]!) / 2)
    const rails = [...drawing.matchAll(/<rect y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/g)]
      .map(match => Number(match[1]) + Number(match[2]) / 2)
    for (const line of paths.slice(2)) expect([line[1], line[3]].sort((a, b) => a! - b!)).toEqual(rails)
  })

  it.each(['colombia', 'turkiye'])('%s preserves geometry and stays within the existing mask budget', culture => {
    const vessel = designCollections.find(option => option.id === culture)!.vessel
    const original = vessels.find(original => original.id === vessel.id)!
    expect(vessel.handle).toEqual(original.handle)
    const plain = createCup(original)
    const decorated = createCup(vessel, { pattern: true })
    try {
      expect(decorated.root.children.length).toBe(plain.root.children.length)
      const before = plain.root.getObjectByName('body') as Mesh
      const after = decorated.root.getObjectByName('body') as Mesh
      expect(after.geometry.attributes.position!.count).toBe(before.geometry.attributes.position!.count)
      expect(after.material).toBeInstanceOf(ShaderMaterial)
      const size = maskDimensions(vessel, 10000, 2048)
      expect(size.width).toBe(2048)
      const yunomiSize = maskDimensions(designCollections[0]!.vessel, 10000, 2048)
      expect(size.width * size.height).toBeLessThanOrEqual(yunomiSize.width * yunomiSize.height)
    } finally {
      plain.dispose()
      decorated.dispose()
    }
  })

  it.each(cayDesigns)('$name is a sourced, periodic, one-ink çay design', design => {
    const vessel = designCollections.find(option => option.id === 'turkiye')!.vessel
    const size = maskDimensions(vessel, 100, 2048)
    const drawing = design.draw(size.viewWidth, size.viewHeight)
    const svg = designSvg(drawing, size.viewWidth, size.viewHeight, [size.width, size.height], MASK_INKS)
    expect(svg).toContain('#f00')
    expect(svg).not.toMatch(/var\(|NaN|undefined|#2fa3a0|<image|<text|filter=/)
    expect(drawing).toMatch(/(?:M |translate\(|points=")-/)
    expect(drawing).not.toContain('var(--ink-b)')
    expect(design.sources.length).toBeGreaterThan(0)
  })

  it('preserves the two reference patterns and replaces scales with Çintamani', () => {
    expect(cayDesigns.map(design => design.id)).toEqual(['cay-stars', 'cay-diamonds', 'cay-cintamani'])
    const stars = cayDesigns[0]!.draw(4000, 500)
    const polygons = [...stars.matchAll(/<polygon points="([^"]+)"/g)]
    expect(polygons).toHaveLength(10)
    for (const polygon of polygons) expect(polygon[1]!.split(' ')).toHaveLength(16)
    const diamonds = cayDesigns[1]!.draw(4000, 500)
    expect(diamonds.match(/ Z"/g)).toHaveLength(10)
    expect(diamonds).toContain('M -250 250 L 0 65 L 250 250 L 0 435 Z')
  })

  it('matches the tile’s alternating three-dot triangles and paired diagonal separators', () => {
    const drawing = cayDesigns[2]!.draw(4000, 500)
    const groups = [...drawing.matchAll(/<g [^>]+>(.*?)<\/g>/g)]
    expect(groups).toHaveLength(4)
    for (const group of groups) {
      expect(group[1]!.match(/<circle /g)).toHaveLength(6)
      expect(group[1]!.match(/<path /g)).toHaveLength(4)
      for (const [x, y] of [[-110, 140], [110, 140], [0, 350], [1000, 150], [890, 360], [1110, 360]]) {
        expect(group[1]).toContain(`cx="${x}" cy="${y}" r="70"`)
      }
      const separators = [...group[1]!.matchAll(/<path d="([^"]+)"/g)]
        .map(match => [...match[1]!.matchAll(/-?\d+(?:\.\d+)?/g)].map(value => Number(value[0])))
      for (const path of separators) {
        expect(path[1]).toBe(30)
        expect(path[7]).toBe(470)
        expect(path[0]).not.toBe(path[6])
      }
      expect(separators.slice(0, 2).every(path => path[0]! > path[6]!)).toBe(true)
      expect(separators.slice(2).every(path => path[0]! < path[6]!)).toBe(true)
      expect(group[1]).not.toContain('stroke-linecap')
    }
    expect(cayDesigns[2]!.previewCenter).toBe(0)
  })
})
