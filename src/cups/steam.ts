import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three'

// La vapeur : trois rubans plats qui montent de la tasse quand elle réfléchit.
// Aplat, sans dégradé ni particules, pour rester lisible à 48 px.
export const STEAM = {
  color: '#949494',
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
  segments: 24
}

// Le ruban à l'instant `time` : sa ligne médiane ondule, il s'étire en montant puis se referme en haut.
export function wispRibbon(index: number, time: number, height: number, out = new Float32Array((STEAM.segments + 1) * 6)) {
  const wisp = STEAM.wisps[index]!
  const p = ((time / STEAM.period + wisp.delay) % 1 + 1) % 1
  const rise = height * wisp.height
  const head = rise * (1 - (1 - p) * (1 - p))
  const tail = rise * p * p
  for (let i = 0; i <= STEAM.segments; i++) {
    const u = i / STEAM.segments
    const y = tail + (head - tail) * u
    const climb = y / rise
    const x = wisp.x + Math.sin(y / STEAM.wavelength * Math.PI * 2 + wisp.phase - time * 1.3) * STEAM.sway * Math.sqrt(climb)
    // Pointu aux deux bouts, et plus fin à mesure qu'il se dissipe.
    const half = STEAM.width * Math.pow(Math.sin(Math.PI * u), 0.6) * (1 - 0.45 * p)
    out.set([x - half, y, 0, x + half, y, 0], i * 6)
  }
  return { positions: out, fade: 1 - p * p * p }
}

export function createSteam(height: number) {
  const group = new Group()
  group.name = 'steam'
  const wisps = STEAM.wisps.map((_, index) => {
    const geometry = new BufferGeometry()
    const positions = new Float32Array((STEAM.segments + 1) * 6)
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    const indices: number[] = []
    for (let i = 0; i < STEAM.segments; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    geometry.setIndex(indices)
    const material = new MeshBasicMaterial({ color: STEAM.color, side: DoubleSide, transparent: true, opacity: 0, toneMapped: false, depthWrite: false })
    const mesh = new Mesh(geometry, material)
    mesh.name = `steam-${index}`
    mesh.frustumCulled = false
    group.add(mesh)
    return { geometry, material, positions }
  })
  group.visible = false

  return {
    group,
    // `strength` de 0 à 1 : la vapeur apparaît et disparaît en fondu, jamais d'un coup.
    update(time: number, strength: number) {
      group.visible = strength > 0.01
      if (!group.visible) return
      wisps.forEach((wisp, index) => {
        const { fade } = wispRibbon(index, time, height, wisp.positions)
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
