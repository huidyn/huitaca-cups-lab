import { describe, expect, it } from 'vitest'
import { Mesh, Raycaster, Vector3 } from 'three'
import { vessels } from './catalogue'
import { createCup } from './geometry'

const takeaway = vessels.find(v => v.id === 'takeaway')!
const lid = takeaway.lid!

describe('raised takeaway lid', () => {
  it('has an open passage through the complete lid into the dark cup interior', () => {
    const cup = createCup(takeaway)
    try {
      cup.root.updateMatrixWorld(true)
      for (const x of [-0.06, 0, 0.06]) {
        for (const z of [-0.12, 0, 0.12]) {
          const ray = new Raycaster(
            new Vector3(lid.opening.center[0] + x, 4, lid.opening.center[1] + z),
            new Vector3(0, -1, 0)
          )
          const hits = ray.intersectObject(cup.root, true)
          expect(hits.length).toBeGreaterThan(0)
          expect(hits[0]!.object.name).toBe('inside')
        }
      }
    } finally { cup.dispose() }
  })

  it('raises only a lip around the opening and keeps the lid edge flat', () => {
    const cup = createCup(takeaway)
    try {
      cup.root.updateMatrixWorld(true)
      const heightAt = (x: number, z: number) => {
        const ray = new Raycaster(new Vector3(x, 4, z), new Vector3(0, -1, 0))
        const hit = ray.intersectObject(cup.root, true)[0]!
        expect(hit.object.name).toBe('lid-top')
        return hit.point.y
      }
      const [cx, cz] = lid.opening.center
      const lipX = cx - lid.opening.depth / 2 - lid.raise.margin / 2
      // Le maillage interpole entre ses sommets : la levre approche sa hauteur.
      expect(heightAt(lipX, cz)).toBeGreaterThan(lid.baseY + lid.height + lid.rise * 0.85)
      for (const [x, z] of [[-0.6, 0], [0.7, 0], [0, 0.6], [0, -0.6]] as const) {
        expect(heightAt(x, z)).toBeCloseTo(lid.baseY + lid.height, 5)
      }
    } finally { cup.dispose() }
  })

  it('has a visible opening from the default camera and while the cup turns', () => {
    const cup = createCup(takeaway)
    try {
      const elevation = 16 * Math.PI / 180
      const direction = new Vector3(0, Math.sin(elevation), Math.cos(elevation))
      for (const yaw of [-0.44, 0, 0.44]) {
        cup.root.rotation.y = yaw
        cup.root.updateMatrixWorld(true)
        const target = cup.root.localToWorld(new Vector3(...takeaway.anchors.steam!))
        const ray = new Raycaster(target.clone().addScaledVector(direction, 10), direction.clone().negate())
        const hits = ray.intersectObject(cup.root, true)
        expect(hits.length).toBeGreaterThan(0)
        expect(['lid-throat', 'inside']).toContain(hits[0]!.object.name)
      }
    } finally { cup.dispose() }
  })

  it('places the future steam anchor in the opening and builds finite geometry', () => {
    expect(takeaway.anchors.steam).toEqual([
      lid.opening.center[0], lid.baseY + lid.height + lid.rise, lid.opening.center[1]
    ])
    const cup = createCup(takeaway)
    try {
      cup.root.traverse(object => {
        if (!(object instanceof Mesh)) return
        expect(Array.from(object.geometry.attributes.position!.array).every(Number.isFinite)).toBe(true)
      })
    } finally { cup.dispose() }
  })
})
