import { BufferGeometry, Float32BufferAttribute } from 'three'

// Teintes fixes dans le repère de l'objet : dessus inchangé, bords légèrement
// assombris. Ni lumière, ni ombre, ni calcul dépendant de la caméra.
export function addEdgeTones(geometry: BufferGeometry) {
  const normals = geometry.attributes.normal!
  const colors = new Float32Array(normals.count * 3)
  for (let i = 0; i < normals.count; i++) {
    const tone = 0.82 + 0.18 * Math.min(1, Math.abs(normals.getY(i)))
    colors.fill(tone, i * 3, i * 3 + 3)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
}
