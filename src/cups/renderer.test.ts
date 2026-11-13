// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebGLRenderer } from 'three'
import { vessels } from './catalogue'
import { createCupGallery } from './renderer'
import { createPerformer, type PointerState } from './personality'
import * as accessories from './accessories'
import * as berets from './beret'
import * as teaTags from './tea-tag'
import * as scarves from './scarf'
import * as headphones from './headphones'

vi.mock('three', async importOriginal => {
  const original = await importOriginal<typeof import('three')>()
  return {
    ...original,
    WebGLRenderer: class {
      ratio = 1
      capabilities = { maxTextureSize: 4096, getMaxAnisotropy: () => 8 }
      canvas: HTMLCanvasElement
      constructor({ canvas }: { canvas: HTMLCanvasElement }) { this.canvas = canvas }
      setClearColor() {}
      setScissorTest() {}
      clear() {}
      setViewport() {}
      setScissor() {}
      render() {}
      dispose() {}
      getPixelRatio() { return this.ratio }
      setPixelRatio(value: number) { this.ratio = value }
      setSize(width: number, height: number) {
        this.canvas.width = Math.floor(width * this.ratio)
        this.canvas.height = Math.floor(height * this.ratio)
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
})
