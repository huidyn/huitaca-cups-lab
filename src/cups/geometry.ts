import {
  BufferGeometry, CanvasTexture, CatmullRomCurve3, ClampToEdgeWrapping, Color, DoubleSide,
  Float32BufferAttribute, Group, LatheGeometry, Mesh, MeshBasicMaterial, RepeatWrapping,
  ShaderMaterial, Texture, TubeGeometry, Vector2, Vector3
} from 'three'
import type { Point2, VesselDefinition } from './types'
import { createLidGeometry } from './lid'
import { type AccessoryId, createPaintbrush, fitBrush, GAIWAN_LID_PARTS } from './accessories'
import { createBeret, fitBeret } from './beret'
import { addEdgeTones } from './edge-tones'
import { createTeaTag, fitTeaTag } from './tea-tag'
import { createScarf, fitScarf } from './scarf'
import { bandLayout } from './pattern'

export function radiusAtY(outline: Point2[], y: number): number {
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1]!
    const b = outline[i]!
    if (b[1] > a[1] && y >= a[1] && y <= b[1]) {
      return a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1])
    }
  }
  throw new Error(`Face outside the vessel outline at y=${y}`)
}

const patternVertex = `
varying vec2 vBand;
void main() {
  vBand = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

// Couleurs en uniformes, masque en données : changer d'encre ne redessine rien.
const patternFragment = `
uniform vec3 body;
uniform vec3 inkA;
uniform vec3 inkB;
uniform sampler2D mask;
uniform float masked;
varying vec2 vBand;
void main() {
  vec4 m = texture2D(mask, vBand) * masked * step(0.0, vBand.y) * step(vBand.y, 1.0);
  gl_FragColor = vec4(body * (1.0 - m.r - m.g) + inkA * m.r + inkB * m.g, 1.0);
  #include <colorspace_fragment>
}`

function createPatternMaterial(colors: Record<string, string>, slot: string) {
  return new ShaderMaterial({
    uniforms: {
      body: { value: new Color(colors[slot]) },
      inkA: { value: new Color(colors.inkA ?? colors[slot]) },
      inkB: { value: new Color(colors.inkB ?? colors[slot]) },
      mask: { value: null as Texture | null },
      masked: { value: 0 }
    },
    vertexShader: patternVertex,
    fragmentShader: patternFragment,
    side: DoubleSide
  })
}

export function createHandleGeometry(handle: NonNullable<VesselDefinition['handle']>) {
  const curve = new CatmullRomCurve3(handle.points.map(p => new Vector3(...p)))
  const geometry = new TubeGeometry(curve, 64, handle.radius, 12, false)
  if (!handle.flare) return geometry

  const { length, scale } = handle.flare
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(scale) || scale < 1) {
    geometry.dispose()
    throw new Error('Invalid handle flare')
  }
  const totalLength = curve.getLength()
  const position = geometry.attributes.position!
  const { tubularSegments, radialSegments } = geometry.parameters
  // On elargit les anneaux existants a la construction, jamais dans la boucle
  // de rendu. La pente s'annule aux deux extremites du raccord.
  for (let ring = 0; ring <= tubularSegments; ring++) {
    const t = ring / tubularSegments
    const center = curve.getPointAt(t)
    const distance = Math.min(t, 1 - t) * totalLength
    const weight = Math.max(0, 1 - distance / length)
    const factor = 1 + (scale - 1) * weight * weight * (3 - 2 * weight)
    for (let i = 0; i <= radialSegments; i++) {
      const vertex = ring * (radialSegments + 1) + i
      position.setXYZ(vertex,
        center.x + (position.getX(vertex) - center.x) * factor,
        center.y + (position.getY(vertex) - center.y) * factor,
        center.z + (position.getZ(vertex) - center.z) * factor
      )
    }
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

export function createCup(definition: VesselDefinition, options: { pattern?: boolean; accessory?: AccessoryId } = {}) {
  const root = new Group()
  const materials = new Map<string, MeshBasicMaterial>()
  const tonedMaterials = new Map<string, MeshBasicMaterial>()
  const material = (slot: string, edgeTones = false) => {
    const cache = edgeTones ? tonedMaterials : materials
    let found = cache.get(slot)
    if (!found) {
      found = new MeshBasicMaterial({
        color: definition.colors[slot], side: DoubleSide, toneMapped: false, vertexColors: edgeTones
      })
      cache.set(slot, found)
    }
    return found
  }

  const band = options.pattern ? definition.pattern : undefined
  let patternMaterial: ShaderMaterial | undefined
  let patternSlot = ''
  for (const part of definition.parts) {
    const geometry = new LatheGeometry(part.outline.map(([r, y]) => new Vector2(r, y)), 96)
    const edgeTones = !!definition.lid && (part.id === 'lid' || part.id === 'lid-edge')
    if (edgeTones) addEdgeTones(geometry)
    if (band && part.id === band.surface) {
      // u fait le tour depuis le visage (u = 0) ; les sommets de la jointure sont doublés
      // en u = 0 et u = 1, donc aucun triangle n'interpole à travers elle.
      const { v } = bandLayout(part.outline, band)
      const uv = geometry.attributes.uv!
      const rows = part.outline.length
      for (let i = 0; i < uv.count; i++) uv.setY(i, v[i % rows]!)
      uv.needsUpdate = true
      patternSlot = part.color
      patternMaterial = createPatternMaterial(definition.colors, part.color)
    }
    const mesh = new Mesh(geometry, band && part.id === band.surface ? patternMaterial! : material(part.color, edgeTones))
    mesh.name = part.id
    root.add(mesh)
  }

  if (definition.lid) {
    const lid = definition.lid
    const geometries = createLidGeometry(lid)
    const group = new Group()
    group.name = 'lid-top'
    for (const [name, geometry] of Object.entries(geometries)) {
      const edgeTones = name !== 'throat'
      if (edgeTones) addEdgeTones(geometry)
      const mesh = new Mesh(geometry, material(name === 'throat' ? lid.insideColor : lid.color, edgeTones))
      mesh.name = `lid-${name}`
      group.add(mesh)
    }
    root.add(group)
  }

  if (definition.handle) {
    const handle = definition.handle
    const mesh = new Mesh(createHandleGeometry(handle), material(handle.color))
    mesh.name = 'handle'
    root.add(mesh)
  }

  const extraMaterials: MeshBasicMaterial[] = []
  if (options.accessory === 'scarf') {
    const handle = root.getObjectByName('handle') as Mesh<TubeGeometry> | undefined
    const scarf = createScarf(fitScarf(definition, handle?.geometry))
    extraMaterials.push(...scarf.materials)
    root.add(scarf.group)
  }
  if (options.accessory === 'tea-bag') {
    const fit = fitTeaTag(definition)
    const tea = createTeaTag(fit)
    extraMaterials.push(...tea.materials)
    root.add(tea.group)
    for (const part of root.children.filter(child => fit.lidParts.includes(child.name))) part.position.y += fit.lidLift
  }
  if (options.accessory === 'beret') {
    const beret = createBeret(fitBeret(definition))
    extraMaterials.push(...beret.materials)
    root.add(beret.group)
  }
  if (options.accessory === 'paintbrush') {
    const fit = fitBrush(definition)
    const brush = createPaintbrush(fit)
    extraMaterials.push(...brush.materials)
    root.add(brush.group)
    if (fit.lid) {
      // Rotation autour du bord d'appui du couvercle, pas autour de l'origine de la tasse.
      const angle = fit.lid.angle * Math.PI / 180
      const [px, py] = fit.lid.pivot
      for (const mesh of root.children.filter(child => GAIWAN_LID_PARTS.includes(child.name))) {
        mesh.rotation.z = angle
        mesh.position.set(px - (px * Math.cos(angle) - py * Math.sin(angle)), py + fit.lid.lift - (px * Math.sin(angle) + py * Math.cos(angle)), 0)
      }
    }
  }

  const face = definition.face
  const outline = definition.parts.find(p => p.id === face.surface)!.outline
  const w = face.eyeWidth / 2
  const h = face.eyeHeight / 2 - w
  // Une grille suit aussi la courbure ENTRE les bords. Un simple polygone
  // triangule traversait la paroi convexe de la tasse a the.
  const columns = 8
  const rows = 32
  const vertices: number[] = []
  const indices: number[] = []
  for (let row = 0; row <= rows; row++) {
    const y = (row / rows - 0.5) * face.eyeHeight
    const capY = Math.max(0, Math.abs(y) - h)
    const halfWidth = Math.sqrt(Math.max(0, w * w - capY * capY))
    for (let col = 0; col <= columns; col++) {
      vertices.push((col / columns * 2 - 1) * halfWidth, y, 0)
      if (row < rows && col < columns) {
        const a = row * (columns + 1) + col
        const b = a + columns + 1
        indices.push(a, a + 1, b, a + 1, b + 1, b)
      }
    }
  }

  const eyes = [-1, 1].map(side => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setIndex(indices)
    const source = Float32Array.from(vertices)
    const mesh = new Mesh(geometry, material(face.color))
    mesh.name = side < 0 ? 'left-eye' : 'right-eye'
    root.add(mesh)
    return { geometry, source, side }
  })

  function look(x: number, y: number) {
    // Le regard reste dans la zone JSON, y compris le bord des capsules.
    const travelX = Math.max(0, (face.width - face.separation - face.eyeWidth) / 2)
    const travelY = Math.max(0, (face.height - face.eyeHeight) / 2)
    const dx = Math.max(-1, Math.min(1, x)) * Math.min(0.11, travelX)
    const dy = Math.max(-1, Math.min(1, y)) * Math.min(0.07, travelY)
    for (const eye of eyes) {
      const position = eye.geometry.attributes.position!
      for (let i = 0; i < position.count; i++) {
        const u = eye.source[i * 3]! + eye.side * face.separation / 2 + dx
        const v = eye.source[i * 3 + 1]! + face.centerY + dy
        const r = radiusAtY(outline, v)
        const angle = u / r
        // Chaque sommet suit la paroi : pas de panneau blanc face a la camera.
        position.setXYZ(i, Math.sin(angle) * (r + 0.006), v, Math.cos(angle) * (r + 0.006))
      }
      position.needsUpdate = true
      eye.geometry.computeBoundingSphere()
    }
  }

  look(0, 0)
  return {
    root,
    look,
    setColors(colors: Record<string, string>) {
      const update = (material: MeshBasicMaterial, slot: string) => {
        if (colors[slot]) material.color.set(colors[slot])
      }
      materials.forEach(update)
      tonedMaterials.forEach(update)
      if (patternMaterial) {
        const u = patternMaterial.uniforms
        if (colors[patternSlot]) u.body!.value.set(colors[patternSlot])
        if (colors.inkA) u.inkA!.value.set(colors.inkA)
        if (colors.inkB) u.inkB!.value.set(colors.inkB)
      }
    },
    setMask(canvas: HTMLCanvasElement | null, anisotropy = 1) {
      if (!patternMaterial) return
      const u = patternMaterial.uniforms
      ;(u.mask!.value as Texture | null)?.dispose()
      u.mask!.value = null
      u.masked!.value = 0
      if (!canvas) return
      const texture = new CanvasTexture(canvas)
      texture.wrapS = RepeatWrapping
      texture.wrapT = ClampToEdgeWrapping
      texture.anisotropy = anisotropy
      u.mask!.value = texture
      u.masked!.value = 1
    },
    dispose() {
      root.traverse(object => {
        if (object instanceof Mesh) object.geometry.dispose()
      })
      materials.forEach(m => m.dispose())
      tonedMaterials.forEach(m => m.dispose())
      extraMaterials.forEach(m => m.dispose())
      ;(patternMaterial?.uniforms.mask!.value as Texture | null)?.dispose()
      patternMaterial?.dispose()
    }
  }
}
