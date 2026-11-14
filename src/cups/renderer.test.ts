// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Camera, type Scene, WebGLRenderer } from 'three'
import { vessels } from './catalogue'
import { AVATAR_FRAME } from './cup2d'
import { editorLook } from './editor'
import { createCupGallery, cupBodyPixel } from './renderer'
import { createPerformer, type PointerState } from './personality'
import { STEAM } from './steam'
import * as accessories from './accessories'
import * as berets from './beret'
import * as teaTags from './tea-tag'
import * as scarves from './scarf'
import * as headphones from './headphones'

const rasterState = { enabled: false }
const canvasBuffers = new WeakMap<HTMLCanvasElement, Uint8Array>()

function linearToSrgbByte(value: number) {
  const c = Math.max(0, Math.min(1, value))
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(s * 255)))
}

vi.mock('three', async importOriginal => {
  const original = await importOriginal<typeof import('three')>()
  return {
    ...original,
    WebGLRenderer: class {
      ratio = 1
      capabilities = { maxTextureSize: 4096, getMaxAnisotropy: () => 8 }
      canvas: HTMLCanvasElement
      viewport: [number, number, number, number] = [0, 0, 0, 0]
      scissor: [number, number, number, number] = [0, 0, 0, 0]
      scissorTest = false
      pixels = new Uint8Array(0)
      depth = new Float32Array(0)
      gl = {
        RGBA: 0x1908,
        UNSIGNED_BYTE: 0x1401,
        PACK_ALIGNMENT: 0x0cf5,
        drawingBufferColorSpace: 'srgb',
        unpackColorSpace: 'srgb',
        pixelStorei: () => {},
        readPixels: (x: number, y: number, w: number, h: number, _format: number, _type: number, out: Uint8Array) => {
          const cw = this.canvas.width
          const ch = this.canvas.height
          for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
              const sx = x + col
              const sy = y + row
              const dst = (row * w + col) * 4
              if (sx >= 0 && sx < cw && sy >= 0 && sy < ch) {
                const src = (sy * cw + sx) * 4
                out[dst] = this.pixels[src]!
                out[dst + 1] = this.pixels[src + 1]!
                out[dst + 2] = this.pixels[src + 2]!
                out[dst + 3] = this.pixels[src + 3]!
              }
            }
          }
        }
      }
      constructor({ canvas }: { canvas?: HTMLCanvasElement } = {}) {
        this.canvas = canvas ?? document.createElement('canvas')
      }
      getContext() { return this.gl }
      setClearColor() {}
      setScissorTest(enable: boolean) { this.scissorTest = enable }
      clear() {
        if (!rasterState.enabled) return
        const cw = this.canvas.width
        const ch = this.canvas.height
        if (this.pixels.length !== cw * ch * 4) {
          this.pixels = new Uint8Array(cw * ch * 4)
          this.depth = new Float32Array(cw * ch)
        }
        const [x0, y0, w, h] = this.scissorTest ? this.scissor : [0, 0, cw, ch]
        const xEnd = Math.min(cw, x0 + w)
        const yEnd = Math.min(ch, y0 + h)
        for (let y = Math.max(0, y0); y < yEnd; y++) {
          for (let x = Math.max(0, x0); x < xEnd; x++) {
            const idx = y * cw + x
            this.depth[idx] = Infinity
            const p = idx * 4
            this.pixels[p] = this.pixels[p + 1] = this.pixels[p + 2] = this.pixels[p + 3] = 0
          }
        }
        canvasBuffers.set(this.canvas, this.pixels)
      }
      setViewport(x: number, y: number, w: number, h: number) {
        this.viewport = [
          Math.floor(x * this.ratio),
          Math.floor(y * this.ratio),
          Math.floor(w * this.ratio),
          Math.floor(h * this.ratio)
        ]
      }
      setScissor(x: number, y: number, w: number, h: number) {
        this.scissor = [
          Math.floor(x * this.ratio),
          Math.floor(y * this.ratio),
          Math.floor(w * this.ratio),
          Math.floor(h * this.ratio)
        ]
      }
      render(scene: Scene, camera: Camera) {
        if (!rasterState.enabled) return
        const cw = this.canvas.width
        const ch = this.canvas.height
        if (!cw || !ch) return
        if (this.pixels.length !== cw * ch * 4) {
          this.pixels = new Uint8Array(cw * ch * 4)
          this.depth = new Float32Array(cw * ch)
          this.depth.fill(Infinity)
        }
        scene.updateMatrixWorld(true)
        camera.updateMatrixWorld(true)
        const [vx, vy, vw, vh] = this.viewport
        const [sx, sy, sw, sh] = this.scissorTest ? this.scissor : [0, 0, cw, ch]
        const v0 = new original.Vector3()
        const v1 = new original.Vector3()
        const v2 = new original.Vector3()
        scene.traverseVisible(object => {
          if (!(object instanceof original.Mesh)) return
          const mat = object.material
          if (!(mat instanceof original.MeshBasicMaterial) || !mat.visible) return
          const pos = object.geometry.attributes.position
          if (!pos) return
          const col = mat.vertexColors ? object.geometry.attributes.color : undefined
          const index = object.geometry.index
          const count = index ? index.count : pos.count
          const alpha = mat.transparent ? Math.round(mat.opacity * 255) : 255
          for (let i = 0; i + 2 < count; i += 3) {
            const ia = index ? index.getX(i) : i
            const ib = index ? index.getX(i + 1) : i + 1
            const ic = index ? index.getX(i + 2) : i + 2
            v0.fromBufferAttribute(pos, ia).applyMatrix4(object.matrixWorld).project(camera)
            v1.fromBufferAttribute(pos, ib).applyMatrix4(object.matrixWorld).project(camera)
            v2.fromBufferAttribute(pos, ic).applyMatrix4(object.matrixWorld).project(camera)
            const x0 = vx + (v0.x * 0.5 + 0.5) * vw
            const y0 = vy + (v0.y * 0.5 + 0.5) * vh
            const x1 = vx + (v1.x * 0.5 + 0.5) * vw
            const y1 = vy + (v1.y * 0.5 + 0.5) * vh
            const x2 = vx + (v2.x * 0.5 + 0.5) * vw
            const y2 = vy + (v2.y * 0.5 + 0.5) * vh
            const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
            if (Math.abs(area) < 1e-5) continue
            if (mat.side === original.FrontSide && area < 0) continue
            const minX = Math.max(0, sx, Math.floor(Math.min(x0, x1, x2)))
            const maxX = Math.min(cw - 1, sx + sw - 1, Math.ceil(Math.max(x0, x1, x2)))
            const minY = Math.max(0, sy, Math.floor(Math.min(y0, y1, y2)))
            const maxY = Math.min(ch - 1, sy + sh - 1, Math.ceil(Math.max(y0, y1, y2)))
            for (let py = minY; py <= maxY; py++) {
              for (let px = minX; px <= maxX; px++) {
                const cx = px + 0.5
                const cy = py + 0.5
                const w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) / area
                const w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) / area
                const w2 = 1 - w0 - w1
                if (w0 < 0 || w1 < 0 || w2 < 0) continue
                const z = w0 * v0.z + w1 * v1.z + w2 * v2.z
                const idx = py * cw + px
                if (z >= this.depth[idx]!) continue
                this.depth[idx] = z
                const shadeR = col ? w0 * col.getX(ia) + w1 * col.getX(ib) + w2 * col.getX(ic) : 1
                const shadeG = col ? w0 * col.getY(ia) + w1 * col.getY(ib) + w2 * col.getY(ic) : 1
                const shadeB = col ? w0 * col.getZ(ia) + w1 * col.getZ(ib) + w2 * col.getZ(ic) : 1
                const p = idx * 4
                this.pixels[p] = linearToSrgbByte(mat.color.r * shadeR)
                this.pixels[p + 1] = linearToSrgbByte(mat.color.g * shadeG)
                this.pixels[p + 2] = linearToSrgbByte(mat.color.b * shadeB)
                this.pixels[p + 3] = alpha
              }
            }
          }
        })
        canvasBuffers.set(this.canvas, this.pixels)
      }
      dispose() {}
      getPixelRatio() { return this.ratio }
      setPixelRatio(value: number) { this.ratio = value }
      setSize(width: number, height: number) {
        this.canvas.width = Math.floor(width * this.ratio)
        this.canvas.height = Math.floor(height * this.ratio)
        this.setViewport(0, 0, width, height)
      }
    }
  }
})

describe('on-demand cup renderer', () => {
  let queue: Map<number, FrameRequestCallback>
  let nextId: number
  let time: number
  let canvas: HTMLCanvasElement
  let gallery: ReturnType<typeof createCupGallery>
  let media: EventTarget & { matches: boolean }
  let hidden: boolean

  function step() {
    time += 16
    const callbacks = [...queue.values()]
    queue.clear()
    callbacks.forEach(callback => callback(time))
  }

  beforeEach(() => {
    queue = new Map()
    nextId = 0
    time = 0
    hidden = false
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      queue.set(++nextId, callback)
      return nextId
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id))
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    media = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('matchMedia', () => media)
    vi.stubGlobal('devicePixelRatio', 3)
    canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 300, 300))
    gallery = createCupGallery(canvas, [{ element: canvas, vessel: vessels[0]! }])
  })

  afterEach(() => {
    gallery.dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('in resting mode, draws nothing until a cup is woken, then only that cup, then hands it back', () => {
    gallery.dispose()
    const rows = [0, 1, 2].map(i => {
      const element = document.createElement('div')
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, i * 40, 32, 32))
      return { element, vessel: vessels[i]! }
    })
    const onShown = vi.fn()
    gallery = createCupGallery(canvas, rows, { resting: { x: 0.6, y: 0 }, onShown })
    step()
    expect(canvas.dataset.frames).toBeUndefined()
    // Le curseur bouge partout : personne n'est réveillé, donc rien à faire.
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 10, clientY: 50, pointerType: 'mouse' }))
    expect(queue.size).toBe(0)
    gallery.wake(1)
    step()
    expect(canvas.dataset.frames).toBe('1')
    expect(onShown).toHaveBeenLastCalledWith([1])
    for (let i = 0; i < 100; i++) step()
    gallery.rest(1)
    for (let i = 0; i < 200 && queue.size; i++) step()
    expect(queue.size).toBe(0)
    expect(onShown).toHaveBeenLastCalledWith([])
    const frames = canvas.dataset.frames
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 0, pointerType: 'mouse' }))
    gallery.refresh()
    step()
    expect(canvas.dataset.frames).toBe(frames)
  })

  it('in resting mode, aims relative to the cup face at sidebar scale', () => {
    gallery.dispose()
    const render = vi.spyOn(WebGLRenderer.prototype, 'render')
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 100, 32, 32))
    gallery = createCupGallery(canvas, [{ element, vessel: vessels.find(vessel => vessel.id === 'teacup')! }], {
      resting: { x: 0.6, y: 0 }, frame: { lift: 1.5, halfHeight: 1.62 }
    })
    const settle = (x: number, y: number) => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType: 'mouse' }))
      gallery.wake(0)
      for (let i = 0; i < 120; i++) step()
      return render.mock.calls.at(-1)![0].children[0]!.rotation
    }
    // À gauche de la tasse dans sa rangée : elle tourne franchement à gauche.
    const left = settle(8, 123).y
    expect(left).toBeLessThan(-0.18)
    // En face de ses yeux (plus bas que le milieu de la boîte, réservée aux chapeaux) : droite et à plat.
    const face = settle(24.2, 122.8)
    expect(Math.abs(face.y)).toBeLessThan(0.02)
    expect(Math.abs(face.x)).toBeLessThan(0.02)
    // Au-dessus et au-dessous de ses yeux dans la même rangée : elle lève et baisse la tête.
    expect(settle(24.2, 106).x).toBeLessThan(-0.1)
    expect(settle(24.2, 138).x).toBeGreaterThan(0.07)
    // À droite sur le nom de l'agent : elle regarde plus à droite qu'au repos.
    expect(settle(42, 123).y).toBeGreaterThan(0.6 * 0.22)
    expect(settle(120, 123).y).toBeGreaterThan(0.2)
  })

  it('does not wake a cup with reduced motion', () => {
    gallery.dispose()
    media.matches = true
    const onShown = vi.fn()
    gallery = createCupGallery(canvas, [{ element: canvas, vessel: vessels[0]! }], { resting: { x: 0.6, y: 0 }, onShown })
    gallery.wake(0)
    step()
    expect(onShown).not.toHaveBeenCalled()
    expect(canvas.dataset.frames).toBeUndefined()
  })

  it('draws once at rest, caps density at 2x, and leaves no idle callback', () => {
    step()
    expect(canvas.width).toBe(600)
    expect(canvas.dataset.frames).toBe('1')
    expect(queue.size).toBe(0)
  })

  it('redraws once when colours change and then returns to rest', () => {
    step()
    gallery.setColors(0, { body: '#d3b787', eyes: '#1c1c1a' })
    expect(queue.size).toBe(1)
    step()
    expect(canvas.dataset.frames).toBe('2')
    expect(queue.size).toBe(0)
  })

  it('settles after mouse following, and identical pointer targets do not wake it', () => {
    step()
    const event = () => new PointerEvent('pointermove', { clientX: 600, clientY: 90, pointerType: 'mouse' })
    window.dispatchEvent(event())
    for (let i = 0; i < 100; i++) step()
    expect(Number(canvas.dataset.frames)).toBeGreaterThan(1)
    expect(queue.size).toBe(0)
    window.dispatchEvent(event())
    expect(queue.size).toBe(0)
  })

  it('cancels continuous turning while hidden and resumes on return', () => {
    gallery.setTurning(true)
    step()
    expect(queue.size).toBe(1)
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    expect(queue.size).toBe(0)
    const frames = canvas.dataset.frames
    step()
    expect(canvas.dataset.frames).toBe(frames)
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(queue.size).toBe(1)
    step()
    expect(queue.size).toBe(1)
  })

  it('stops motion when the preference changes at runtime', () => {
    gallery.setTurning(true)
    step()
    media.matches = true
    media.dispatchEvent(new Event('change'))
    step()
    expect(queue.size).toBe(0)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 600 }))
    expect(queue.size).toBe(0)
  })

  it('cancels scheduled work on disposal', () => {
    gallery.setTurning(true)
    step()
    gallery.dispose()
    expect(queue.size).toBe(0)
  })

  it('turns through a full revolution by keyboard without mouse-follow or idle work', () => {
    gallery.dispose()
    const onTurn = vi.fn()
    gallery = createCupGallery(canvas, [{ element: canvas, vessel: vessels[0]! }], { turntable: true, onTurn })
    step()
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 600, pointerType: 'mouse' }))
    expect(queue.size).toBe(0)
    for (let i = 0; i < 24; i++) {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
      step()
    }
    expect(onTurn.mock.calls.map(call => call[0])).toContain(180)
    expect(onTurn).toHaveBeenLastCalledWith(0)
    expect(queue.size).toBe(0)
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(onTurn).toHaveBeenLastCalledWith(345)
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }))
    expect(onTurn).toHaveBeenLastCalledWith(0)
  })

  it('allows manual dragging with reduced motion and ends dragging on lost capture', () => {
    gallery.dispose()
    media.matches = true
    const onTurn = vi.fn()
    gallery = createCupGallery(canvas, [{ element: canvas, vessel: vessels[0]! }], { turntable: true, onTurn })
    step()
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 1, clientX: 10 }))
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 110 }))
    expect(onTurn).toHaveBeenLastCalledWith(69)
    canvas.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }))
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 210 }))
    expect(onTurn).toHaveBeenCalledOnce()
    gallery.setTurning(true)
    step()
    expect(queue.size).toBe(0)
  })

  it('restores the inspection rotation on the first frame and continues keyboard turning from that angle', () => {
    gallery.dispose()
    media.matches = true
    const render = vi.spyOn(WebGLRenderer.prototype, 'render')
    const onTurn = vi.fn()
    gallery = createCupGallery(canvas, [{ element: canvas, vessel: vessels[17]! }], { turntable: true, initialTurn: 120, onTurn })
    step()
    expect(render.mock.calls.at(-1)![0].children[0]!.rotation.y).toBeCloseTo(2 * Math.PI / 3)
    expect(queue.size).toBe(0)
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    step()
    expect(onTurn).toHaveBeenLastCalledWith(135)
    expect(render.mock.calls.at(-1)![0].children[0]!.rotation.y).toBeCloseTo(3 * Math.PI / 4)
    expect(queue.size).toBe(0)
  })

  it.each(['paintbrush', 'beret', 'tea-bag', 'scarf', 'headphones'] as const)('fits the %s only at construction, never while turning or changing elevation', accessory => {
    gallery.dispose()
    const fit = accessory === 'paintbrush' ? vi.spyOn(accessories, 'fitBrush')
      : accessory === 'beret' ? vi.spyOn(berets, 'fitBeret')
        : accessory === 'tea-bag' ? vi.spyOn(teaTags, 'fitTeaTag')
          : accessory === 'scarf' ? vi.spyOn(scarves, 'fitScarf') : vi.spyOn(headphones, 'fitHeadphones')
    const render = vi.spyOn(WebGLRenderer.prototype, 'render')
    const vessel = vessels.find(vessel => vessel.id === 'gaiwan')!
    const original = JSON.stringify(vessel)
    gallery = createCupGallery(canvas, [{ element: canvas, vessel, accessory }], {
      turntable: true, frame: { lift: 1.4, halfHeight: 2.05 }
    })
    step()
    expect(fit).toHaveBeenCalledTimes(1)
    const root = render.mock.calls.at(-1)![0].children[0]!
    const model = root.getObjectByName(accessory)!
    const lid = root.getObjectByName('lid')!
    const objects = [model, ...model.children, lid]
    const pose = () => objects.map(object => [object.position.toArray(), object.rotation.toArray(), object.scale.toArray()])
    const originalPose = pose()
    for (let i = 0; i < 24; i++) {
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
      gallery.setElevation(-20 + i * 80 / 23)
      step()
      expect(pose()).toEqual(originalPose)
    }
    expect(fit).toHaveBeenCalledTimes(1)
    expect(pose()).toEqual(originalPose)
    expect(JSON.stringify(vessel)).toBe(original)
    expect(queue.size).toBe(0)
  })

  describe('a performing cup', () => {
    it('plays every frame, hands the performer the cursor, and never rests', () => {
      gallery.dispose()
      const performer = createPerformer(1)
      performer.setThinking(true)
      const perform = vi.fn((dt: number, pointer: PointerState, still: boolean) => performer.step(dt, pointer, still))
      gallery = createCupGallery(canvas, [{ element: canvas, vessel: vessels[0]! }], { perform })
      step()
      expect(perform).toHaveBeenCalledTimes(1)
      expect(perform.mock.calls[0]![1]).toEqual({ x: 0, y: 0, active: false })
      expect(perform.mock.calls[0]![2]).toBe(false)
      expect(queue.size).toBe(1)
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 600, clientY: 0, pointerType: 'mouse' }))
      for (let i = 0; i < 30; i++) step()
      expect(perform).toHaveBeenCalledTimes(31)
      expect(perform.mock.calls.at(-1)![0]).toBeCloseTo(0.016, 6)
      expect(perform.mock.calls.at(-1)![1]).toEqual({ x: 1, y: 0.5, active: true })
      expect(perform.mock.results.at(-1)!.value.steam).toBeGreaterThan(0.5)
      expect(queue.size).toBe(1)
      // Le curseur sorti de la page n'est plus « à côté ».
      document.documentElement.dispatchEvent(new Event('pointerleave'))
      step()
      expect(perform.mock.calls.at(-1)![1]).toEqual({ x: 0, y: 0, active: false })
    })

    it('holds the pose and stops the loop when motion is reduced, until told to refresh', () => {
      gallery.dispose()
      media.matches = true
      const performer = createPerformer(1)
      const perform = vi.fn((dt: number, pointer: PointerState, still: boolean) => performer.step(dt, pointer, still))
      gallery = createCupGallery(canvas, [{ element: canvas, vessel: vessels[0]! }], { perform })
      step()
      expect(perform).toHaveBeenLastCalledWith(0, { x: 0, y: 0, active: false }, true)
      expect(queue.size).toBe(0)
      performer.express('happy')
      gallery.refresh()
      expect(queue.size).toBe(1)
      step()
      expect(perform).toHaveBeenCalledTimes(2)
      expect(perform.mock.results.at(-1)!.value.expression).toBe('happy')
      expect(queue.size).toBe(0)
    })
  })

  describe('sidebar live render and resting snapshot colour parity', () => {
    const buffers2d = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>()

    function ensureBuffer(target: HTMLCanvasElement) {
      const len = Math.max(1, target.width) * Math.max(1, target.height) * 4
      let buf = buffers2d.get(target)
      if (!buf || buf.length !== len) {
        buf = new Uint8ClampedArray(len)
        buffers2d.set(target, buf)
      }
      return buf
    }

    beforeEach(() => {
      rasterState.enabled = true
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement, contextId: string) {
        if (contextId !== '2d') return null
        return {
          clearRect: (x: number, y: number, w: number, h: number) => {
            const buf = ensureBuffer(this)
            const cw = this.width
            const ch = this.height
            for (let py = Math.max(0, y); py < Math.min(ch, y + h); py++) {
              for (let px = Math.max(0, x); px < Math.min(cw, x + w); px++) {
                const idx = (py * cw + px) * 4
                buf[idx] = buf[idx + 1] = buf[idx + 2] = buf[idx + 3] = 0
              }
            }
          },
          putImageData: (image: ImageData, dx: number, dy: number) => {
            const buf = ensureBuffer(this)
            const cw = this.width
            const ch = this.height
            for (let py = 0; py < image.height; py++) {
              const ty = dy + py
              if (ty < 0 || ty >= ch) continue
              for (let px = 0; px < image.width; px++) {
                const tx = dx + px
                if (tx < 0 || tx >= cw) continue
                const src = (py * image.width + px) * 4
                const dst = (ty * cw + tx) * 4
                buf[dst] = image.data[src]!
                buf[dst + 1] = image.data[src + 1]!
                buf[dst + 2] = image.data[src + 2]!
                buf[dst + 3] = image.data[src + 3]!
              }
            }
          },
          getImageData: (sx: number, sy: number, sw: number, sh: number) => {
            const buf = ensureBuffer(this)
            const cw = this.width
            const ch = this.height
            const out = new Uint8ClampedArray(sw * sh * 4)
            for (let py = 0; py < sh; py++) {
              const ty = sy + py
              if (ty < 0 || ty >= ch) continue
              for (let px = 0; px < sw; px++) {
                const tx = sx + px
                if (tx < 0 || tx >= cw) continue
                const src = (ty * cw + tx) * 4
                const dst = (py * sw + px) * 4
                out[dst] = buf[src]!
                out[dst + 1] = buf[src + 1]!
                out[dst + 2] = buf[src + 2]!
                out[dst + 3] = buf[src + 3]!
              }
            }
            return { data: out, width: sw, height: sh } as ImageData
          },
          drawImage: (source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) => {
            const dstBuf = ensureBuffer(this)
            const srcCanvas = source as HTMLCanvasElement
            const glBuf = canvasBuffers.get(srcCanvas)
            const src2d = buffers2d.get(srcCanvas)
            const cw = this.width
            const ch = this.height
            const scw = srcCanvas.width
            const sch = srcCanvas.height
            for (let py = 0; py < dh; py++) {
              const ty = dy + py
              const srcY = sy + Math.floor(py * sh / dh)
              if (ty < 0 || ty >= ch || srcY < 0 || srcY >= sch) continue
              for (let px = 0; px < dw; px++) {
                const tx = dx + px
                const srcX = sx + Math.floor(px * sw / dw)
                if (tx < 0 || tx >= cw || srcX < 0 || srcX >= scw) continue
                const dst = (ty * cw + tx) * 4
                if (glBuf) {
                  // Le tampon WebGL a l'axe Y vers le haut.
                  const glRow = sch - 1 - srcY
                  const src = (glRow * scw + srcX) * 4
                  dstBuf[dst] = glBuf[src]!
                  dstBuf[dst + 1] = glBuf[src + 1]!
                  dstBuf[dst + 2] = glBuf[src + 2]!
                  dstBuf[dst + 3] = glBuf[src + 3]!
                } else if (src2d) {
                  const src = (srcY * scw + srcX) * 4
                  dstBuf[dst] = src2d[src]!
                  dstBuf[dst + 1] = src2d[src + 1]!
                  dstBuf[dst + 2] = src2d[src + 2]!
                  dstBuf[dst + 3] = src2d[src + 3]!
                }
              }
            }
          }
        } as unknown as CanvasRenderingContext2D
      })
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
        const buf = buffers2d.get(this) ?? canvasBuffers.get(this) ?? new Uint8Array(0)
        return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`
      })
    })

    afterEach(() => {
      rasterState.enabled = false
    })

    function compositeOver(fg: [number, number, number, number], bg: [number, number, number]): [number, number, number] {
      const a = fg[3] / 255
      return [
        Math.round(fg[0] * a + bg[0] * (1 - a)),
        Math.round(fg[1] * a + bg[1] * (1 - a)),
        Math.round(fg[2] * a + bg[2] * (1 - a))
      ]
    }

    it('outputs fully opaque pixels at the cup body centre (alpha === 255, R/G/B <= A) and does not shift on a magenta background', async () => {
      gallery.dispose()
      vi.stubGlobal('devicePixelRatio', 2)
      const goblet = editorLook({ cupId: 'goblet', colourId: 'deepBlue', designId: '', accessory: 'beret' }).vessel
      const element = document.createElement('div')
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(16, 48, 32, 32))
      gallery = createCupGallery(canvas, [{ element, vessel: goblet, accessory: 'beret' }], {
        resting: { x: 0.6, y: 0 },
        frame: AVATAR_FRAME
      })
      const [url] = await gallery.snapshot([0], 32)
      const snapBytes = new Uint8Array(Buffer.from(url!.split(',')[1]!, 'base64'))
      const pt = cupBodyPixel(goblet, AVATAR_FRAME, 64)
      const idx = (pt.y * 64 + pt.x) * 4
      const snapshot: [number, number, number, number] = [snapBytes[idx]!, snapBytes[idx + 1]!, snapBytes[idx + 2]!, snapBytes[idx + 3]!]
      gallery.wake(0)
      step()
      const liveData = canvas.getContext('2d')!.getImageData(32 + pt.x, 96 + pt.y, 1, 1).data
      const live: [number, number, number, number] = [liveData[0]!, liveData[1]!, liveData[2]!, liveData[3]!]
      const [r, g, b, a] = live
      // Panse totalement opaque : alpha = 255 et aucune composante ne dépasse alpha.
      expect(a).toBe(255)
      expect(r).toBeLessThanOrEqual(a)
      expect(g).toBeLessThanOrEqual(a)
      expect(b).toBeLessThanOrEqual(a)
      // Correspond au bleu profond (#3f5f7f = 63, 95, 127) de la palette.
      expect([r, g, b, a]).toEqual([63, 95, 127, 255])
      // Sur fond magenta (#ff00ff) comme sur fond sombre (#262626), la couleur composée ne bouge pas.
      const onDark = compositeOver(live, [38, 38, 38])
      const onMagenta = compositeOver(live, [255, 0, 255])
      const snapOnMagenta = compositeOver(snapshot, [255, 0, 255])
      expect(onMagenta).toEqual(onDark)
      expect(onMagenta).toEqual(snapOnMagenta)
    })

    it.each([
      { theme: 'light' as const, bg: [250, 250, 248] as [number, number, number] },
      { theme: 'dark' as const, bg: [38, 38, 38] as [number, number, number] }
    ])('matches snapshot and live render within 1 colour unit in $theme theme at 100%, 125% and 150% display scaling', async ({ theme, bg }) => {
      const goblet = editorLook({ cupId: 'goblet', colourId: 'deepBlue', designId: '', accessory: 'beret' }).vessel
      for (const scale of [1, 1.25, 1.5]) {
        gallery.dispose()
        vi.stubGlobal('devicePixelRatio', scale)
        const element = document.createElement('div')
        // Coordonnées fractionnaires réalistes pour éprouver l'arrondi à 100 %, 125 % et 150 %.
        vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(14.4, 52.6, 32, 32))
        gallery = createCupGallery(canvas, [{ element, vessel: goblet, accessory: 'beret' }], {
          resting: { x: 0.6, y: 0 },
          frame: AVATAR_FRAME,
          steamColor: STEAM.colors[theme]
        })
        const pixels = Math.round(32 * scale)
        const [url] = await gallery.snapshot([0], 32)
        expect(url).toMatch(/^data:image\/png;base64,/)
        const pngBytes = new Uint8Array(Buffer.from(url!.split(',')[1]!, 'base64'))
        const pt = cupBodyPixel(goblet, AVATAR_FRAME, pixels)
        const idx = (pt.y * pixels + pt.x) * 4
        const decoded: [number, number, number, number] = [
          pngBytes[idx]!,
          pngBytes[idx + 1]!,
          pngBytes[idx + 2]!,
          pngBytes[idx + 3]!
        ]
        gallery.wake(0)
        step()
        const left = Math.round(14.4 * scale)
        const top = Math.round(52.6 * scale)
        const liveData = canvas.getContext('2d')!.getImageData(left + pt.x, top + pt.y, 1, 1).data
        const live: [number, number, number, number] = [liveData[0]!, liveData[1]!, liveData[2]!, liveData[3]!]
        expect(live[3]).toBe(255)
        expect(decoded[3]).toBe(255)
        const liveComp = compositeOver(live, bg)
        const snapComp = compositeOver(decoded, bg)
        expect(Math.abs(liveComp[0] - snapComp[0])).toBeLessThanOrEqual(1)
        expect(Math.abs(liveComp[1] - snapComp[1])).toBeLessThanOrEqual(1)
        expect(Math.abs(liveComp[2] - snapComp[2])).toBeLessThanOrEqual(1)
      }
    })
  })
})
