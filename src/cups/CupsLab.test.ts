// @vitest-environment happy-dom
import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CupsLab from './CupsLab.vue'
import { vessels } from './catalogue'
import { createCupGallery } from './renderer'

const gallery = vi.hoisted(() => ({
  setElevation: vi.fn(),
  setTurning: vi.fn(),
  dispose: vi.fn()
}))

vi.mock('./renderer', () => ({ createCupGallery: vi.fn(() => gallery) }))

describe('cup lab cultural section', () => {
  let app: ReturnType<typeof createApp>
  let root: HTMLElement
  let media: EventTarget & { matches: boolean }

  beforeEach(() => {
    vi.clearAllMocks()
    media = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('matchMedia', () => media)
    root = document.createElement('div')
    document.body.append(root)
  })

  async function mount(reduced = false) {
    media.matches = reduced
    app = createApp(CupsLab)
    app.mount(root)
    await vi.waitFor(() => expect(root.querySelector('.cup-stage')?.getAttribute('data-ready')).toBe('true'))
  }

  afterEach(() => {
    app?.unmount()
    root.remove()
    vi.unstubAllGlobals()
  })

  it('places one divider after twelve cups and passes all eighteen viewports to the shared renderer', async () => {
    await mount()
    const stage = root.querySelector('.cup-stage')!
    const children = [...stage.children]
    const divider = root.querySelector('.cup-divider')!
    const index = children.indexOf(divider)
    expect(root.querySelectorAll('.cup-divider')).toHaveLength(1)
    expect(children.slice(0, index).filter(child => child.matches('.cup-item'))).toHaveLength(12)
    expect(children.slice(index + 1).filter(child => child.matches('.cup-item'))).toHaveLength(6)
    expect(root.querySelectorAll('canvas')).toHaveLength(1)
    const views = vi.mocked(createCupGallery).mock.calls[0]![1]
    expect(views.map(view => view.vessel.id)).toEqual(vessels.map(vessel => vessel.id))
    expect(views.every(view => view.element.matches('.cup-viewport'))).toBe(true)
    expect(root.querySelectorAll('figcaption')[17]!.textContent).toContain('18')
  })

  it('exposes six cultural notes with the source links stored in the catalogue', async () => {
    await mount()
    const details = root.querySelector('.culture-sources')!
    expect(details.querySelectorAll('dt')).toHaveLength(6)
    const expected = vessels.flatMap(vessel => vessel.heritage?.sources.map(source => source.url) ?? [])
    expect([...details.querySelectorAll('a')].map(link => link.href)).toEqual(expected)
    expect(root.querySelector('[aria-label^="Gaiwan"]')?.getAttribute('aria-label')).toContain('and a lid')
  })

  it('uses all eighteen PNG fallbacks on an initial reduced-motion visit without creating the renderer', async () => {
    await mount(true)
    expect(createCupGallery).not.toHaveBeenCalled()
    expect(root.querySelectorAll('.cup-viewport img')).toHaveLength(18)
    expect(root.querySelector('.cup-canvas')?.classList.contains('is-hidden')).toBe(true)
    expect([...root.querySelectorAll('img')].map(image => image.getAttribute('src')))
      .toEqual(vessels.map(vessel => `/cups/stills/${vessel.id}.png`))
  })

  it('switches every cup to a PNG when reduced motion is enabled at runtime', async () => {
    await mount()
    media.matches = true
    media.dispatchEvent(new Event('change'))
    await nextTick()
    expect(gallery.dispose).toHaveBeenCalledOnce()
    expect(root.querySelectorAll('.cup-viewport img')).toHaveLength(18)
  })
})
