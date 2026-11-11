import { describe, expect, it, vi } from 'vitest'
import { Box3, Color, Mesh, MeshBasicMaterial, Raycaster, ShaderMaterial, Vector3 } from 'three'
import type { TubeGeometry } from 'three'
import { vessels } from './catalogue'
import { createCup, radiusAtY } from './geometry'
import { palette } from './palette'
import { ACCESSORY_FRAME } from './renderer'
import { band, fitScarf, KNOT_ANGLE, SCARF_COLORS } from './scarf'

function intersections(source: Mesh, targets: Mesh[]) {
  const positions = source.geometry.attributes.position!
  const indices = source.geometry.index!
  const edges = new Set<string>()
  for (let i = 0; i < indices.count; i += 3) {
    for (let side = 0; side < 3; side++) {
      const a = indices.getX(i + side)
      const b = indices.getX(i + (side + 1) % 3)
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`
      if (edges.has(key)) continue
      edges.add(key)
      const start = new Vector3().fromBufferAttribute(positions, a)
      const end = new Vector3().fromBufferAttribute(positions, b)
      const length = start.distanceTo(end)
      if (length < 1e-6) continue
      const ray = new Raycaster(start, end.sub(start).normalize(), 1e-5, length - 1e-5)
      const hit = ray.intersectObjects(targets, true)[0]
      if (hit) return { source: source.name, target: hit.object.name, point: hit.point.toArray() }
    }
  }
  return undefined
}

describe('rich-blue scarf', () => {
  it('uses a saturated blue distinct from every cup colour', () => {
    const blue = new Color(SCARF_COLORS.cloth)
    const hsl = blue.getHSL({ h: 0, s: 0, l: 0 })
    expect(hsl.h).toBeGreaterThan(0.6)
    expect(hsl.h).toBeLessThan(0.7)
    expect(hsl.s).toBeGreaterThan(0.8)
    for (const option of palette) {
      const color = new Color(option.colors.body)
      expect(blue.toArray().reduce((sum, value, i) => sum + (value - color.toArray()[i]!) ** 2, 0)).toBeGreaterThan(0.04)
    }
    expect(Object.keys(SCARF_COLORS)).toHaveLength(2)
  })

  for (const vessel of vessels) {
    describe(vessel.id, () => {
      it('builds only the scarf, with unlit cloth, cached fitting and unchanged cup parts', () => {
        const original = JSON.stringify(vessel)
        const bare = createCup(vessel)
        const cup = createCup(vessel, { accessory: 'scarf' })
        const scarf = cup.root.getObjectByName('scarf')!
        expect(scarf.children.map(child => child.name)).toEqual(['scarf-wrap', 'scarf-knot', 'scarf-tail', 'scarf-tail-back'])
        const handle = cup.root.getObjectByName('handle') as Mesh<TubeGeometry> | undefined
        const fit = fitScarf(vessel, handle?.geometry)
        expect(fitScarf(vessel, handle?.geometry)).toBe(fit)
        expect(JSON.stringify(vessel)).toBe(original)
        for (const part of bare.root.children) {
          const clothed = cup.root.getObjectByName(part.name)!
          expect(clothed.position.toArray()).toEqual(part.position.toArray())
          expect(clothed.rotation.toArray()).toEqual(part.rotation.toArray())
          if (part instanceof Mesh && clothed instanceof Mesh) {
            expect(clothed.geometry.attributes.position!.array).toEqual(part.geometry.attributes.position!.array)
          }
        }
        const geometries = scarf.children.map(object => vi.spyOn((object as Mesh).geometry, 'dispose'))
        const materials = new Set(scarf.children.map(object => (object as Mesh).material as MeshBasicMaterial))
        const disposals = [...materials].map(material => vi.spyOn(material, 'dispose'))
        for (const object of scarf.children) {
          const mesh = object as Mesh
          const material = mesh.material as MeshBasicMaterial
          expect(material).toBeInstanceOf(MeshBasicMaterial)
          expect(material.toneMapped).toBe(false)
          expect(mesh.castShadow).toBe(false)
          expect(mesh.receiveShadow).toBe(false)
          expect(Array.from(mesh.geometry.attributes.position!.array).every(Number.isFinite)).toBe(true)
        }
        cup.dispose()
        bare.dispose()
        for (const dispose of [...geometries, ...disposals]) expect(dispose).toHaveBeenCalledTimes(1)
      })

      it('keeps the front wrap and tail below both eyes throughout the full gaze range', () => {
        const cup = createCup(vessel, { accessory: 'scarf' })
        const cloth = cup.root.getObjectByName('scarf')!.children as Mesh[]
        let checked = 0
        for (const x of [-1, 0, 1]) {
          for (const y of [-1, 0, 1]) {
            cup.look(x, y)
            cup.root.updateMatrixWorld(true)
            for (const name of ['left-eye', 'right-eye']) {
              const bounds = new Box3().setFromObject(cup.root.getObjectByName(name)!)
              // Secteur angulaire de l'œil, élargi de 0,12 rad de chaque côté.
              const from = Math.atan2(bounds.min.x, bounds.max.z) - 0.12
              const to = Math.atan2(bounds.max.x, bounds.max.z) + 0.12
              for (const mesh of cloth) {
                const points = mesh.geometry.attributes.position!
                for (let i = 0; i < points.count; i++) {
                  const angle = Math.atan2(points.getX(i), points.getZ(i))
                  if (angle < from || angle > to) continue
                  checked++
                  expect(bounds.min.y - points.getY(i), `${mesh.name} under ${name}`).toBeGreaterThan(0.03)
                }
              }
            }
          }
        }
        expect(checked).toBeGreaterThan(100)
        cup.dispose()
      })

      it('does not hide visible eyes from the front and either front quarter, including low and high views', () => {
        const bare = createCup(vessel)
        const cup = createCup(vessel, { accessory: 'scarf' })
        let visible = 0
        for (const x of [-1, 0, 1]) {
          for (const y of [-1, 0, 1]) {
            bare.look(x, y)
            cup.look(x, y)
            for (const yaw of [-45, 0, 45]) {
              bare.root.rotation.y = cup.root.rotation.y = yaw * Math.PI / 180
              bare.root.updateMatrixWorld(true)
              cup.root.updateMatrixWorld(true)
              for (const elevation of [-20, 16, 60]) {
                const angle = elevation * Math.PI / 180
                const direction = new Vector3(0, Math.sin(angle), Math.cos(angle))
                for (const name of ['left-eye', 'right-eye']) {
                  const eye = bare.root.getObjectByName(name) as Mesh
                  for (const row of [4, 16, 28]) {
                    const point = new Vector3().fromBufferAttribute(eye.geometry.attributes.position!, row * 9 + 4).applyMatrix4(eye.matrixWorld)
                    const ray = new Raycaster(point.clone().addScaledVector(direction, 10), direction.clone().negate())
                    if (ray.intersectObject(bare.root, true)[0]?.object.name !== name) continue
                    visible++
                    expect(ray.intersectObject(cup.root, true)[0]?.object.name, `${name}, gaze ${x}/${y}, turn ${yaw}, elevation ${elevation}`).toBe(name)
                  }
                }
              }
            }
          }
        }
        expect(visible).toBeGreaterThan(30)
        cup.dispose()
        bare.dispose()
      })

      it('reads as thick, irregular cloth: a broad wrap, a raised knot and wavy edges, built identically every time', () => {
        const cup = createCup(vessel, { accessory: 'scarf' })
        const again = createCup(vessel, { accessory: 'scarf' })
        const handle = cup.root.getObjectByName('handle') as Mesh<TubeGeometry> | undefined
        const fit = fitScarf(vessel, handle?.geometry)
        expect(fit.height).toBeGreaterThanOrEqual(0.14)
        const tops = Array.from({ length: 64 }, (_, i) => band(fit, i / 64 * Math.PI * 2).top)
        expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(0.02)
        const outline = vessel.parts.find(part => part.id === vessel.face.surface)!.outline
        const outward = (name: string) => {
          const points = (cup.root.getObjectByName(name) as Mesh).geometry.attributes.position!
          let most = 0
          for (let i = 0; i < points.count; i++) {
            if (Math.abs(Math.atan2(points.getX(i), points.getZ(i)) - KNOT_ANGLE) > 0.05) continue
            most = Math.max(most, Math.hypot(points.getX(i), points.getZ(i)) - radiusAtY(outline, points.getY(i)))
          }
          return most
        }
        expect(outward('scarf-wrap')).toBeGreaterThan(0.045)
        expect(outward('scarf-knot') - outward('scarf-wrap')).toBeGreaterThan(0.05)
        for (const name of ['scarf-wrap', 'scarf-knot', 'scarf-tail', 'scarf-tail-back']) {
          const a = (cup.root.getObjectByName(name) as Mesh).geometry.attributes.position!.array
          const b = (again.root.getObjectByName(name) as Mesh).geometry.attributes.position!.array
          expect(Array.from(b)).toEqual(Array.from(a))
        }
        cup.dispose()
        again.dispose()
      })

      it('hangs a long, broad right-front tail toward the base, stopping above the body floor or any saucer', () => {
        const cup = createCup(vessel, { accessory: 'scarf' })
        const tail = cup.root.getObjectByName('scarf-tail') as Mesh
        const bounds = new Box3().setFromObject(tail)
        const body = vessel.parts.find(part => part.id === vessel.face.surface)!
        const floor = Math.min(...body.outline.map(point => point[1]))
        const handle = cup.root.getObjectByName('handle') as Mesh<TubeGeometry> | undefined
        const fit = fitScarf(vessel, handle?.geometry)
        if (fit.tailFloor === fit.floor) expect(bounds.min.y - floor).toBeGreaterThan(0.03)
        expect(bounds.min.y - fit.tailFloor).toBeGreaterThan(0.03)
        if (fit.tailLength < 0.75) expect(bounds.min.y - fit.tailFloor).toBeLessThan(0.045)
        // Une soucoupe ou un pied large ne doit jamais recevoir la queue : elle s'y étalait.
        const radial = (mesh: Mesh) => {
          const points = mesh.geometry.attributes.position!
          let most = 0
          for (let i = 0; i < points.count; i++) most = Math.max(most, Math.hypot(points.getX(i), points.getZ(i)))
          return most
        }
        const knot = radial(cup.root.getObjectByName('scarf-knot') as Mesh)
        for (const name of ['scarf-tail', 'scarf-tail-back']) {
          const mesh = cup.root.getObjectByName(name) as Mesh
          expect(radial(mesh), name).toBeLessThan(knot + 0.02)
          for (const ledge of vessel.parts.filter(part => part.id === 'saucer')) {
            expect(new Box3().setFromObject(mesh).min.y, name).toBeGreaterThan(Math.max(...ledge.outline.map(point => point[1])) + 0.02)
          }
        }
        expect(bounds.max.y - bounds.min.y).toBeGreaterThan(0.12)
        expect(bounds.min.x).toBeGreaterThan(0)
        expect(bounds.min.z).toBeGreaterThan(0)
        const points = tail.geometry.attributes.position!
        // Couche avant : 37 rangées de 11 sommets après la couche arrière.
        const layer = 37 * 11
        // Position validée : la queue sort juste côté face du cœur du nœud.
        for (const start of [0, layer]) {
          const angle = Math.atan2(points.getX(start + 5), points.getZ(start + 5))
          expect(angle).toBeCloseTo(KNOT_ANGLE - 0.01, 6)
        }
        const hem = [layer + 36 * 11, layer + 36 * 11 + 10].map(i => new Vector3().fromBufferAttribute(points, i))
        expect(hem[0]!.distanceTo(hem[1]!)).toBeGreaterThan(0.2)
        let previous = 0
        for (let row = 0; row <= 36; row++) {
          const i = layer + row * 11 + 5
          const radius = Math.hypot(points.getX(i), points.getZ(i))
          expect(radius).toBeGreaterThanOrEqual(previous - 1e-6)
          previous = radius
        }
        cup.dispose()
      })

      it('keeps cloth vertices and triangle interiors outside the rendered cup walls', () => {
        const cup = createCup(vessel, { accessory: 'scarf' })
        cup.root.updateMatrixWorld(true)
        const scarf = cup.root.getObjectByName('scarf')!
        const walls = cup.root.children.filter(child => child !== scarf && child.name !== 'handle' && !child.name.endsWith('-eye'))
        let closest = Infinity
        let checked = 0
        for (const mesh of scarf.children as Mesh[]) {
          const points = mesh.geometry.attributes.position!
          const index = mesh.geometry.index!
          const probes: Vector3[] = []
          for (let i = 0; i < points.count; i += 7) probes.push(new Vector3().fromBufferAttribute(points, i))
          for (let i = 0; i < index.count; i += 51) {
            const point = new Vector3()
            for (let side = 0; side < 3; side++) point.add(new Vector3().fromBufferAttribute(points, index.getX(i + side)))
            probes.push(point.multiplyScalar(1 / 3))
          }
          for (const point of probes) {
            // sin(2π) doit viser la jointure, pas sa fente d'arrondi flottant.
            const direction = new Vector3(Math.abs(point.x) < 1e-12 ? 0 : point.x, 0, Math.abs(point.z) < 1e-12 ? 0 : point.z).normalize()
            const ray = new Raycaster(new Vector3(0, point.y, 0), direction)
            const hits = ray.intersectObjects(walls, true)
            expect(hits.length, `${mesh.name} wall probe at ${point.toArray()}`).toBeGreaterThan(0)
            const gap = Math.hypot(point.x, point.z) - Math.max(...hits.map(hit => hit.distance))
            closest = Math.min(closest, gap)
            expect(gap, `${mesh.name} at ${point.toArray()}`).toBeGreaterThan(0.0005)
            checked++
          }
        }
        expect(checked).toBeGreaterThan(300)
        expect(closest).toBeLessThan(0.02)
        cup.dispose()
      })

      if (vessel.handle) {
        it('routes the wrap around the actual flared handle without intersecting it in either direction', () => {
          const cup = createCup(vessel, { accessory: 'scarf' })
          cup.root.updateMatrixWorld(true)
          const scarf = cup.root.getObjectByName('scarf')!
          const handle = cup.root.getObjectByName('handle') as Mesh
          for (const cloth of scarf.children as Mesh[]) expect(intersections(cloth, [handle])).toBeUndefined()
          expect(intersections(handle, scarf.children as Mesh[])).toBeUndefined()
          cup.dispose()
        }, 15000)
      }

      it('fits the entire cup and scarf at every turn and allowed elevation', () => {
        const cup = createCup(vessel, { accessory: 'scarf' })
        let highest = -Infinity
        let lowest = Infinity
        let widest = 0
        cup.root.updateMatrixWorld(true)
        cup.root.traverse(object => {
          if (!(object instanceof Mesh)) return
          const points = object.geometry.attributes.position!
          for (let i = 0; i < points.count; i++) {
            const point = new Vector3().fromBufferAttribute(points, i).applyMatrix4(object.matrixWorld)
            const radial = Math.hypot(point.x, point.z)
            widest = Math.max(widest, radial)
            for (let elevation = -20; elevation <= 60; elevation++) {
              const angle = elevation * Math.PI / 180
              const y = (point.y - ACCESSORY_FRAME.lift) * Math.cos(angle)
              highest = Math.max(highest, y + radial * Math.abs(Math.sin(angle)))
              lowest = Math.min(lowest, y - radial * Math.abs(Math.sin(angle)))
            }
          }
        })
        expect(highest).toBeLessThan(ACCESSORY_FRAME.halfHeight - 0.03)
        expect(lowest).toBeGreaterThan(-ACCESSORY_FRAME.halfHeight + 0.03)
        expect(widest).toBeLessThan(ACCESSORY_FRAME.halfHeight)
        cup.dispose()
      })
    })
  }

  for (const id of ['teacup', 'footed-bowl', 'round-bowl', 'rimmed-cup', 'rounded-tumbler', 'gaiwan']) {
    it(`brings both ${id} tails close to the actual base or saucer, not the bowl bottom`, () => {
      const vessel = vessels.find(vessel => vessel.id === id)!
      const cup = createCup(vessel, { accessory: 'scarf' })
      const saucer = vessel.parts.find(part => part.id === 'saucer')
      const floor = saucer ? Math.max(...saucer.outline.map(point => point[1]))
        : Math.min(...vessel.parts.flatMap(part => part.outline.map(point => point[1])))
      for (const name of ['scarf-tail', 'scarf-tail-back']) {
        const bounds = new Box3().setFromObject(cup.root.getObjectByName(name)!)
        const gap = bounds.min.y - floor
        expect(gap, name).toBeGreaterThan(0.03)
        expect(gap, name).toBeLessThan(name === 'scarf-tail' ? 0.045 : 0.06)
      }
      cup.dispose()
    })
  }

  for (const vessel of vessels.filter(vessel => vessel.handle)) {
    it(`keeps the ${vessel.id} scarf above the lower handle joint, with a gradual one-sided rise`, () => {
      const cup = createCup(vessel, { accessory: 'scarf' })
      const handle = cup.root.getObjectByName('handle') as Mesh<TubeGeometry>
      const fit = fitScarf(vessel, handle.geometry)
      const joint = vessel.handle!.radius * (vessel.handle!.flare?.scale ?? 1)
      const lower = vessel.handle!.points[vessel.handle!.points.length - 1]![1] + joint
      for (let step = -4; step <= 4; step++) {
        const at = band(fit, Math.PI / 2 + step * 0.04)
        expect(at.top - at.height, 'above the lower joint').toBeGreaterThan(lower)
      }
      expect(fit.handleShift).toBeGreaterThanOrEqual(0)
      const flat = { ...fit, handleShift: 0 }
      const offset = (angle: number) => band(fit, angle).top - band(flat, angle).top
      const reach = offset(Math.PI / 2)
      if (reach > 0.01) {
        const angles = Array.from({ length: 2001 }, (_, i) => i / 2000 * Math.PI * 2)
        const first = (level: number) => angles.find(angle => offset(angle) >= level * reach)!
        const last = (level: number) => [...angles].reverse().find(angle => offset(angle) >= level * reach)!
        // Montée côté droit sur au moins 0,55 rad (l'ancienne bosse : 0,35) ; redescente par le dos plus lente.
        expect(first(0.9) - first(0.1)).toBeGreaterThan(0.55)
        expect(last(0.1) - last(0.9)).toBeGreaterThan(first(0.9) - first(0.1))
        for (const angle of [-0.4, -0.2, 0, 0.2, 0.4]) expect(offset(angle)).toBeCloseTo(0, 9)
      }
      cup.dispose()
    })
  }

  it('lets the goblet tail fall past its bowl alongside the stem', () => {
    const vessel = vessels.find(vessel => vessel.id === 'goblet')!
    const cup = createCup(vessel, { accessory: 'scarf' })
    const tail = new Box3().setFromObject(cup.root.getObjectByName('scarf-tail')!)
    const bowl = Math.min(...vessel.parts.find(part => part.id === 'body')!.outline.map(point => point[1]))
    expect(tail.max.y - tail.min.y).toBeGreaterThan(0.6)
    expect(tail.min.y).toBeLessThan(bowl - 0.2)
    expect(tail.min.y).toBeGreaterThan(0.05)
    cup.dispose()
  })
  for (const vessel of vessels.filter(vessel => vessel.pattern)) {
    it(`leaves more than half of the ${vessel.id} pattern surface uncovered, checked at two resolutions`, () => {
      const cup = createCup(vessel, { accessory: 'scarf', pattern: true })
      cup.root.updateMatrixWorld(true)
      const band = vessel.pattern!
      const outline = vessel.parts.find(part => part.id === band.surface)!.outline
      const surface = cup.root.getObjectByName(band.surface) as Mesh
      expect(surface.material).toBeInstanceOf(ShaderMaterial)
      const cloth = cup.root.getObjectByName('scarf')!.children as Mesh[]
      for (const mesh of cloth) mesh.geometry.computeBoundingBox()
      function coverage(resolution: number) {
        let total = 0
        let covered = 0
        for (let row = 0; row < resolution; row++) {
          const y = band.from + (row + 0.5) / resolution * (band.to - band.from)
          const radius = radiusAtY(outline, y)
          const segment = outline.findIndex((point, i) => i > 0 && point[1] > outline[i - 1]![1] && y >= outline[i - 1]![1] && y <= point[1])
          const a = outline[segment - 1]!
          const b = outline[segment]!
          const weight = radius * Math.hypot(1, (b[0] - a[0]) / (b[1] - a[1]))
          const candidates = cloth.filter(mesh => y >= mesh.geometry.boundingBox!.min.y && y <= mesh.geometry.boundingBox!.max.y)
          for (let column = 0; column < resolution; column++) {
            const angle = (column + 0.5) / resolution * Math.PI * 2
            const direction = new Vector3(Math.sin(angle), 0, Math.cos(angle))
            const ray = new Raycaster(direction.clone().multiplyScalar(radius).setY(y), direction)
            total += weight
            if (ray.intersectObjects(candidates, false).length) covered += weight
          }
        }
        return covered / total
      }
      const coarse = coverage(64)
      const refined = coverage(128)
      expect(Math.abs(coarse - refined)).toBeLessThan(0.02)
      expect(refined).toBeLessThan(0.5)
      if (vessel.id === 'podstakannik') expect(refined).toBeLessThan(0.1)
      cup.dispose()
    }, 30000)
  }
})
