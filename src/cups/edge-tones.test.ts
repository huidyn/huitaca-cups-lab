import { describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { addEdgeTones } from './edge-tones'
import { createCup } from './geometry'
import { vessels } from './catalogue'
import { palette, paletteVessel } from './palette'

describe('unlit edge-tone trial', () => {
  it('keeps upward faces unchanged and darkens vertical edges without moving geometry', () => {
    const geometry = new BoxGeometry()
    const positions = geometry.attributes.position!.array.slice()
    const indices = geometry.index!.array.slice()
    addEdgeTones(geometry)
    const tones = geometry.attributes.color!
    const normals = geometry.attributes.normal!
    for (let i = 0; i < tones.count; i++) {
      const expected = Math.abs(normals.getY(i)) === 1 ? 1 : 0.82
      expect(tones.getX(i)).toBeCloseTo(expected, 6)
      expect(tones.getY(i)).toBe(tones.getX(i))
      expect(tones.getZ(i)).toBe(tones.getX(i))
    }
    expect(geometry.attributes.position!.array).toEqual(positions)
    expect(geometry.index!.array).toEqual(indices)
    geometry.dispose()
  })

  it.each(['grey', ...palette.map(option => option.id)])('separates the takeaway lip and bevel in %s without tinting its body or eyes', color => {
    const vessel = vessels.find(vessel => vessel.id === 'takeaway')!
    const original = JSON.stringify(vessel)
    const option = palette.find(option => option.id === color)
    const definition = option ? paletteVessel(vessel, option.colors) : vessel
    const cup = createCup(definition)
    const top = cup.root.getObjectByName('lid-top')!.children.find(child => child.name === 'lid-top') as Mesh
    for (const name of ['lid', 'lid-edge', 'lid-top', 'lid-skirt']) {
      const mesh = name === 'lid-top' ? top : cup.root.getObjectByName(name) as Mesh
      const material = mesh.material as MeshBasicMaterial
      expect(material.vertexColors, name).toBe(true)
      expect(material.toneMapped).toBe(false)
      expect(mesh.castShadow).toBe(false)
      const tones = mesh.geometry.attributes.color!
      expect(tones.count).toBe(mesh.geometry.attributes.position!.count)
      expect(Math.min(...tones.array)).toBeGreaterThanOrEqual(0.819999)
      expect(Math.max(...tones.array)).toBeLessThanOrEqual(1)
    }
    const tones = top.geometry.attributes.color!.array
    expect(Math.max(...tones)).toBeCloseTo(1, 6)
    expect(Math.min(...tones)).toBeLessThan(0.95)
    for (const name of ['body', 'left-eye', 'right-eye', 'lid-throat']) {
      const mesh = cup.root.getObjectByName(name) as Mesh
      expect((mesh.material as MeshBasicMaterial).vertexColors, name).toBe(false)
      expect(mesh.geometry.attributes.color).toBeUndefined()
    }
    const body = cup.root.getObjectByName('body') as Mesh
    expect(body.material).not.toBe(top.material)
    cup.setColors({ [definition.lid!.color]: '#123456' })
    expect((top.material as MeshBasicMaterial).color.getHexString()).toBe('123456')
    expect(top.geometry.attributes.color!.array).toBe(tones)
    expect(JSON.stringify(vessel)).toBe(original)
    cup.dispose()
  })

  it('keeps the beret stem distinct at the low starting angle, not only when viewed from above', () => {
    for (const vessel of vessels) {
      const cup = createCup(vessel, { accessory: 'beret' })
      cup.root.updateMatrixWorld(true)
      const stem = cup.root.getObjectByName('beret-stem') as Mesh
      const crown = cup.root.getObjectByName('beret-crown') as Mesh
      const stemMaterial = stem.material as MeshBasicMaterial
      const crownMaterial = crown.material as MeshBasicMaterial
      expect(stemMaterial.color.r).toBeLessThan(crownMaterial.color.r * 0.8)
      const positions = stem.geometry.attributes.position!
      const direction = new Vector3(0, Math.sin(16 * Math.PI / 180), Math.cos(16 * Math.PI / 180))
      let visible = 0
      for (let i = 0; i < positions.count; i++) {
        const point = new Vector3().fromBufferAttribute(positions, i).applyMatrix4(stem.matrixWorld)
        const ray = new Raycaster(point.clone().addScaledVector(direction, 10), direction.clone().negate())
        if (ray.intersectObject(cup.root, true)[0]?.object === stem) visible++
      }
      expect(visible, `${vessel.id}: stem hidden by crown`).toBeGreaterThan(0)
      cup.dispose()
    }
  })

  it('disposes separate toned lid materials once, including those sharing the body colour slot', () => {
    const cup = createCup(vessels.find(vessel => vessel.id === 'takeaway')!)
    const materials = new Set<MeshBasicMaterial>()
    cup.root.traverse(object => {
      if (object instanceof Mesh) materials.add(object.material as MeshBasicMaterial)
    })
    const spies = [...materials].map(material => vi.spyOn(material, 'dispose'))
    cup.dispose()
    spies.forEach(spy => expect(spy).toHaveBeenCalledOnce())
  })

  it('leaves all other bare cups completely flat and unlit', () => {
    for (const vessel of vessels.filter(vessel => vessel.id !== 'takeaway')) {
      const cup = createCup(vessel)
      cup.root.traverse(object => {
        if (!(object instanceof Mesh)) return
        expect((object.material as MeshBasicMaterial).vertexColors).toBe(false)
        expect(object.geometry.attributes.color).toBeUndefined()
      })
      cup.dispose()
    }
  })
})
