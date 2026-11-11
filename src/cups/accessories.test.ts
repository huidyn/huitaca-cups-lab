import { describe, expect, it } from 'vitest'
import { Mesh, Vector3 } from 'three'
import { vessels } from './catalogue'
import { createCup } from './geometry'
import { openingDistance } from './lid'
import { ACCESSORY_FRAME } from './renderer'
import { BRUSH_LENGTH, brushAxis, fitBrush } from './accessories'
import type { Point2 } from './types'

// Intersections horizontales des profils JSON, indépendantes du calcul de pose.
function radiiAt(outline: Point2[], height: number) {
  const radii: number[] = []
  for (let i = 1; i < outline.length; i++) {
    const [ar, ay] = outline[i - 1]!
    const [br, by] = outline[i]!
    if (height < Math.min(ay, by) - 1e-9 || height > Math.max(ay, by) + 1e-9) continue
    if (ay === by) radii.push(ar, br)
    else radii.push(ar + (br - ar) * (height - ay) / (by - ay))
  }
  return radii
}

describe('paintbrush fit', () => {
  for (const vessel of vessels) {
    describe(vessel.id, () => {
      const fit = fitBrush(vessel)
      const [dx, dy] = brushAxis(fit.lean)
      const at = (s: number) => [fit.mouth[0] + s * dx, fit.mouth[1] + s * dy, fit.mouth[2]] as const

      it('rests its lower end on the cup floor instead of floating above it', () => {
        const floor = Math.min(...vessel.parts.find(part => part.id === 'inside')!.outline.map(point => point[1]))
        const [x, y, z] = at(-fit.depth)
        const flat = vessel.parts.find(part => part.id === 'inside')!.outline.filter(point => point[1] === floor)
        expect(Math.abs(x) + fit.brush.endRadius).toBeLessThan(Math.max(...flat.map(point => point[0])))
        expect(z).toBe(0)
        expect(y - fit.brush.endRadius * dx).toBeCloseTo(floor, 6)
      })

      it('keeps the complete tapered handle inside the floor, walls and rim', () => {
        const inside = vessel.parts.find(part => part.id === 'inside')!.outline
        const floor = Math.min(...inside.map(point => point[1]))
        const rim = vessel.parts.filter(part => part.id === 'rim' || part.id === 'lid-seat')
        let penetration = 0
        for (let row = 0; row <= 120; row++) {
          const fraction = row / 120
          const [x, y] = at(-fit.depth + fraction * (fit.depth + fit.brush.exposed))
          const radius = fit.brush.endRadius + (fit.brush.radius - fit.brush.endRadius) * fraction
          for (let side = 0; side < 96; side++) {
            const angle = side / 96 * 2 * Math.PI
            const px = x + radius * Math.cos(angle) * dy
            const py = y - radius * Math.cos(angle) * dx
            const pz = radius * Math.sin(angle)
            const candidates = radiiAt(inside, py)
            let room = candidates.length ? Math.max(...candidates) : Infinity
            for (const part of rim) {
              const edge = radiiAt(part.outline, py)
              if (edge.length) room = Math.min(room, ...edge)
            }
            penetration = Math.max(penetration, floor - py, Math.hypot(px, pz) - room)
          }
        }
        expect(penetration).toBeLessThan(1e-6)
      })

      it('touches the right rim or sip-hole edge rather than floating in the opening', () => {
        const cup = createCup(vessel, { accessory: 'paintbrush' })
        cup.root.updateMatrixWorld(true)
        const handle = cup.root.getObjectByName('paintbrush')!
        const point = new Vector3()
        let closest = Infinity
        const names = vessel.lid ? ['lid-throat'] : ['rim', 'lid-seat']
        for (const name of names) {
          const mesh = cup.root.getObjectByName(name) as Mesh | undefined
          if (!mesh) continue
          const vertices = mesh.geometry.attributes.position!
          for (let i = 0; i < vertices.count; i++) {
            point.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld)
            if (point.x <= 0) continue
            handle.worldToLocal(point)
            if (point.y < -fit.depth || point.y > fit.brush.exposed) continue
            const r = fit.brush.endRadius + (fit.brush.radius - fit.brush.endRadius) *
              (point.y + fit.depth) / (fit.depth + fit.brush.exposed)
            closest = Math.min(closest, Math.abs(Math.hypot(point.x, point.z) - r))
          }
        }
        expect(closest).toBeLessThan(1e-6)
        cup.dispose()
      })

      it('shows a shorter, fuller brush while keeping the takeaway handle thin', () => {
        const brush = createCup(vessel, { accessory: 'paintbrush' })
        const group = brush.root.getObjectByName('paintbrush')!
        expect(group.children.map(child => child.name)).toEqual(['brush-handle', 'brush-ferrule', 'brush-bristles'])
        expect(BRUSH_LENGTH).toBeCloseTo(0.92)
        const handle = group.getObjectByName('brush-handle') as Mesh
        const bristles = group.getObjectByName('brush-bristles') as Mesh
        handle.geometry.computeBoundingBox()
        bristles.geometry.computeBoundingBox()
        expect(handle.geometry.boundingBox!.max.x).toBeCloseTo(vessel.id === 'takeaway' ? 0.055 : 0.0715, 6)
        expect(handle.geometry.boundingBox!.max.y).toBeCloseTo(0.38, 6)
        expect(bristles.geometry.boundingBox!.max.x).toBeCloseTo(0.1288, 6)
        expect(bristles.geometry.boundingBox!.max.y).toBeCloseTo(0.4, 6)
        brush.dispose()
      })

      it('stays inside the accessory frame at every turn and view angle', () => {
        const cup = createCup(vessel, { accessory: 'paintbrush' })
        cup.root.updateMatrixWorld(true)
        const point = new Vector3()
        let top = -Infinity
        let bottom = Infinity
        let side = 0
        cup.root.traverse(object => {
          if (!(object instanceof Mesh)) return
          const position = object.geometry.attributes.position!
          for (let i = 0; i < position.count; i++) {
            point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld)
            const radial = Math.hypot(point.x, point.z)
            side = Math.max(side, radial + (vessel.handle ? 0.18 : 0))
            for (let elevation = -20; elevation <= 60; elevation += 5) {
              const e = elevation * Math.PI / 180
              const v = (point.y - ACCESSORY_FRAME.lift) * Math.cos(e)
              top = Math.max(top, v + radial * Math.abs(Math.sin(e)))
              bottom = Math.min(bottom, v - radial * Math.abs(Math.sin(e)))
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

  it('rests on the takeaway sip-hole edge without crossing the throat', () => {
    const vessel = vessels.find(option => option.id === 'takeaway')!
    const lid = vessel.lid!
    const fit = fitBrush(vessel)
    const [dx, dy] = brushAxis(fit.lean)
    let penetration = -Infinity
    for (let y = fit.mouth[1]; y >= lid.baseY - lid.opening.wallDepth; y -= 0.005) {
      const s = (y - fit.mouth[1]) / dy
      const r = fit.brush.endRadius + (fit.brush.radius - fit.brush.endRadius) *
        (s + fit.depth) / (fit.depth + fit.brush.exposed)
      for (let side = 0; side < 96; side++) {
        const angle = side / 96 * 2 * Math.PI
        const x = fit.mouth[0] + s * dx + r * Math.cos(angle) / dy
        const z = fit.mouth[2] + r * Math.sin(angle)
        penetration = Math.max(penetration, openingDistance(lid, x, z))
      }
    }
    expect(penetration).toBeLessThan(1e-5)
  })

  it('rests the gaiwan lid on its left seat and the supported brush, without crossing it', () => {
    const gaiwan = vessels.find(option => option.id === 'gaiwan')!
    expect(vessels.filter(vessel => fitBrush(vessel).lid).map(vessel => vessel.id)).toEqual(['gaiwan'])
    const fit = fitBrush(gaiwan)
    const cup = createCup(gaiwan, { accessory: 'paintbrush' })
    cup.root.updateMatrixWorld(true)
    const brush = cup.root.getObjectByName('paintbrush')!
    const point = new Vector3()
    let closest = -Infinity
    let lowest = Infinity
    for (const name of ['lid', 'lid-knob']) {
      const mesh = cup.root.getObjectByName(name) as Mesh
      expect(mesh.rotation.z).toBeCloseTo(fit.lid!.angle * Math.PI / 180)
      const position = mesh.geometry.attributes.position!
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
        lowest = Math.min(lowest, point.y)
        brush.worldToLocal(point)
        const radius = fit.brush.endRadius + (fit.brush.radius - fit.brush.endRadius) *
          (point.y + fit.depth) / (fit.depth + fit.brush.exposed)
        closest = Math.max(closest, point.x + radius)
      }
    }
    // Toute la surface reste du côté gauche du plan tangent au manche.
    expect(closest).toBeCloseTo(0, 6)
    expect(closest).toBeLessThan(1e-6)
    const seat = gaiwan.parts.find(part => part.id === 'lid-seat')!
    expect(lowest).toBeCloseTo(Math.max(...seat.outline.map(point => point[1])), 6)
    expect(fit.lid!.angle).toBeLessThan(22)
    for (const name of ['body', 'rim', 'lid-seat']) expect(cup.root.getObjectByName(name)!.rotation.z).toBe(0)
    cup.dispose()
  })

  it('derives and caches distinct fixed angles from the cup geometry', () => {
    expect(new Set(vessels.map(vessel => fitBrush(vessel).lean.toFixed(3))).size).toBeGreaterThan(12)
    for (const vessel of vessels) {
      expect(fitBrush(vessel)).toBe(fitBrush(vessel))
      expect(fitBrush(vessel).lean).toBeGreaterThan(0)
      expect(fitBrush(vessel).lean).toBeLessThan(60)
    }
  })
})
