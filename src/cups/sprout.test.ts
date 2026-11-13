import { describe, expect, it, vi } from 'vitest'
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { vessels } from './catalogue'
import { createCup } from './geometry'
import { openingDistance } from './lid'
import { ACCESSORY_FRAME } from './renderer'
import { distanceToPath, fitSprout, SPROUT, SPROUT_COLORS } from './sprout'
import type { Point2 } from './types'

// Rayon intérieur au plus serré, à la hauteur y, d'après le profil « inside ».
function insideRadius(inside: Point2[], y: number) {
  let radius = Infinity
  for (let i = 0; i < inside.length - 1; i++) {
    const [ar, ay] = inside[i]!
    const [br, by] = inside[i + 1]!
    if (ay === by || y < Math.min(ay, by) || y > Math.max(ay, by)) continue
    radius = Math.min(radius, ar + (y - ay) / (by - ay) * (br - ar))
  }
  return radius
}

describe('two-leaf sprout', () => {
  it('uses two distinct leaf greens and a stem in the shaded green', () => {
    expect(SPROUT_COLORS.light).not.toBe(SPROUT_COLORS.shade)
    expect(SPROUT_COLORS.stem).toBe(SPROUT_COLORS.shade)
  })

  for (const vessel of vessels) {
    describe(vessel.id, () => {
      const gaiwan = vessel.parts.some(part => part.id === 'lid-seat')

      it('builds one stem with a rounded tip and two two-tone leaves', () => {
        const cup = createCup(vessel, { accessory: 'leaf' })
        const sprout = cup.root.getObjectByName('sprout')!
        expect(sprout.children.map(object => object.name)).toEqual(['sprout-stem', 'sprout-tip', 'sprout-leaf-right', 'sprout-leaf-left'])
        for (const side of ['right', 'left']) {
          const leaf = sprout.getObjectByName(`sprout-leaf-${side}`)!
          expect(leaf.children.map(object => object.name)).toEqual([`sprout-leaf-${side}-light`, `sprout-leaf-${side}-shade`])
        }
        const materials = new Set<MeshBasicMaterial>()
        sprout.traverse(object => { if (object instanceof Mesh) materials.add(object.material) })
        expect(materials.size).toBe(3)
        cup.dispose()
      })

      it('roots the stem inside the cup and keeps it within the walls up to the mouth', () => {
        const fit = fitSprout(vessel)
        const inside = vessel.parts.find(part => part.id === 'inside')!.outline
        const floor = Math.min(...inside.map(point => point[1]))
        // Sous un couvercle rapporté, la paroi s'arrête au bas du couvercle.
        const mouth = vessel.lid
          ? vessel.lid.baseY
          : Math.max(...vessel.parts.filter(part => part.id === 'rim' || part.id === 'lid-seat').flatMap(part => part.outline).map(point => point[1]))
        const [baseX, baseY] = fit.path[0]!
        expect(baseY).toBeCloseTo(gaiwan ? baseY : floor, 6)
        expect(baseY).toBeLessThan(mouth)
        // Échantillons le long de la tige, jusqu'à l'embouchure.
        for (let i = 0; i < fit.path.length - 1; i++) {
          const [ax, ay] = fit.path[i]!
          const [bx, by] = fit.path[i + 1]!
          for (let t = 0; t <= 1; t += 0.05) {
            const x = ax + t * (bx - ax)
            const y = ay + t * (by - ay)
            if (y > mouth || y < floor + SPROUT.stemRadius) continue
            expect(Math.abs(x) + SPROUT.stemRadius, `${vessel.id} stem at y=${y.toFixed(3)}`).toBeLessThan(insideRadius(inside, y) + 1e-9)
          }
        }
        if (vessel.lid) {
          for (const dx of [-SPROUT.stemRadius, SPROUT.stemRadius]) expect(openingDistance(vessel.lid, baseX + dx, 0)).toBeLessThan(0)
          for (const dz of [-SPROUT.stemRadius, SPROUT.stemRadius]) expect(openingDistance(vessel.lid, baseX, dz)).toBeLessThan(0)
        }
      })

      it('holds both leaves clear above every surface of the cup and lid', () => {
        const cup = createCup(vessel, { accessory: 'leaf' })
        cup.root.updateMatrixWorld(true)
        const sprout = cup.root.getObjectByName('sprout')!
        const surfaces = cup.root.children.filter(object => object !== sprout && !object.name.endsWith('-eye'))
        const ray = new Raycaster(new Vector3(), new Vector3(0, -1, 0))
        let checked = 0
        for (const side of ['right', 'left']) {
          sprout.getObjectByName(`sprout-leaf-${side}`)!.traverse(object => {
            if (!(object instanceof Mesh)) return
            const points = object.geometry.attributes.position!
            for (let i = 0; i < points.count; i += 3) {
              const point = new Vector3().fromBufferAttribute(points, i).applyMatrix4(object.matrixWorld)
              ray.ray.origin.set(point.x, 10, point.z)
              const hit = ray.intersectObjects(surfaces, true)[0]
              if (hit) expect(point.y - hit.point.y, `${object.name} at ${point.toArray()}`).toBeGreaterThan(0.02)
              checked++
            }
          })
        }
        expect(checked).toBeGreaterThan(100)
        cup.dispose()
      })

      it('leaves visible eyes clear through every gaze, both front quarters and the full elevation range', () => {
        const bare = createCup(vessel)
        const cup = createCup(vessel, { accessory: 'leaf' })
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
        bare.dispose()
        cup.dispose()
      })

      it('fits the existing accessory frame at every yaw and allowed elevation', () => {
        const cup = createCup(vessel, { accessory: 'leaf' })
        cup.root.updateMatrixWorld(true)
        let highest = -Infinity
        let lowest = Infinity
        let widest = 0
        cup.root.traverse(object => {
          if (!(object instanceof Mesh)) return
          const points = object.geometry.attributes.position!
          for (let i = 0; i < points.count; i++) {
            const point = new Vector3().fromBufferAttribute(points, i).applyMatrix4(object.matrixWorld)
            const radial = Math.hypot(point.x, point.z)
            widest = Math.max(widest, radial + (vessel.handle ? 0.18 : 0))
            for (let elevation = -20; elevation <= 60; elevation += 2) {
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

      it('fits once, builds identically, leaves the cup unchanged and disposes every resource once', () => {
        const original = JSON.stringify(vessel)
        const bare = createCup(vessel)
        const cup = createCup(vessel, { accessory: 'leaf' })
        const again = createCup(vessel, { accessory: 'leaf' })
        expect(fitSprout(vessel)).toBe(fitSprout(vessel))
        expect(JSON.stringify(vessel)).toBe(original)
        for (const part of bare.root.children) {
          const dressed = cup.root.getObjectByName(part.name)!
          // Seul le couvercle du gaiwan bouge : il pivote, sa géométrie reste la même.
          if (!(gaiwan && ['lid', 'lid-knob'].includes(part.name))) {
            expect(dressed.position.toArray()).toEqual(part.position.toArray())
            expect(dressed.rotation.toArray()).toEqual(part.rotation.toArray())
          }
          if (part instanceof Mesh) expect((dressed as Mesh).geometry.attributes.position!.array).toEqual(part.geometry.attributes.position!.array)
        }
        const disposals: ReturnType<typeof vi.spyOn>[] = []
        const materials = new Set<MeshBasicMaterial>()
        cup.root.getObjectByName('sprout')!.traverse(object => {
          if (!(object instanceof Mesh)) return
          expect((again.root.getObjectByName(object.name) as Mesh).geometry.attributes.position!.array).toEqual(object.geometry.attributes.position!.array)
          disposals.push(vi.spyOn(object.geometry, 'dispose'))
          materials.add(object.material as MeshBasicMaterial)
        })
        for (const material of materials) disposals.push(vi.spyOn(material, 'dispose'))
        cup.dispose()
        for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1)
        bare.dispose()
        again.dispose()
      })
    })
  }

  it('rises through the takeaway sip hole, not the middle of the lid', () => {
    const takeaway = vessels.find(vessel => vessel.id === 'takeaway')!
    const fit = fitSprout(takeaway)
    expect(fit.path.every(([x]) => x === takeaway.lid!.opening.center[0])).toBe(true)
    expect(fit.path.at(-1)![1]).toBeGreaterThan(takeaway.lid!.baseY + takeaway.lid!.height + takeaway.lid!.rise)
  })

  it('bends like a plant out of the gaiwan, rests on the rim and props the lid on its left seat', () => {
    const gaiwan = vessels.find(vessel => vessel.id === 'gaiwan')!
    expect(vessels.filter(vessel => fitSprout(vessel).lid).map(vessel => vessel.id)).toEqual(['gaiwan'])
    const fit = fitSprout(gaiwan)
    // Inclinaison de chaque tronçon par rapport à la verticale : plus droite dans
    // la tasse, aplatie au passage du bord, verticale au sommet.
    const lean = (i: number) => {
      const [ax, ay] = fit.path[i]!
      const [bx, by] = fit.path[i + 1]!
      return Math.atan2(bx - ax, by - ay) * 180 / Math.PI
    }
    const leans = fit.path.slice(0, -1).map((_, i) => lean(i))
    const flattest = leans.indexOf(Math.max(...leans))
    expect(Math.max(...leans) - leans[2]!).toBeGreaterThan(10)
    expect(Math.abs(leans.at(-1)!)).toBeLessThan(3)
    expect(flattest).toBeGreaterThan(5)
    expect(flattest).toBeLessThan(leans.length - 5)
    // Posée sur le bord, sans le traverser.
    const rim = gaiwan.parts.find(part => part.id === 'rim')!.outline
    const rimGap = Math.min(...rim.map(point => distanceToPath(fit.path, point)))
    expect(rimGap).toBeGreaterThan(SPROUT.stemRadius - 1e-3)
    expect(rimGap).toBeLessThan(SPROUT.stemRadius + 0.03)
    const cup = createCup(gaiwan, { accessory: 'leaf' })
    cup.root.updateMatrixWorld(true)
    let lowest = Infinity
    let closest = Infinity
    for (const name of ['lid', 'lid-knob']) {
      const mesh = cup.root.getObjectByName(name) as Mesh
      expect(mesh.rotation.z).toBeCloseTo(fit.lid!.angle * Math.PI / 180)
      const position = mesh.geometry.attributes.position!
      for (let i = 0; i < position.count; i++) {
        const point = new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
        lowest = Math.min(lowest, point.y)
        // Sur le plan de la tige (z = 0), le couvercle ne la traverse pas et repose dessus.
        if (Math.abs(point.z) < 0.02) closest = Math.min(closest, distanceToPath(fit.path, [point.x, point.y]))
      }
    }
    expect(closest).toBeGreaterThan(SPROUT.stemRadius - 1e-3)
    expect(closest).toBeLessThan(SPROUT.stemRadius + 0.02)
    const seat = gaiwan.parts.find(part => part.id === 'lid-seat')!
    expect(lowest).toBeCloseTo(Math.max(...seat.outline.map(point => point[1])), 6)
    expect(fit.lid!.angle).toBeLessThan(12)
    cup.dispose()
  })
})
