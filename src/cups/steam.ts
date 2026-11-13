import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three'

// La vapeur : trois rubans plats qui montent de la tasse quand elle réfléchit.
// Aplat, sans dégradé ni particules, pour rester lisible à 48 px.
export const STEAM = {
  // Les mêmes gris que le texte discret de l'interface, selon le thème.
  colors: { light: '#666666', dark: '#a3a3a3' },
  wisps: [
    { x: -0.24, delay: 0, phase: 0.4, height: 0.82 },
    { x: 0, delay: 0.37, phase: 2.1, height: 1 },
    { x: 0.24, delay: 0.71, phase: 4.2, height: 0.74 }
  ],
  period: 2.6,
  width: 0.08,
  sway: 0.075,
  wavelength: 0.62,
  opacity: 0.9,
  // À petite taille, un ruban ne descend jamais sous cette demi-largeur en pixels,
  // et les rubans s'écartent d'autant, sans dépasser ce facteur.
  minHalfPixels: 1.4,
  maxSpread: 1.7,
  segments: 24
}

// Le ruban à l'instant `time` : sa ligne médiane ondule, il s'étire en montant puis se referme en haut.
// Facteur d'épaisseur pour une tasse dessinée à `pixelsPerUnit` : 1 en grand, plus à 48 px.
export function steamScale(pixelsPerUnit: number) {
  return Math.max(1, STEAM.minHalfPixels / (STEAM.width * pixelsPerUnit))
}

// Demi-largeur du couloir que la vapeur ne quitte jamais, quelle que soit la taille.
export function steamReach(scale = 1) {
  const spread = Math.min(scale, STEAM.maxSpread)
  return (Math.max(...STEAM.wisps.map(wisp => Math.abs(wisp.x))) + STEAM.sway) * spread + STEAM.width * scale
}

export function wispRibbon(index: number, time: number, height: number, out = new Float32Array((STEAM.segments + 1) * 6), scale = 1) {
  const spread = Math.min(scale, STEAM.maxSpread)
  const wisp = STEAM.wisps[index]!
  const p = ((time / STEAM.period + wisp.delay) % 1 + 1) % 1
  const rise = height * wisp.height
  const head = rise * (1 - (1 - p) * (1 - p))
  const tail = rise * p * p
  for (let i = 0; i <= STEAM.segments; i++) {
    const u = i / STEAM.segments
    const y = tail + (head - tail) * u
    const climb = y / rise
    const x = (wisp.x + Math.sin(y / STEAM.wavelength * Math.PI * 2 + wisp.phase - time * 1.3) * STEAM.sway * Math.sqrt(climb)) * spread
    // Pointu aux deux bouts, et plus fin à mesure qu'il se dissipe.
    const half = STEAM.width * scale * Math.pow(Math.sin(Math.PI * u), 0.6) * (1 - 0.45 * p)
    out.set([x - half, y, 0, x + half, y, 0], i * 6)
  }
  return { positions: out, fade: 1 - p * p * p }
}

export function createSteam(height: number, color: string = STEAM.colors.light) {
  const group = new Group()
  group.name = 'steam'
  const wisps = STEAM.wisps.map((_, index) => {
    const geometry = new BufferGeometry()
    const positions = new Float32Array((STEAM.segments + 1) * 6)
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    const indices: number[] = []
    for (let i = 0; i < STEAM.segments; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    geometry.setIndex(indices)
    const material = new MeshBasicMaterial({ color, side: DoubleSide, transparent: true, opacity: 0, toneMapped: false, depthWrite: false, depthTest: false })
    const mesh = new Mesh(geometry, material)
    // La vapeur se dessine en dernier et sans test de profondeur : jamais cachée par un accessoire.
    mesh.renderOrder = 10
    mesh.name = `steam-${index}`
    mesh.frustumCulled = false
    group.add(mesh)
    return { geometry, material, positions }
  })
  group.visible = false

  return {
    group,
    // `strength` de 0 à 1 : la vapeur apparaît et disparaît en fondu, jamais d'un coup.
    setColor(value: string) {
      for (const wisp of wisps) wisp.material.color.set(value)
    },
    update(time: number, strength: number, scale = 1) {
      group.visible = strength > 0.01
      if (!group.visible) return
      wisps.forEach((wisp, index) => {
        const { fade } = wispRibbon(index, time, height, wisp.positions, scale)
        wisp.geometry.attributes.position!.needsUpdate = true
        wisp.material.opacity = STEAM.opacity * fade * strength
      })
    },
    dispose() {
      for (const wisp of wisps) {
        wisp.geometry.dispose()
        wisp.material.dispose()
      }
    }
  }
}
