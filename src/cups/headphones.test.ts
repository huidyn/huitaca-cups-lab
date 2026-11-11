import { describe, expect, it, vi } from 'vitest'
import { Box3, Color, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three'
import { vessels } from './catalogue'
import { createCup } from './geometry'
import { bandPoint, earTouches, fitHeadphones, HEADPHONE_COLORS } from './headphones'
import { ACCESSORY_FRAME } from './renderer'

describe('charcoal-grey headphones', () => {
  it('uses three close grey tones, not black, with lighter shells and darker cushions', () => {
    const levels = Object.values(HEADPHONE_COLORS).map(value => {
      const color = new Color(value)
      const hsl = color.getHSL({ h: 0, s: 0, l: 0 })
      expect(hsl.s).toBeLessThan(0.1)
      const channels = value.slice(1).match(/../g)!.map(channel => parseInt(channel, 16))
      expect(Math.min(...channels)).toBeGreaterThan(60)
      expect(Math.max(...channels)).toBeLessThan(115)
      return hsl.l
    })
    expect(levels[1]).toBeGreaterThan(levels[0]!)
    expect(levels[0]).toBeGreaterThan(levels[2]!)
    expect(new Set(Object.values(HEADPHONE_COLORS)).size).toBe(3)
  })

  for (const vessel of vessels) {
    describe(vessel.id, () => {
      it('builds two rounded ear cups and one arched band, with fixed subtle unlit shading', () => {
        const cup = createCup(vessel, { accessory: 'headphones' })
        cup.root.updateMatrixWorld(true)
        const model = cup.root.getObjectByName('headphones')!
        const fit = fitHeadphones(vessel, cup.root)
        expect(model.children.map(object => object.name)).toEqual(['headphones-band', 'headphones-left', 'headphones-right'])
        for (const side of ['left', 'right']) {
          const ear = model.getObjectByName(`headphones-${side}`)!
          expect(ear.children.map(object => object.name)).toEqual([`headphones-${side}-cushion`, `headphones-${side}-shell`])
          const shellMesh = ear.getObjectByName(`headphones-${side}-shell`) as Mesh
          // Coques rondes et grandes : environ la moitié du diamètre de la tasse.
          shellMesh.geometry.computeBoundingBox()
          const shell = shellMesh.geometry.boundingBox!
          expect(shell.max.y - shell.min.y).toBeGreaterThan(0.6)
          expect(shell.max.y - shell.min.y).toBeCloseTo(shell.max.z - shell.min.z, 3)
          expect(shell.max.x - shell.min.x).toBeLessThan((shell.max.y - shell.min.y) * 0.4)
          const cushionMesh = ear.getObjectByName(`headphones-${side}-cushion`) as Mesh
          cushionMesh.geometry.computeBoundingBox()
          const cushion = cushionMesh.geometry.boundingBox!
          expect(cushion.max.y - cushion.min.y).toBeCloseTo(cushion.max.z - cushion.min.z, 3)
          expect(cushion.max.y - cushion.min.y).toBeGreaterThan((shell.max.y - shell.min.y) * 0.85)
          // Le bout de l'arceau entre réellement dans la coque, sans oreille flottante.
          const sign = side === 'left' ? -1 : 1
          const [x, z] = bandPoint(fit, sign * fit.footSpan, 0)
          const joint = new Vector3(x, fit.bandY, z)
          const tilt = side === 'right' ? fit.tilt : 0
          const direction = new Vector3(sign * Math.cos(tilt), 0, Math.sin(tilt))
          const ray = new Raycaster(joint.clone().addScaledVector(direction, 0.3), direction.negate())
          const hits = ray.intersectObject(shellMesh)
          expect(hits.length).toBeGreaterThanOrEqual(2)
          expect(hits[0]!.distance).toBeLessThan(0.3)
          expect(hits.at(-1)!.distance).toBeGreaterThan(0.3)
        }
        const band = new Box3().setFromObject(model.getObjectByName('headphones-band')!)
        const left = new Box3().setFromObject(model.getObjectByName('headphones-left')!)
        expect(band.max.y - left.max.y).toBeGreaterThan(0.25)
        // Le haut des coques arrive presque au bord, comme sur la référence.
        const rimY = Math.max(...vessel.parts.filter(part => part.id === 'rim' || (vessel.lid && part.id === 'lid')).flatMap(part => part.outline).map(point => point[1]))
        expect(left.max.y).toBeGreaterThan(rimY - 0.12)
        expect(left.max.y).toBeLessThan(rimY + 0.08)
        model.traverse(object => {
          if (!(object instanceof Mesh)) return
          const material = object.material as MeshBasicMaterial
          expect(material).toBeInstanceOf(MeshBasicMaterial)
          expect(material.vertexColors).toBe(true)
          expect(material.toneMapped).toBe(false)
          expect(object.castShadow || object.receiveShadow).toBe(false)
          expect(Array.from(object.geometry.attributes.position!.array).every(Number.isFinite)).toBe(true)
          const tones = object.geometry.attributes.color!
          let low = 1
          let high = 0
          for (let i = 0; i < tones.count; i++) {
            expect(tones.getX(i)).toBeCloseTo(tones.getY(i), 6)
            expect(tones.getX(i)).toBeCloseTo(tones.getZ(i), 6)
            low = Math.min(low, tones.getX(i))
            high = Math.max(high, tones.getX(i))
          }
          expect(low).toBeGreaterThanOrEqual(0.819)
          expect(high - low).toBeGreaterThan(0.05)
        })
        cup.dispose()
      })

      it('fits once, builds identically, preserves all cup and lid geometry, and disposes every resource once', () => {
        const original = JSON.stringify(vessel)
        const bare = createCup(vessel)
        const cup = createCup(vessel, { accessory: 'headphones' })
        const again = createCup(vessel, { accessory: 'headphones' })
        const fit = fitHeadphones(vessel, bare.root)
        expect(fitHeadphones(vessel, bare.root)).toBe(fit)
        expect(JSON.stringify(vessel)).toBe(original)
        for (const part of bare.root.children) {
          const dressed = cup.root.getObjectByName(part.name)!
          expect(dressed.position.toArray()).toEqual(part.position.toArray())
          expect(dressed.rotation.toArray()).toEqual(part.rotation.toArray())
          if (part instanceof Mesh) expect((dressed as Mesh).geometry.attributes.position!.array).toEqual(part.geometry.attributes.position!.array)
        }
        const disposals: ReturnType<typeof vi.spyOn>[] = []
        const materials = new Set<MeshBasicMaterial>()
        cup.root.getObjectByName('headphones')!.traverse(object => {
          if (!(object instanceof Mesh)) return
          expect((again.root.getObjectByName(object.name) as Mesh).geometry.attributes.position!.array).toEqual(object.geometry.attributes.position!.array)
          disposals.push(vi.spyOn(object.geometry, 'dispose'))
          materials.add(object.material as MeshBasicMaterial)
        })
        expect(materials.size).toBe(3)
        for (const material of materials) disposals.push(vi.spyOn(material, 'dispose'))
        cup.setColors({ body: '#ff0000', rim: '#ffffff' })
        expect((cup.root.getObjectByName('headphones-band') as Mesh<Mesh['geometry'], MeshBasicMaterial>).material.color.getHexString())
          .toBe(HEADPHONE_COLORS.band.slice(1))
        cup.dispose()
        for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1)
        bare.dispose()
        again.dispose()
      })

      it('keeps a real central recess and a smooth pad with only slight depth adaptation', () => {
        const cup = createCup(vessel, { accessory: 'headphones' })
        const fit = fitHeadphones(vessel, cup.root)
        for (const side of ['left', 'right']) {
          const cushion = cup.root.getObjectByName(`headphones-${side}-cushion`) as Mesh
          const points = cushion.geometry.attributes.position!
          // Le profil reste rond et peu déformé, pas une jupe moulée sur la tasse.
          for (let i = 0; i < points.count; i++) {
            const r = Math.hypot(points.getY(i), points.getZ(i))
            expect(r).toBeGreaterThan(fit.earRadius * 0.52 - 1e-6)
            expect(r).toBeLessThan(fit.earRadius * 0.9 + 1e-6)
            expect(points.getX(i)).toBeGreaterThan(-0.012001)
            expect(points.getX(i)).toBeLessThan(0.090001)
          }
          // Rayons sur le maillage seul : trou au centre, mousse à la périphérie.
          const isolated = new Mesh(cushion.geometry, cushion.material)
          const ray = new Raycaster(new Vector3(-0.2, 0, 0), new Vector3(1, 0, 0))
          expect(ray.intersectObject(isolated)).toHaveLength(0)
          ray.ray.origin.y = fit.earRadius * 0.7
          expect(ray.intersectObject(isolated).length).toBeGreaterThan(0)
        }
        cup.dispose()
      })

      if (['footed-bowl', 'round-bowl'].includes(vessel.id)) {
        it('lets the curved bowl enter the hollow centre without touching the rigid shell', () => {
          const cup = createCup(vessel, { accessory: 'headphones' })
          cup.root.updateMatrixWorld(true)
          const ear = cup.root.getObjectByName('headphones-left')!
          const model = cup.root.getObjectByName('headphones')!
          const surfaces = cup.root.children.filter(object => object !== model && !object.name.endsWith('-eye'))
          const origin = ear.localToWorld(new Vector3(2, 0, 0))
          const direction = new Vector3(-1, 0, 0).transformDirection(ear.matrixWorld)
          const hit = new Raycaster(origin, direction).intersectObjects(surfaces, true)[0]!
          const wall = ear.worldToLocal(hit.point.clone()).x
          expect(wall).toBeGreaterThan(0)
          expect(wall).toBeLessThan(0.075)
          cup.dispose()
        })
      }

      it('keeps all surfaces outside the actual cup and lids while the cushions stay close to the wall', () => {
        const cup = createCup(vessel, { accessory: 'headphones' })
        cup.root.updateMatrixWorld(true)
        const model = cup.root.getObjectByName('headphones')!
        const surfaces = cup.root.children.filter(object => object !== model && object.name !== 'handle' && !object.name.endsWith('-eye'))
        const contacts = { left: Infinity, right: Infinity }
        let checked = 0
        model.traverse(object => {
          if (!(object instanceof Mesh)) return
          const points = object.geometry.attributes.position!
          const index = object.geometry.index!
          const probes: Vector3[] = []
          for (let i = 0; i < points.count; i += 5) probes.push(new Vector3().fromBufferAttribute(points, i))
          for (let i = 0; i < index.count; i += 27) {
            const point = new Vector3()
            for (let side = 0; side < 3; side++) point.add(new Vector3().fromBufferAttribute(points, index.getX(i + side)))
            probes.push(point.divideScalar(3))
          }
          for (const point of probes) {
            point.applyMatrix4(object.matrixWorld)
            const radius = Math.hypot(point.x, point.z)
            if (radius < 1e-8) continue
            const ray = new Raycaster(new Vector3(0, point.y, 0), new Vector3(point.x, 0, point.z).normalize())
            const hits = ray.intersectObjects(surfaces, true)
            if (!hits.length) continue
            const gap = radius - Math.max(...hits.map(hit => hit.distance))
            // La mousse peut très légèrement mordre la surface entre ses sommets ;
            // la coque et l'arceau restent rigides et strictement hors de la tasse.
            expect(gap, `${object.name} at ${point.toArray()}`).toBeGreaterThan(object.name.endsWith('-cushion') ? -0.002 : 0.002)
            if (object.name.endsWith('-cushion')) {
              const side = object.name.includes('-left-') ? 'left' : 'right'
              contacts[side] = Math.min(contacts[side], gap)
            }
            checked++
          }
        })
        expect(checked).toBeGreaterThan(50)
        expect(contacts.left).toBeLessThan(0.012)
        expect(contacts.right).toBeLessThan(0.012)
        const band = model.getObjectByName('headphones-band') as Mesh
        const highest = Math.max(...surfaces.map(object => new Box3().setFromObject(object).max.y))
        expect(new Box3().setFromObject(band).max.y).toBeGreaterThan(highest + 0.08)
        cup.dispose()
      })

      if (vessel.handle) {
        it('clears every vertex of the real flared handle without changing it', () => {
          const cup = createCup(vessel, { accessory: 'headphones' })
          cup.root.updateMatrixWorld(true)
          const handleMesh = cup.root.getObjectByName('handle') as Mesh
          const handle = new Box3().setFromObject(handleMesh)
          const fit = fitHeadphones(vessel, cup.root)
          const points = handleMesh.geometry.attributes.position!
          for (let i = 0; i < points.count; i++) {
            const point = new Vector3().fromBufferAttribute(points, i).applyMatrix4(handleMesh.matrixWorld)
            expect(earTouches(fit, point, 0.015), `handle vertex ${point.toArray()}`).toBe(false)
          }
          const bandMesh = cup.root.getObjectByName('headphones-band') as Mesh
          const bandPoints = bandMesh.geometry.attributes.position!
          handle.expandByScalar(0.015)
          for (let i = 0; i < bandPoints.count; i++) {
            expect(handle.containsPoint(new Vector3().fromBufferAttribute(bandPoints, i).applyMatrix4(bandMesh.matrixWorld))).toBe(false)
          }
          expect(fit.tilt).toBeLessThan(0.9)
          // Une seule oreille quitte sa place : celle du côté opposé reste sur le flanc.
          const left = cup.root.getObjectByName('headphones-left')!
          const right = cup.root.getObjectByName('headphones-right')!
          expect(left.position.z).toBeCloseTo(0, 6)
          expect(left.position.x).toBeLessThan(-0.5)
          // Le porte-verre a une anse basse, sous les coques : rien à décaler.
          if (vessel.id === 'podstakannik') expect(right.position.z).toBeCloseTo(0, 6)
          else expect(right.position.z).toBeGreaterThan(0.2)
          cup.dispose()
        })
      }

      it('leaves visible eyes clear through every gaze, both front quarters and the full elevation range', () => {
        const bare = createCup(vessel)
        const cup = createCup(vessel, { accessory: 'headphones' })
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
        const cup = createCup(vessel, { accessory: 'headphones' })
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
    })
  }
})
