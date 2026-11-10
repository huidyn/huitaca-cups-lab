import { readFileSync } from 'node:fs'
import { Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { vessels } from './catalogue'
import { createCup } from './geometry'
import { palette } from './palette'

describe('independent cup palette', () => {
  it('leaves all eighteen catalogue forms in the original grey', () => {
    for (const vessel of vessels) {
      expect(vessel.colors.body).toBe('#959693')
      expect(vessel.colors.inside).toBe('#626460')
      expect(vessel.colors.rim).toBe('#a3a49f')
      expect(vessel.colors.eyes).toBe('#fffef9')
    }
    expect(palette).toHaveLength(12)
    expect(new Set(palette.map(option => option.colors.body)).size).toBe(12)
  })

  it('updates existing materials for all twelve choices without rebuilding geometry or mutating the catalogue', () => {
    const cup = createCup(vessels[0]!)
    const meshes = cup.root.children.filter(child => child instanceof Mesh)
    const geometries = meshes.map(mesh => mesh.geometry)
    try {
      for (const option of palette) {
        cup.setColors(option.colors)
        expect(meshes.map(mesh => mesh.geometry)).toEqual(geometries)
        for (const [part, slot] of [['body', 'body'], ['inside', 'inside'], ['rim', 'rim'], ['handle', 'body']] as const) {
          const mesh = cup.root.getObjectByName(part) as Mesh
          expect((mesh.material as MeshBasicMaterial).color.getHexString()).toBe(option.colors[slot].slice(1))
        }
        expect(vessels[0]!.colors.body).toBe('#959693')
      }
    } finally {
      cup.dispose()
    }
  })

  it('provides a 512-pixel PNG fallback for each colour', () => {
    for (const option of palette) {
      const image = readFileSync(new URL(`../../public/cups/stills/palette/${option.id}.png`, import.meta.url))
      expect(image.subarray(1, 4).toString()).toBe('PNG')
      expect(image.readUInt32BE(16)).toBe(512)
      expect(image.readUInt32BE(20)).toBe(512)
    }
  })
})
