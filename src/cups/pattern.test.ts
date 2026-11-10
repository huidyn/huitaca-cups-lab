import { describe, expect, it, vi } from 'vitest'
import { Mesh, ShaderMaterial, Color } from 'three'
import { vessels } from './catalogue'
import { createCup } from './geometry'
import { designCollections, designColors, gaiwanDesigns, yunomiDesigns } from './designs'
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
    expect(designCollections.map(option => option.vessel.id)).toEqual(['yunomi', 'gaiwan'])
    expect(new Set(designCollections.flatMap(option => option.designs.map(design => design.id))).size).toBe(6)
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
})
