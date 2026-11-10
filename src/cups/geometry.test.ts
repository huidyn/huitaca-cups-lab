import { describe, expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { vessels } from './catalogue'
import { createCup, createHandleGeometry, radiusAtY } from './geometry'

describe('top-row cups', () => {
  it('keeps the six reference silhouettes in order', () => {
    expect(vessels.map(v => v.id)).toEqual([
      'mug', 'tall-mug', 'teacup', 'tumbler', 'takeaway', 'small-cup'
    ])
  })

  for (const vessel of vessels) {
    describe(vessel.id, () => {
      it('builds finite, unlit geometry entirely from data', () => {
        const cup = createCup(vessel)
        cup.root.traverse(object => {
          if (!(object instanceof Mesh)) return
          expect(object.material).toBeInstanceOf(MeshBasicMaterial)
          expect(Array.from(object.geometry.attributes.position.array).every(Number.isFinite)).toBe(true)
        })
        expect(cup.root.children).toHaveLength(vessel.parts.length + (vessel.handle ? 1 : 0) + (vessel.lid ? 1 : 0) + 2)
        for (const part of vessel.parts) expect(vessel.colors[part.color]).toMatch(/^#[\da-f]{6}$/i)
        cup.dispose()
      })

      it('keeps the entire eyes on the curved surface and inside their face zone', () => {
        const cup = createCup(vessel)
        const face = vessel.face
        const outline = vessel.parts.find(part => part.id === face.surface)!.outline
        for (const x of [-1, 0, 1]) {
          for (const y of [-1, 0, 1]) {
            cup.look(x, y)
            for (const name of ['left-eye', 'right-eye']) {
              const eye = cup.root.getObjectByName(name) as Mesh
              const position = eye.geometry.attributes.position!
              for (let i = 0; i < position.count; i++) {
                const px = position.getX(i)
                const py = position.getY(i)
                const pz = position.getZ(i)
                const radius = radiusAtY(outline, py)
                expect(Math.hypot(px, pz)).toBeCloseTo(radius + 0.006, 5)
                expect(Math.abs(py - face.centerY)).toBeLessThanOrEqual(face.height / 2)
                expect(Math.abs(Math.atan2(px, pz) * radius)).toBeLessThanOrEqual(face.width / 2)
              }
              // Les sommets seuls ne detectent pas une face qui traverse la paroi.
              const index = eye.geometry.index!
              for (let i = 0; i < index.count; i += 3) {
                const a = index.getX(i)
                const b = index.getX(i + 1)
                const c = index.getX(i + 2)
                const px = (position.getX(a) + position.getX(b) + position.getX(c)) / 3
                const py = (position.getY(a) + position.getY(b) + position.getY(c)) / 3
                const pz = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3
                expect(Math.hypot(px, pz)).toBeGreaterThan(radiusAtY(outline, py))
              }
            }
          }
        }
        cup.dispose()
      })
    })
  }

  it('has a recessed dark interior on every open vessel', () => {
    for (const vessel of vessels.filter(v => v.id !== 'takeaway')) {
      const inside = vessel.parts.find(part => part.id === 'inside')!
      const body = vessel.parts.find(part => part.id === 'body')!
      expect(inside.outline[0]![0]).toBeLessThan(body.outline.at(-1)![0])
      expect(inside.outline.at(-1)![0]).toBe(0)
      expect(inside.outline.at(-1)![1]).toBeLessThan(inside.outline[0]![1])
      expect(parseInt(vessel.colors[inside.color]!.slice(1, 3), 16))
        .toBeLessThan(parseInt(vessel.colors[body.color]!.slice(1, 3), 16))
    }
  })

  it.each(vessels.filter(v => v.handle))('buries both handle ends inside the outer wall: $id', vessel => {
    const cup = createCup(vessel)
    try {
      const handle = cup.root.getObjectByName('handle') as Mesh
      const geometry = handle.geometry as import('three').TubeGeometry
      const position = geometry.attributes.position!
      const outline = vessel.parts.find(part => part.id === 'body')!.outline
      const { tubularSegments, radialSegments } = geometry.parameters
      // Tout l'anneau terminal doit rentrer, pas seulement le centre du tube.
      for (const ring of [0, tubularSegments]) {
        for (let i = 0; i <= radialSegments; i++) {
          const vertex = ring * (radialSegments + 1) + i
          const radius = Math.hypot(position.getX(vertex), position.getZ(vertex))
          expect(radius).toBeLessThan(radiusAtY(outline, position.getY(vertex)) - 0.01)
        }
      }
    } finally {
      cup.dispose()
    }
  })

  it.each(vessels.filter(v => v.handle))('flares only the attachment zones without adding polygons: $id', vessel => {
    const handle = vessel.handle!
    const flared = createHandleGeometry(handle)
    const plain = createHandleGeometry({ ...handle, flare: undefined })
    try {
      expect(flared.attributes.position!.count).toBe(plain.attributes.position!.count)
      expect(flared.index!.count).toBe(plain.index!.count)
      const position = flared.attributes.position!
      const { path, tubularSegments, radialSegments } = flared.parameters
      const totalLength = path.getLength()
      const point = new Vector3()
      for (let ring = 0; ring <= tubularSegments; ring++) {
        const t = ring / tubularSegments
        const distance = Math.min(t, 1 - t) * totalLength
        const center = path.getPointAt(t)
        const weight = Math.max(0, 1 - distance / handle.flare!.length)
        const expectedRadius = handle.radius * (1 + (handle.flare!.scale - 1) * weight ** 2 * (3 - 2 * weight))
        for (let i = 0; i <= radialSegments; i++) {
          const vertex = ring * (radialSegments + 1) + i
          point.fromBufferAttribute(position, vertex)
          expect(point.distanceTo(center)).toBeCloseTo(expectedRadius, 6)
          if (distance >= handle.flare!.length) {
            expect(position.getX(vertex)).toBeCloseTo(plain.attributes.position!.getX(vertex), 6)
            expect(position.getY(vertex)).toBeCloseTo(plain.attributes.position!.getY(vertex), 6)
            expect(position.getZ(vertex)).toBeCloseTo(plain.attributes.position!.getZ(vertex), 6)
          }
        }
      }
    } finally {
      flared.dispose()
      plain.dispose()
    }
  })
})
