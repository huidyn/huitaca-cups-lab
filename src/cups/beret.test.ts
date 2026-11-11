import { describe, expect, it, vi } from 'vitest'
import { Box3, Mesh, MeshBasicMaterial, OrthographicCamera, Raycaster, Vector2, Vector3 } from 'three'
import { vessels } from './catalogue'
import { createCup } from './geometry'
import { BERET_COLORS, fitBeret } from './beret'
import { ACCESSORY_FRAME } from './renderer'

describe('soft red beret', () => {
  for (const vessel of vessels) {
    describe(vessel.id, () => {
      it('has a rounded compact crown, downward left droop and a larger central stem, without insignia', () => {
        const cup = createCup(vessel, { accessory: 'beret' })
        cup.root.updateMatrixWorld(true)
        const beret = cup.root.getObjectByName('beret')!
        expect(beret.children.map(child => child.name)).toEqual(['beret-band', 'beret-crown', 'beret-stem'])
        const band = new Box3().setFromObject(beret.getObjectByName('beret-band')!)
        const crown = new Box3().setFromObject(beret.getObjectByName('beret-crown')!)
        const stem = new Box3().setFromObject(beret.getObjectByName('beret-stem')!)
        const width = band.max.x - band.min.x
        expect(crown.max.x - crown.min.x).toBeGreaterThan(width * 1.13)
        expect(crown.max.x - crown.min.x).toBeLessThan(width * 1.22)
        expect(crown.max.y - crown.min.y).toBeGreaterThan((crown.max.x - crown.min.x) * 0.25)
        expect(crown.max.y - crown.min.y).toBeLessThan((crown.max.x - crown.min.x) * 0.35)
        expect(crown.min.y).toBeLessThan(band.min.y - width * 0.04)
        expect(-crown.min.x).toBeGreaterThan(crown.max.x + width * 0.04)
        expect(Math.abs((stem.max.x + stem.min.x) / 2)).toBeLessThan(width * 0.06)
        expect(stem.max.y).toBeGreaterThan(crown.max.y)
        expect(beret.getObjectByName('beret-stem')!.scale.toArray()).toEqual([1.2, 1.2, 1.2])
        expect(beret.getObjectByName('beret-crown')!.scale.toArray()).toEqual([1, 1, 1])
        expect(beret.getObjectByName('beret-band')!.scale.toArray()).toEqual([1, 1, 1])
        expect(stem.max.y - stem.min.y).toBeGreaterThan(width * 0.09 * 1.2)
        expect(stem.max.y - stem.min.y).toBeLessThan(width * 0.13 * 1.2)
        expect(stem.max.x - stem.min.x).toBeGreaterThan(width * 0.055 * 1.2)
        expect(band.max.y - band.min.y).toBeLessThan((band.max.x - band.min.x) * 0.04)
        const material = (beret.getObjectByName('beret-crown') as Mesh).material as MeshBasicMaterial
        expect(material.color.getHexString()).toBe('c84444')
        expect(material.toneMapped).toBe(false)
        expect(cup.root.getObjectByName('paintbrush')).toBeUndefined()
        cup.dispose()
      })

      it('rests its band on the actual rendered rim or lid around the entire opening', () => {
        const cup = createCup(vessel, { accessory: 'beret' })
        cup.root.updateMatrixWorld(true)
        const beret = cup.root.getObjectByName('beret')!
        const band = new Box3().setFromObject(beret.getObjectByName('beret-band')!)
        const r = band.max.x / 1.02 * 0.99
        const surfaces = cup.root.children.filter(child => child !== beret)
        for (let i = 0; i < 48; i++) {
          const angle = i / 48 * Math.PI * 2
          const ray = new Raycaster(new Vector3(r * Math.cos(angle), band.min.y + 0.003, r * Math.sin(angle)), new Vector3(0, -1, 0))
          const hit = ray.intersectObjects(surfaces, true)[0]
          expect(hit, `no support at ${i}`).toBeDefined()
          expect(hit!.point.y).toBeCloseTo(band.min.y, 6)
        }
        cup.dispose()
      })

      it('keeps the downward fold outside the actual cup walls', () => {
        const cup = createCup(vessel, { accessory: 'beret' })
        cup.root.updateMatrixWorld(true)
        const beret = cup.root.getObjectByName('beret')!
        const crown = beret.getObjectByName('beret-crown') as Mesh
        const band = new Box3().setFromObject(beret.getObjectByName('beret-band')!)
        const surfaces = cup.root.children.filter(child => child !== beret)
        const positions = crown.geometry.attributes.position!
        const indices = crown.geometry.index!
        const probes: Vector3[] = []
        for (let i = 0; i < positions.count; i++) probes.push(new Vector3().fromBufferAttribute(positions, i))
        for (let i = 0; i < indices.count; i += 3) {
          const point = new Vector3()
          for (let j = 0; j < 3; j++) point.add(new Vector3().fromBufferAttribute(positions, indices.getX(i + j)))
          probes.push(point.divideScalar(3))
        }
        let dropped = 0
        for (const point of probes) {
          point.applyMatrix4(crown.matrixWorld)
          if (point.y >= band.min.y - 1e-6) continue
          dropped++
          expect(point.x).toBeLessThan(0)
          const ray = new Raycaster(new Vector3(0, point.y, 0), new Vector3(point.x, 0, point.z).normalize())
          const hits = ray.intersectObjects(surfaces, true)
          expect(hits.length).toBeGreaterThan(0)
          const outside = Math.max(...hits.map(hit => hit.distance))
          expect(Math.hypot(point.x, point.z)).toBeGreaterThan(outside + 0.005)
        }
        expect(dropped).toBeGreaterThan(20)
        cup.dispose()
      })

      it('leaves the cup, face, lid, palette slots and catalogue unchanged', () => {
        const original = JSON.stringify(vessel)
        const bare = createCup(vessel)
        const dressed = createCup(vessel, { accessory: 'beret' })
        for (const object of bare.root.children) {
          const found = dressed.root.getObjectByName(object.name)!
          expect(found.position.toArray()).toEqual(object.position.toArray())
          expect(found.rotation.toArray()).toEqual(object.rotation.toArray())
          if (object instanceof Mesh) {
            expect((found as Mesh).geometry.attributes.position!.array).toEqual(object.geometry.attributes.position!.array)
          }
        }
        dressed.setColors({ body: '#0000ff', eyes: '#ffffff' })
        const crown = dressed.root.getObjectByName('beret-crown') as Mesh
        expect((crown.material as MeshBasicMaterial).color.getHexString()).toBe(BERET_COLORS.crown.slice(1))
        expect(JSON.stringify(vessel)).toBe(original)
        bare.dispose()
        dressed.dispose()
      })

      it('fits the existing accessory frame through all rotations and elevations', () => {
        const cup = createCup(vessel, { accessory: 'beret' })
        cup.root.updateMatrixWorld(true)
        const point = new Vector3()
        let top = -Infinity
        let bottom = Infinity
        let side = 0
        cup.root.traverse(object => {
          if (!(object instanceof Mesh)) return
          const points = object.geometry.attributes.position!
          for (let i = 0; i < points.count; i++) {
            point.fromBufferAttribute(points, i).applyMatrix4(object.matrixWorld)
            const r = Math.hypot(point.x, point.z)
            side = Math.max(side, r + (vessel.handle ? 0.18 : 0))
            for (let elevation = -20; elevation <= 60; elevation += 5) {
              const angle = elevation * Math.PI / 180
              const y = (point.y - ACCESSORY_FRAME.lift) * Math.cos(angle)
              top = Math.max(top, y + r * Math.abs(Math.sin(angle)))
              bottom = Math.min(bottom, y - r * Math.abs(Math.sin(angle)))
            }
          }
        })
        expect(top).toBeLessThan(ACCESSORY_FRAME.halfHeight - 0.03)
        expect(bottom).toBeGreaterThan(-ACCESSORY_FRAME.halfHeight + 0.03)
        expect(side).toBeLessThan(ACCESSORY_FRAME.halfHeight)
        cup.dispose()
      })
    })
  }

  it.each(['takeaway', 'gaiwan'])('covers the entire %s lid without crossing its surface or knob', id => {
    const cup = createCup(vessels.find(vessel => vessel.id === id)!, { accessory: 'beret' })
    cup.root.updateMatrixWorld(true)
    const crown = cup.root.getObjectByName('beret-crown')!
    const band = cup.root.getObjectByName('beret-band')!
    const bandBounds = new Box3().setFromObject(band)
    const probes = new Map<string, Vector3>()
    cup.root.traverse(object => {
      if (!(object instanceof Mesh) || !object.name.startsWith('lid')) return
      const points = object.geometry.attributes.position!
      const index = object.geometry.index
      const add = (point: Vector3) => probes.set(point.toArray().map(value => value.toFixed(6)).join(','), point)
      for (let i = 0; i < points.count; i++) add(new Vector3().fromBufferAttribute(points, i).applyMatrix4(object.matrixWorld))
      for (let i = 0; i < (index?.count ?? points.count); i += 3) {
        const center = new Vector3()
        for (let j = 0; j < 3; j++) center.add(new Vector3().fromBufferAttribute(points, index ? index.getX(i + j) : i + j))
        add(center.divideScalar(3).applyMatrix4(object.matrixWorld))
      }
    })
    expect(probes.size).toBeGreaterThan(100)
    const ray = new Raycaster()
    ray.ray.direction.set(0, -1, 0)
    let clearance = Infinity
    for (const point of probes.values()) {
      ray.ray.origin.set(point.x, 5, point.z)
      const hit = ray.intersectObject(crown)[0]
      expect(hit, `uncovered lid at ${point.toArray()}`).toBeDefined()
      clearance = Math.min(clearance, hit!.point.y - point.y)
      if (point.y > bandBounds.min.y + 1e-6 && point.y < bandBounds.max.y - 1e-6 && Math.hypot(point.x, point.z) > 0) {
        const side = new Raycaster(new Vector3(0, point.y, 0), new Vector3(point.x, 0, point.z).normalize())
        const inner = side.intersectObject(band)[0]!
        expect(Math.hypot(point.x, point.z)).toBeLessThan(inner.distance - 1e-5)
      }
    }
    expect(clearance).toBeGreaterThan(0.001)
    cup.dispose()
  })

  it('keeps some distinct stem coverage at 64 pixels from each side in the real accessory framing', () => {
    const camera = new OrthographicCamera(-ACCESSORY_FRAME.halfHeight, ACCESSORY_FRAME.halfHeight,
      ACCESSORY_FRAME.halfHeight, -ACCESSORY_FRAME.halfHeight, 0.1, 50)
    const angle = 16 * Math.PI / 180
    camera.position.set(0, Math.sin(angle) * 12, Math.cos(angle) * 12)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    const ray = new Raycaster()
    for (const vessel of vessels) {
      const cup = createCup(vessel, { accessory: 'beret' })
      for (const child of cup.root.children) child.position.y -= ACCESSORY_FRAME.lift
      cup.root.position.x = vessel.handle ? -0.18 : 0
      const stem = cup.root.getObjectByName('beret-stem')!
      for (let turn = 0; turn < 4; turn++) {
        cup.root.rotation.y = turn * Math.PI / 2
        cup.root.updateMatrixWorld(true)
        const box = new Box3().setFromObject(stem)
        const screen: Vector3[] = []
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) screen.push(new Vector3(x, y, z).project(camera))
          }
        }
        const left = Math.floor((Math.min(...screen.map(point => point.x)) + 1) * 32)
        const right = Math.ceil((Math.max(...screen.map(point => point.x)) + 1) * 32)
        const bottom = Math.floor((Math.min(...screen.map(point => point.y)) + 1) * 32)
        const top = Math.ceil((Math.max(...screen.map(point => point.y)) + 1) * 32)
        let covered = 0
        for (let y = bottom * 4; y < top * 4; y++) {
          for (let x = left * 4; x < right * 4; x++) {
            ray.setFromCamera(new Vector2((x + 0.5) / 128 - 1, (y + 0.5) / 128 - 1), camera)
            if (ray.intersectObject(cup.root, true)[0]?.object === stem) covered++
          }
        }
        expect(covered / 16, `${vessel.id} at ${turn * 90} degrees`).toBeGreaterThan(1)
      }
      cup.dispose()
    }
  })

  it('caches the fit by definition and adapts its radius and crown to the real cup and lid', () => {
    for (const vessel of vessels) expect(fitBeret(vessel)).toBe(fitBeret(vessel))
    expect(new Set(vessels.map(vessel => fitBeret(vessel).radius)).size).toBeGreaterThan(10)
    const gaiwan = fitBeret(vessels.find(vessel => vessel.id === 'gaiwan')!)
    const mug = fitBeret(vessels[0]!)
    expect(gaiwan.height / gaiwan.radius).toBeGreaterThan(mug.height / mug.radius)
  })

  it('disposes all accessory geometries and shared materials exactly once', () => {
    const cup = createCup(vessels[0]!, { accessory: 'beret' })
    const beret = cup.root.getObjectByName('beret')!
    const geometries = beret.children.map(child => (child as Mesh).geometry)
    const materials = [...new Set(beret.children.map(child => (child as Mesh).material as MeshBasicMaterial))]
    const spies = [...geometries, ...materials].map(resource => vi.spyOn(resource, 'dispose'))
    expect(materials).toHaveLength(2)
    cup.dispose()
    spies.forEach(spy => expect(spy).toHaveBeenCalledOnce())
  })
})
