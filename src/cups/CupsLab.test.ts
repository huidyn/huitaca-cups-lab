// @vitest-environment happy-dom
import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CupsLab from './CupsLab.vue'
import { vessels } from './catalogue'
import { palette } from './palette'
import { createCupGallery } from './renderer'

const gallery = vi.hoisted(() => ({
  setColors: vi.fn(),
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

  async function chooseStudy(name: string) {
    const button = [...root.querySelectorAll<HTMLButtonElement>('.study-nav button')]
      .find(button => button.textContent?.includes(name))!
    button.click()
    await nextTick()
    await vi.waitFor(() => expect(root.querySelector('.cup-stage')?.getAttribute('data-ready')).toBe('true'))
  }

  it('keeps the shape gallery grey and separates the twelve colours into a single-mug study', async () => {
    await mount()
    expect(vessels.every(vessel => vessel.colors.body === '#959693')).toBe(true)
    expect(root.querySelector('.palette-picker')).toBeNull()
    await chooseStudy('Colours')
    expect(gallery.dispose).toHaveBeenCalledOnce()
    expect(root.querySelectorAll('.cup-viewport')).toHaveLength(1)
    expect(root.querySelectorAll('.palette-option input')).toHaveLength(12)
    const view = vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!
    expect(view.vessel.id).toBe('mug')
    expect(view.vessel.colors.body).toBe('#b5533c')
    expect(root.querySelector('.culture-sources')).toBeNull()
    for (const option of palette) {
      root.querySelector<HTMLInputElement>(`input[value="${option.id}"]`)!.click()
      await nextTick()
      expect(gallery.setColors).toHaveBeenLastCalledWith(0, option.colors)
    }
    expect(createCupGallery).toHaveBeenCalledTimes(2)
    await chooseStudy('Shapes')
    expect(root.querySelectorAll('.cup-viewport')).toHaveLength(18)
    expect(root.querySelector('.palette-picker')).toBeNull()
    await chooseStudy('Colours')
    expect(root.querySelector<HTMLInputElement>('input[value="graphite"]')!.checked).toBe(true)
    expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.vessel.colors.body).toBe('#646866')
  })

  it('switches theme without rebuilding the cup or losing the selected colour', async () => {
    await mount()
    await chooseStudy('Colours')
    const modes = root.querySelectorAll<HTMLButtonElement>('.theme-control button')
    modes[1]!.click()
    await nextTick()
    expect(root.querySelector('main')?.getAttribute('data-theme')).toBe('dark')
    expect(modes[1]!.getAttribute('aria-pressed')).toBe('true')
    expect(createCupGallery).toHaveBeenCalledTimes(2)
    await chooseStudy('Shapes')
    expect(root.querySelector('main')?.getAttribute('data-theme')).toBe('dark')
    modes[0]!.click()
    await nextTick()
    expect(root.querySelector('main')?.getAttribute('data-theme')).toBe('light')
    expect(root.querySelector('[aria-label="Background"]')).toBeNull()
  })

  it('lets reduced-motion visitors select all colours using matching static mug previews', async () => {
    await mount(true)
    await chooseStudy('Colours')
    for (const option of palette) {
      root.querySelector<HTMLInputElement>(`input[value="${option.id}"]`)!.click()
      await nextTick()
      expect(root.querySelector('img')?.getAttribute('src')).toBe(`/cups/stills/palette/${option.id}.png`)
    }
    expect(createCupGallery).not.toHaveBeenCalled()
    await chooseStudy('Shapes')
    expect(root.querySelectorAll('.cup-viewport img')).toHaveLength(18)
    media.matches = false
    media.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(createCupGallery).toHaveBeenCalledOnce())
    expect(vi.mocked(createCupGallery).mock.calls[0]![1]).toHaveLength(18)
  })
})
