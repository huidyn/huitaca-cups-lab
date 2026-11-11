import { readFileSync } from 'node:fs'
import { Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { vessels } from './catalogue'
import { createCup } from './geometry'
import { palette, paletteVessel, takeawayLidColors } from './palette'

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

  it.each(vessels.filter(vessel => !vessel.heritage))('updates $name for all twelve colours without rebuilding geometry or mutating the catalogue', vessel => {
    const cup = createCup(paletteVessel(vessel, palette[0].colors))
    const meshes: Mesh[] = []
    cup.root.traverse(child => { if (child instanceof Mesh) meshes.push(child) })
    const geometries = meshes.map(mesh => mesh.geometry)
    try {
      for (const option of palette) {
        cup.setColors(paletteVessel(vessel, option.colors).colors)
        expect(meshes.map(mesh => mesh.geometry)).toEqual(geometries)
        for (const part of vessel.parts) {
          const mesh = cup.root.getObjectByName(part.id) as Mesh
          const expected = vessel.id === 'takeaway' && part.id === 'lid' ? '#c4c6c0'
            : vessel.id === 'takeaway' && part.id === 'lid-edge' ? '#b9bbb5'
              : option.colors[part.color as keyof typeof option.colors]
          expect((mesh.material as MeshBasicMaterial).color.getHexString())
            .toBe(expected.slice(1))
        }
        for (const name of ['left-eye', 'right-eye']) {
          const eye = cup.root.getObjectByName(name) as Mesh
          expect((eye.material as MeshBasicMaterial).color.getHexString()).toBe(option.colors.eyes.slice(1))
        }
        if (vessel.id === 'takeaway') {
          for (const mesh of cup.root.getObjectByName('lid-top')!.children as Mesh[]) {
            expect((mesh.material as MeshBasicMaterial).color.getHexString())
              .toBe(mesh.name === 'lid-throat' ? 'a4a69f' : 'c4c6c0')
          }
          expect(vessel.parts.find(part => part.id === 'lid')!.color).toBe('body')
          expect(vessel.lid!.color).toBe('body')
          expect(vessel.lid!.insideColor).toBe('inside')
        }
        if (vessel.handle) {
          const handle = cup.root.getObjectByName('handle') as Mesh
          expect((handle.material as MeshBasicMaterial).color.getHexString()).toBe(option.colors.body.slice(1))
        }
        expect(vessel.colors.body).toBe('#959693')
      }
    } finally {
      cup.dispose()
    }
  })

  it('keeps the takeaway lid lighter than every body colour but visible on the light background', () => {
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map(i => {
        const value = parseInt(hex.slice(i, i + 2), 16) / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
    }
    for (const option of palette) {
      expect(luminance(takeawayLidColors.lid)).toBeGreaterThan(luminance(option.colors.body))
    }
    expect((luminance('#f5f5f5') + 0.05) / (luminance(takeawayLidColors.lid) + 0.05)).toBeGreaterThan(1.5)
  })

  it('provides a 512-pixel RGBA PNG fallback for all 144 non-cultural cup/colour combinations', () => {
    for (const vessel of vessels.filter(vessel => !vessel.heritage)) {
      for (const option of palette) {
        const folder = vessel.id === 'mug' ? '' : `${vessel.id}/`
        const image = readFileSync(new URL(`../../public/cups/stills/palette/${folder}${option.id}.png`, import.meta.url))
        expect(image.subarray(1, 4).toString()).toBe('PNG')
        expect(image.readUInt32BE(16)).toBe(512)
        expect(image.readUInt32BE(20)).toBe(512)
        expect(image[25]).toBe(6)
      }
    }
  })
})
