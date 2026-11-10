import { describe, expect, it } from 'vitest'
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { vessels } from './catalogue'
import { createCup, createHandleGeometry, radiusAtY } from './geometry'

describe('reference cups', () => {
  it('keeps all three reference rows in order', () => {
    expect(vessels.map(v => v.id)).toEqual([
      'mug', 'tall-mug', 'teacup', 'tumbler', 'takeaway', 'small-cup',
      'footed-bowl', 'round-bowl', 'rimmed-cup', 'rounded-tumbler', 'goblet', 'round-mug',
      'colombian-mug', 'gaiwan', 'yunomi', 'kulhad', 'cay-glass', 'podstakannik'
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

  it('keeps the teacup separation border unlit and visible above the saucer', () => {
    const vessel = vessels.find(v => v.id === 'teacup')!
    const border = vessel.parts.find(part => part.id === 'base-border')!
    const cup = createCup(vessel)
    try {
      const mesh = cup.root.getObjectByName(border.id) as Mesh
      const material = mesh.material as MeshBasicMaterial
      expect(material).toBeInstanceOf(MeshBasicMaterial)
      expect(material.color.getHexString()).toBe(vessel.colors[border.color]!.slice(1))
      expect(material.transparent).toBe(false)
      expect(mesh.castShadow).toBe(false)
      for (const elevation of [0, 16, 32]) {
        const angle = elevation * Math.PI / 180
        const direction = new Vector3(0, Math.sin(angle), Math.cos(angle))
        for (const yaw of [-0.44, 0, 0.44]) {
          cup.root.rotation.y = yaw
          cup.root.updateMatrixWorld(true)
          const target = cup.root.localToWorld(new Vector3(0, 0.185, radiusAtY(border.outline, 0.185)))
          const ray = new Raycaster(target.clone().addScaledVector(direction, 10), direction.clone().negate())
          expect(ray.intersectObject(cup.root, true)[0]?.object.name).toBe('base-border')
        }
      }
    } finally {
      cup.dispose()
    }
  })

  it.each(vessels.slice(6).filter(v => !v.parts.some(part => part.id === 'lid')))('leaves each new open vessel clear into the interior: $id', vessel => {
    const cup = createCup(vessel)
    try {
      cup.root.updateMatrixWorld(true)
      const radius = vessel.parts.find(part => part.id === 'inside')!.outline[0]![0]
      for (const [x, z] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
        const ray = new Raycaster(new Vector3(x! * radius, 4, z! * radius), new Vector3(0, -1, 0))
        const hit = ray.intersectObject(cup.root, true)[0]
        expect(hit?.object.name).toBe('inside')
      }
    } finally {
      cup.dispose()
    }
  })

  it('records source links and cultural qualifications for exactly the last six', () => {
    expect(vessels.slice(0, 12).every(v => !v.heritage)).toBe(true)
    for (const vessel of vessels.slice(12)) {
      expect(vessel.heritage?.origin).toBeTruthy()
      expect(vessel.heritage?.note).toBeTruthy()
      expect(vessel.heritage!.sources.length).toBeGreaterThan(0)
      for (const source of vessel.heritage!.sources) {
        expect(source.title).toBeTruthy()
        expect(new URL(source.url).protocol).toBe('https:')
      }
    }
  })

  it('builds the gaiwan as a handleless bowl, saucer and closed lid with a knob', () => {
    const vessel = vessels.find(v => v.id === 'gaiwan')!
    expect(vessel.handle).toBeNull()
    expect(vessel.parts.map(part => part.id)).toEqual(expect.arrayContaining(['body', 'saucer', 'lid', 'lid-knob']))
    const cup = createCup(vessel)
    try {
      cup.root.updateMatrixWorld(true)
      const ray = new Raycaster(new Vector3(0.45, 4, 0), new Vector3(0, -1, 0))
      expect(ray.intersectObject(cup.root, true)[0]?.object.name).toBe('lid')
    } finally {
      cup.dispose()
    }
  })

  it('keeps the yunomi foot, kulhad taper and waisted tea-glass profile distinct', () => {
    const yunomi = vessels.find(v => v.id === 'yunomi')!
    const kulhad = vessels.find(v => v.id === 'kulhad')!
    const glass = vessels.find(v => v.id === 'cay-glass')!
    for (const vessel of [yunomi, kulhad, glass]) expect(vessel.handle).toBeNull()
    expect(yunomi.parts.some(part => part.id === 'foot')).toBe(true)
    const clay = kulhad.parts.find(part => part.id === 'body')!.outline
    expect(radiusAtY(clay, 1.6)).toBeGreaterThan(radiusAtY(clay, 0.2))
    const waist = glass.parts.find(part => part.id === 'body')!.outline
    expect(radiusAtY(waist, 1.2)).toBeLessThan(radiusAtY(waist, 0.5))
    expect(radiusAtY(waist, 1.2)).toBeLessThan(radiusAtY(waist, 1.85))
    expect(glass.parts.some(part => part.id === 'saucer')).toBe(true)
  })

  it('surrounds the lower glass with a separate handled holder and keeps its eyes above it', () => {
    const vessel = vessels.find(v => v.id === 'podstakannik')!
    const holder = vessel.parts.find(part => part.id === 'holder')!
    const glass = vessel.parts.find(part => part.id === 'body')!
    const top = Math.max(...holder.outline.map(point => point[1]))
    expect(vessel.handle).not.toBeNull()
    expect(radiusAtY(holder.outline, 0.7)).toBeGreaterThan(radiusAtY(glass.outline, 0.7))
    // Métal fin : la paroi serre le verre au lieu de former un second gobelet épais.
    expect(radiusAtY(holder.outline, 0.7) - radiusAtY(glass.outline, 0.7)).toBeLessThan(0.04)
    expect(Math.max(...vessel.handle!.points.map(point => point[1]))).toBeLessThan(top)
    expect(vessel.face.centerY - vessel.face.height / 2).toBeGreaterThan(top)
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
