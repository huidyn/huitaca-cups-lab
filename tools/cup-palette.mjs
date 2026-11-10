// Palette des tasses : distance perçue CIEDE2000 contre les deux fonds de barre latérale de l'app
// (bg-tertiary : neutral-100 en clair, neutral-800 en sombre). Usage : node tools/cup-palette.mjs
const SIDEBARS = { light: '#f5f5f5', dark: '#262626' }
const SEUIL = Number(process.argv[2] ?? 22)
const BASE = {
  oat: '#d9c6a5', blush: '#e9b7b0', honey: '#d6ae4a', lavender: '#b9a6d3',
  dusty: '#8db1c9', sage: '#8fa16b', stone: '#959693', teal: '#3e8e8a',
  terracotta: '#b5533c', deepBlue: '#3f5f7f', cocoa: '#6e4a3a', graphite: '#4f5150'
}
// Gris actuel : l'intérieur, le bord et la bordure sont dérivés par le même écart de clarté
const GREY = { body: '#959693', inside: '#626460', rim: '#a3a49f', border: '#747670' }
const EYES = { light: '#fffef9', dark: '#1c1c1a' }

const lin = v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
const gam = v => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
const rgb = h => [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16)))
const hex = c => '#' + c.map(v => Math.round(255 * gam(v)).toString(16).padStart(2, '0')).join('')
const luminance = h => { const [r, g, b] = rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

function toOklch(h) {
  const [r, g, b] = rgb(h)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617993 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [L, Math.hypot(A, B), Math.atan2(B, A)]
}
function fromOklch([L, C, H]) {
  const A = C * Math.cos(H), B = C * Math.sin(H)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const c = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return c.every(v => v >= -1e-4 && v <= 1 + 1e-4) ? hex(c.map(v => Math.min(1, Math.max(0, v)))) : null
}

function toLab(h) {
  const [r, g, b] = rgb(h)
  const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047)
  const y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b)
  const z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
// CIEDE2000 (Sharma, Wu & Dalal 2005)
function de2000(h1, h2) {
  const [L1, a1, b1] = toLab(h1), [L2, a2, b2] = toLab(h2)
  const rad = Math.PI / 180
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G)
  const C1 = Math.hypot(a1p, b1), C2 = Math.hypot(a2p, b2)
  const hp = (b, a) => (a === 0 && b === 0) ? 0 : (Math.atan2(b, a) / rad + 360) % 360
  const h1p = hp(b1, a1p), h2p = hp(b2, a2p)
  const dL = L2 - L1, dC = C2 - C1
  let dh = 0
  if (C1 * C2 !== 0) dh = Math.abs(h2p - h1p) <= 180 ? h2p - h1p : h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p + 360
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(dh * rad / 2)
  const Lb = (L1 + L2) / 2, Cbp = (C1 + C2) / 2
  let hb = h1p + h2p
  if (C1 * C2 !== 0) hb = Math.abs(h1p - h2p) <= 180 ? hb / 2 : hb < 360 ? (hb + 360) / 2 : (hb - 360) / 2
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad)
  const SL = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2)
  const SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad)
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH))
}

// APCA 0.0.98G (candidat WCAG 3) : |Lc| du texte (yeux) sur le corps, plus fiable que le ratio WCAG 2 sur les tons moyens
function apca(text, bg) {
  const y = h => { const c = [1, 3, 5].map(i => (parseInt(h.slice(i, i + 2), 16) / 255) ** 2.4); const v = 0.2126729 * c[0] + 0.7151522 * c[1] + 0.072175 * c[2]; return v > 0.022 ? v : v + (0.022 - v) ** 1.414 }
  const t = y(text), b = y(bg)
  if (Math.abs(b - t) < 0.0005) return 0
  const s = b > t ? (b ** 0.56 - t ** 0.57) * 1.14 : (b ** 0.65 - t ** 0.62) * 1.14
  return Math.abs(s) < 0.1 ? 0 : (s > 0 ? s - 0.027 : s + 0.027) * 100
}
const separation = h => Math.min(de2000(h, SIDEBARS.light), de2000(h, SIDEBARS.dark))

// La couleur la plus proche de l'originale (en CIEDE2000) qui se détache des deux fonds ;
// la teinte reste fixe, seules la clarté et la saturation bougent (saturation au plus doublée)
function tune(original) {
  if (separation(original) >= SEUIL) return original
  const [L0, C0, H] = toOklch(original)
  let best = null, cost = Infinity
  for (let L = 0.3; L <= 0.92; L += 0.0025) {
    for (let C = C0; C <= Math.max(C0 * 2, C0 + 0.02); C += 0.002) {
      const h = fromOklch([L, C, H])
      if (!h || separation(h) < SEUIL) continue
      const d = de2000(h, original)
      if (d < cost) { cost = d; best = h }
    }
  }
  return best
}

const [gL] = toOklch(GREY.body)
const shade = (body, slot) => {
  const [L, C, H] = toOklch(body)
  for (let k = 1; k >= 0; k -= 0.05) {
    const h = fromOklch([L + toOklch(GREY[slot])[0] - gL, C * k, H])
    if (h) return h
  }
}

const out = {}
for (const [name, original] of Object.entries(BASE)) {
  const body = tune(original)
  const eyes = Math.abs(apca(EYES.light, body)) >= Math.abs(apca(EYES.dark, body)) ? EYES.light : EYES.dark
  out[name] = { body, inside: shade(body, 'inside'), rim: shade(body, 'rim'), border: shade(body, 'border'), eyes }
  console.log(name.padEnd(11), original, '->', body,
    'dE00', de2000(original, body).toFixed(1).padStart(4),
    '| clair', de2000(body, SIDEBARS.light).toFixed(1), 'sombre', de2000(body, SIDEBARS.dark).toFixed(1),
    '| avant', de2000(original, SIDEBARS.light).toFixed(1), de2000(original, SIDEBARS.dark).toFixed(1),
    '| yeux', eyes === EYES.light ? 'blancs' : 'noirs', Math.abs(apca(EYES.light, body)).toFixed(0), Math.abs(apca(EYES.dark, body)).toFixed(0))
}
console.log(JSON.stringify(out))
