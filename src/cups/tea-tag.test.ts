import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { Box3, Mesh, MeshBasicMaterial, Raycaster, TubeGeometry, Vector3 } from 'three'
import { vessels } from './catalogue'
import { createCup } from './geometry'
import { ACCESSORY_FRAME } from './renderer'
import { fitTeaTag, TEA_TAG } from './tea-tag'

describe('left-side tea tag', () => {
  it('preserves the approved string geometry on lidless cups, and passes straight through lids', () => {
    const hashes = Object.fromEntries(vessels.map(vessel => {
      const cup = createCup(vessel, { accessory: 'tea-bag' })
      const string = cup.root.getObjectByName('tea-string') as Mesh
      const hash = createHash('sha256')
      for (const attribute of ['position', 'normal']) {
        const array = string.geometry.attributes[attribute]!.array
        hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
      }
      const result = hash.digest('hex')
      cup.dispose()
      return [vessel.id, result]
    }))
    expect(hashes).toMatchInlineSnapshot(`
      {
        "cay-glass": "3920b8c6fe5c51ffd3cfbf287bdfe34f4621c3b8ecdd6cf46428fd170442186e",
        "colombian-mug": "61d70457df2eabbd7f247333cc434cbcefff40a33f938ccad3d41ffc285fff8c",
        "footed-bowl": "b616db4cecb9fe7dba8fe9539b54bf413def6aecb4e36b4cd63382cd6242006e",
        "gaiwan": "8278e967371eee64e8583163ccfcfc8e77a9ef987d37c442dd5c485f0f9ec612",
        "goblet": "a8026d0b9ec32b6ef76255a24d751f3ffec35289a0782f7a5651c06ceacf3e8d",
        "kulhad": "2830298c34b75a8893acd35df7ea73a0b6f70a46cada68c1a289c5e3a9685adf",
        "mug": "82f6480fce462e85c25218337d003e14d8f0f0843b2f2f4299ea5c1c5dceef7b",
        "podstakannik": "57960fe242dcf014d1379916350a669250497de52fd8684fc22f960213576f2c",
        "rimmed-cup": "0022de75e7cc397701eb4a77896b98a39b9d01bf0f22f22657f68b98016839b7",
        "round-bowl": "d7725658188422a52930d4517fbb8333bb728794b3183d7372fc2052bbba8dc0",
        "round-mug": "a5f293f8e4df9bdbdaa88d53906e5f53f314bebba3b4510aaf9f443f37172eb7",
        "rounded-tumbler": "bc46ba89cc4e1a689afb2abcc989de0ddf3e4ee177b916d5a71fbcbb927a2d72",
        "small-cup": "d1e122ff077bddba27cab1e58f9935c1f93389cb1b8e8a4ce956341798c98c57",
        "takeaway": "c568b7adf5cf1cef4727ed2a95f42c2ff082cd0a3bedb7a3c9162513f6570e5c",
        "tall-mug": "a9870ef2ab95e3cbd7de12614b05dfd91c1ee0c02c52bf93856e902d78140610",
        "teacup": "44175ea5668a75fadd9b3d224a87f74b4d898ae2d95567d7acc66d7478af24ce",
        "tumbler": "ffc70fe24eed0056cbbb9422ef90ab2a95c6e6ebdeb798920a3b011a51d9155e",
        "yunomi": "3000decfc2ea738a2f5cc7791278ff27a0642fa68a06136db60af96c046f86a3",
      }
    `)
  })

  for (const vessel of vessels) {
    describe(vessel.id, () => {
      it('builds a readable round cream string and a plain yellow tag, without other accessories', () => {
        const cup = createCup(vessel, { accessory: 'tea-bag' })
        const group = cup.root.getObjectByName('tea-bag')!
        expect(group.children.map(child => child.name)).toEqual(['tea-string', 'tea-tag'])
        const string = group.getObjectByName('tea-string') as Mesh
        expect(string.geometry).toBeInstanceOf(TubeGeometry)
        expect((string.geometry as TubeGeometry).parameters.radius).toBe(0.016)
        const paper = group.getObjectByName('tea-tag') as Mesh
        expect(paper.scale.toArray()).toEqual([1.3, 1.3, 1])
        paper.geometry.computeBoundingBox()
        const size = paper.geometry.boundingBox!.getSize(new Vector3()).multiply(paper.scale)
        expect(size.x).toBeCloseTo(0.338, 6)
        expect(size.y).toBeCloseTo(0.39, 6)
        expect(size.z).toBeCloseTo(0.025, 6)
        const attachment = paper.localToWorld(new Vector3(0, TEA_TAG.height / 2 - 0.015, 0))
        expect((string.geometry as TubeGeometry).parameters.path.getPointAt(1).distanceTo(attachment)).toBeLessThan(1e-6)
        for (const [name, color] of [['tea-string', 'e3dbd1'], ['tea-tag', 'e2b245']]) {
          const mesh = group.getObjectByName(name!) as Mesh
          const material = mesh.material as MeshBasicMaterial
          expect(material).toBeInstanceOf(MeshBasicMaterial)
          expect(material.color.getHexString()).toBe(color)
          expect(material.toneMapped).toBe(false)
          expect(mesh.castShadow).toBe(false)
          expect(Array.from(mesh.geometry.attributes.position!.array).every(Number.isFinite)).toBe(true)
        }
        expect(cup.root.getObjectByName('paintbrush')).toBeUndefined()
        expect(cup.root.getObjectByName('beret')).toBeUndefined()
        cup.dispose()
      })

      it('keeps both string and tag left of either eye across the complete gaze range', () => {
        const cup = createCup(vessel, { accessory: 'tea-bag' })
        cup.root.updateMatrixWorld(true)
        const paper = new Box3().setFromObject(cup.root.getObjectByName('tea-tag')!)
        const string = new Box3().setFromObject(cup.root.getObjectByName('tea-string')!)
        for (const x of [-1, 0, 1]) {
          for (const y of [-1, 0, 1]) {
            cup.look(x, y)
            const eye = new Box3().setFromObject(cup.root.getObjectByName('left-eye')!)
            expect(paper.max.x).toBeLessThan(eye.min.x - 0.05)
            expect(string.max.x).toBeLessThan(eye.min.x - 0.01)
          }
        }
        const direction = new Vector3(0, Math.sin(16 * Math.PI / 180), Math.cos(16 * Math.PI / 180))
        const center = cup.root.getObjectByName('tea-tag')!.localToWorld(new Vector3(0, 0, TEA_TAG.depth / 2))
        const ray = new Raycaster(center.clone().addScaledVector(direction, 10), direction.clone().negate())
        expect(ray.intersectObject(cup.root, true)[0]?.object.name).toBe('tea-tag')
        cup.dispose()
      })

      it('does not hide visible eye centres when viewed from the front or either front quarter', () => {
        const bare = createCup(vessel)
        const tea = createCup(vessel, { accessory: 'tea-bag' })
        for (const gaze of [-1, 1]) {
          bare.look(gaze, gaze)
          tea.look(gaze, gaze)
          for (const yaw of [-30, 0, 30]) {
            bare.root.rotation.y = tea.root.rotation.y = yaw * Math.PI / 180
            bare.root.updateMatrixWorld(true)
            tea.root.updateMatrixWorld(true)
            for (const elevation of [-20, 16, 60]) {
              const angle = elevation * Math.PI / 180
              const direction = new Vector3(0, Math.sin(angle), Math.cos(angle))
              for (const name of ['left-eye', 'right-eye']) {
                const eye = bare.root.getObjectByName(name) as Mesh
                for (const row of [8, 16, 24]) {
                  const point = new Vector3().fromBufferAttribute(eye.geometry.attributes.position!, row * 9 + 4).applyMatrix4(eye.matrixWorld)
                  const ray = new Raycaster(point.clone().addScaledVector(direction, 10), direction.clone().negate())
                  if (ray.intersectObject(bare.root, true)[0]?.object.name !== name) continue
                  expect(ray.intersectObject(tea.root, true)[0]?.object.name, `${name}, turn ${yaw}, elevation ${elevation}`).toBe(name)
                }
              }
            }
          }
        }
        bare.dispose()
        tea.dispose()
      })

      it('keeps the exterior cord and paper outside the real cup walls', () => {
        const cup = createCup(vessel, { accessory: 'tea-bag' })
        cup.root.updateMatrixWorld(true)
        const fit = fitTeaTag(vessel)
        const group = cup.root.getObjectByName('tea-bag')!
        const surfaces = cup.root.children.filter(child => child !== group)
        let checked = 0
        for (const name of ['tea-string', 'tea-tag']) {
          const mesh = group.getObjectByName(name) as Mesh
          const points = mesh.geometry.attributes.position!
          const probes: Vector3[] = []
          for (let i = 0; i < points.count; i++) {
            if (name === 'tea-string') {
              const center = (mesh.geometry as TubeGeometry).parameters.path.getPointAt(Math.floor(i / 9) / 96)
              if (center.y > fit.points[2]![1] - 0.06 || Math.hypot(center.x, center.z) < fit.releaseRadius - 0.003) continue
            }
            probes.push(new Vector3().fromBufferAttribute(points, i))
          }
          if (name === 'tea-tag') {
            for (let row = 0; row <= 20; row++) {
              for (const x of [-TEA_TAG.width / 2, 0, TEA_TAG.width / 2]) {
                probes.push(new Vector3(x, TEA_TAG.height * (row / 20 - 0.5), -TEA_TAG.depth / 2))
              }
            }
          }
          for (const probe of probes) {
            const point = probe.applyMatrix4(mesh.matrixWorld)
            const radial = Math.hypot(point.x, point.z)
            const ray = new Raycaster(new Vector3(0, point.y, 0), new Vector3(point.x, 0, point.z).normalize())
            const hits = ray.intersectObjects(surfaces, true)
            if (!hits.length) continue
            checked++
            expect(radial - Math.max(...hits.map(hit => hit.distance)), `${name} at ${point.toArray()}`).toBeGreaterThan(-1e-5)
          }
        }
        expect(checked).toBeGreaterThan(50)
        cup.dispose()
      })

      it('leaves all original geometry and colors unchanged, lid included', () => {
        const before = JSON.stringify(vessel)
        const bare = createCup(vessel)
        const tea = createCup(vessel, { accessory: 'tea-bag' })
        for (const object of bare.root.children) {
          const found = tea.root.getObjectByName(object.name)!
          expect(found.rotation.toArray()).toEqual(object.rotation.toArray())
          expect(found.position.toArray()).toEqual(object.position.toArray())
          if (object instanceof Mesh) {
            expect((found as Mesh).geometry.attributes.position!.array).toEqual(object.geometry.attributes.position!.array)
          }
        }
        expect(JSON.stringify(vessel)).toBe(before)
        tea.setColors({ body: '#0000ff' })
        expect(((tea.root.getObjectByName('tea-tag') as Mesh).material as MeshBasicMaterial).color.getHexString()).toBe('e2b245')
        bare.dispose()
        tea.dispose()
      })

      it('fits the existing accessory frame through every turn and elevation', () => {
        const cup = createCup(vessel, { accessory: 'tea-bag' })
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
            for (let elevation = -20; elevation <= 60; elevation += 5) {
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

  it.each(['takeaway', 'gaiwan'])('lets the string pass through the %s lid without lifting it', id => {
    const vessel = vessels.find(vessel => vessel.id === id)!
    const bare = createCup(vessel)
    const cup = createCup(vessel, { accessory: 'tea-bag' })
    bare.root.updateMatrixWorld(true)
    cup.root.updateMatrixWorld(true)
    for (const name of ['lid', vessel.lid ? 'lid-top' : 'lid-knob']) {
      expect(new Box3().setFromObject(cup.root.getObjectByName(name)!).min.y)
        .toBeCloseTo(new Box3().setFromObject(bare.root.getObjectByName(name)!).min.y, 8)
    }
    // Le fil reste rond (aucun aplatissement) et traverse le couvercle.
    const string = cup.root.getObjectByName('tea-string') as Mesh<TubeGeometry>
    const path = string.geometry.parameters.path
    const points = string.geometry.attributes.position!
    for (let ring = 0; ring <= 96; ring += 8) {
      const center = path.getPointAt(ring / 96)
      for (let side = 0; side <= 8; side++) {
        expect(Math.hypot(points.getX(ring * 9 + side) - center.x, points.getY(ring * 9 + side) - center.y, points.getZ(ring * 9 + side) - center.z))
          .toBeCloseTo(TEA_TAG.cordRadius, 5)
      }
    }
    bare.dispose()
    cup.dispose()
  })

  it('drops the takeaway string under the plastic overhang, from the retaining rim rather than the outer lid edge', () => {
    const vessel = vessels.find(vessel => vessel.id === 'takeaway')!
    const cup = createCup(vessel, { accessory: 'tea-bag' })
    cup.root.updateMatrixWorld(true)
    const retaining = new Box3().setFromObject(cup.root.getObjectByName('lid-edge')!)
    const cover = new Box3().setFromObject(cup.root.getObjectByName('lid')!)
    const string = cup.root.getObjectByName('tea-string') as Mesh<TubeGeometry>
    const release = fitTeaTag(vessel).points[2]!
    const releaseRadius = Math.hypot(release[0], release[2])
    expect(releaseRadius).toBeCloseTo(retaining.max.x + 0.018, 6)
    expect(releaseRadius + TEA_TAG.cordRadius).toBeLessThan(cover.max.x - 0.03)
    // Le fil traverse le couvercle, puis ressort sous son jupon pour tomber.
    expect(release[1]).toBeGreaterThan(cover.min.y)
    expect(fitTeaTag(vessel).points[3]![1]).toBeLessThan(cover.min.y)
    let falling = 0
    for (let i = 0; i <= 192; i++) {
      const point = string.geometry.parameters.path.getPointAt(i / 192)
      if (point.y >= retaining.max.y - 0.05) continue
      expect(Math.hypot(point.x, point.z)).toBeCloseTo(releaseRadius, 6)
      falling++
    }
    expect(falling).toBeGreaterThan(20)
    cup.dispose()
  })

  it.each(['mug', 'teacup', 'tumbler', 'kulhad', 'takeaway', 'gaiwan', 'podstakannik'])('hangs vertically below the last support on the %s instead of floating outward', id => {
    const cup = createCup(vessels.find(vessel => vessel.id === id)!, { accessory: 'tea-bag' })
    cup.root.updateMatrixWorld(true)
    const paper = cup.root.getObjectByName('tea-tag')!
    const up = new Vector3(0, 1, 0).applyQuaternion(paper.quaternion)
    expect(up.y).toBeCloseTo(1, 8)
    const attachment = paper.localToWorld(new Vector3(0, TEA_TAG.height / 2, 0))
    const string = cup.root.getObjectByName('tea-string') as Mesh<TubeGeometry>
    const fit = fitTeaTag(vessels.find(vessel => vessel.id === id)!)
    const supportTop = fit.points[2]![1]
    let sampled = 0
    for (let i = 0; i <= 192; i++) {
      const point = string.geometry.parameters.path.getPointAt(i / 192)
      // L'amorce intérieure est cachée sous le bord, pas suspendue à l'extérieur.
      if (Math.hypot(point.x, point.z) < fit.releaseRadius - 0.001) continue
      if (point.y <= attachment.y + 0.015 || point.y >= supportTop - 0.15) continue
      expect(point.x).toBeCloseTo(attachment.x, 6)
      expect(point.z).toBeCloseTo(attachment.z, 6)
      sampled++
    }
    expect(sampled).toBeGreaterThan(10)
    const normal = new Vector3(0, 0, 1).applyQuaternion(paper.quaternion)
    expect(normal.x * paper.position.z - normal.z * paper.position.x).toBeCloseTo(0, 8)
    cup.dispose()
  })

  it.each(['rounded-tumbler', 'round-mug'])('rests the paper against the widening %s wall instead of suspending it away from the cup', id => {
    const cup = createCup(vessels.find(vessel => vessel.id === id)!, { accessory: 'tea-bag' })
    cup.root.updateMatrixWorld(true)
    const paper = cup.root.getObjectByName('tea-tag')!
    const up = new Vector3(0, 1, 0).applyQuaternion(paper.quaternion)
    expect(up.y).toBeLessThan(0.9999)
    const group = cup.root.getObjectByName('tea-bag')!
    const surfaces = cup.root.children.filter(child => child !== group)
    let closest = Infinity
    for (let i = 0; i <= 512; i++) {
      const point = paper.localToWorld(new Vector3(0, TEA_TAG.height * (i / 512 - 0.5), -TEA_TAG.depth / 2))
      const ray = new Raycaster(new Vector3(0, point.y, 0), new Vector3(point.x, 0, point.z).normalize())
      const hits = ray.intersectObjects(surfaces, true)
      expect(hits.length).toBeGreaterThan(0)
      const gap = Math.hypot(point.x, point.z) - Math.max(...hits.map(hit => hit.distance))
      expect(gap).toBeGreaterThan(0)
      closest = Math.min(closest, gap)
    }
    expect(closest).toBeLessThan(0.008)
    cup.dispose()
  })

  it('caches fitting by vessel and releases both meshes and materials once', () => {
    for (const vessel of vessels) expect(fitTeaTag(vessel)).toBe(fitTeaTag(vessel))
    const cup = createCup(vessels[0]!, { accessory: 'tea-bag' })
    const group = cup.root.getObjectByName('tea-bag')!
    const spies = group.children.flatMap(child => {
      const mesh = child as Mesh
      return [vi.spyOn(mesh.geometry, 'dispose'), vi.spyOn(mesh.material as MeshBasicMaterial, 'dispose')]
    })
    cup.dispose()
    spies.forEach(spy => expect(spy).toHaveBeenCalledOnce())
  })
})
