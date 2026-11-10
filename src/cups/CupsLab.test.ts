// @vitest-environment happy-dom
import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CupsLab from './CupsLab.vue'
import { vessels } from './catalogue'
import { palette } from './palette'
import { colombianDesigns, gaiwanDesigns, yunomiDesigns } from './designs'
import { createCupGallery } from './renderer'

const gallery = vi.hoisted(() => ({
  setColors: vi.fn(),
  setDesign: vi.fn(),
  setElevation: vi.fn(),
  setTurning: vi.fn(),
  dispose: vi.fn()
}))

vi.mock('./renderer', async importOriginal => ({
  ...await importOriginal<typeof import('./renderer')>(),
  createCupGallery: vi.fn(() => gallery)
}))

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

  async function chooseCulture(value: string) {
    const select = root.querySelector<HTMLSelectElement>('[aria-label="Culture / vessel"]')!
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
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

  it('shows only the yunomi with a raised face, three patterns, and a manual turntable', async () => {
    await mount()
    await chooseStudy('Designs')
    expect(root.querySelectorAll('.cup-viewport')).toHaveLength(1)
    expect(root.querySelectorAll('input[name="cup-design"]')).toHaveLength(3)
    const call = vi.mocked(createCupGallery).mock.calls.at(-1)!
    expect(call[1][0]!.vessel.id).toBe('yunomi')
    expect(call[1][0]!.vessel.face.centerY).toBe(1.12)
    expect(vessels.find(vessel => vessel.id === 'yunomi')!.face.centerY).toBe(1)
    expect(call[2]?.turntable).toBe(true)
    expect(root.querySelector('[role="slider"]')?.getAttribute('tabindex')).toBe('0')
    for (const option of yunomiDesigns) {
      root.querySelector<HTMLInputElement>(`input[value="${option.id}"]`)!.click()
      await nextTick()
    }
    expect(gallery.setDesign).toHaveBeenLastCalledWith(0, yunomiDesigns[2])
    expect(createCupGallery).toHaveBeenCalledTimes(2)
    media.matches = true
    media.dispatchEvent(new Event('change'))
    await nextTick()
    expect(root.querySelector('[role="slider"]')).not.toBeNull()
    expect(root.querySelector('img[src^="/cups/stills/"]')).toBeNull()
    expect(root.textContent).not.toContain('Slow turn')
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

  it('switches cultural vessels on the right without adding a tab, and remembers each pattern', async () => {
    await mount()
    await chooseStudy('Designs')
    const japanese = root.querySelector<HTMLInputElement>('input[value="mizutama"]')!
    japanese.click()
    await nextTick()
    await chooseCulture('china')
    expect(root.querySelectorAll('.study-nav button')).toHaveLength(3)
    expect(root.querySelectorAll('canvas')).toHaveLength(1)
    expect(root.querySelectorAll('.cup-viewport')).toHaveLength(1)
    expect(root.querySelectorAll('input[name="cup-design"]')).toHaveLength(3)
    const call = vi.mocked(createCupGallery).mock.calls.at(-1)!
    expect(call[1][0]!.vessel.id).toBe('gaiwan')
    expect(call[1][0]!.vessel.colors.eyes).toBe('#2f4a8a')
    expect(call[1][0]!.design).toBe(gaiwanDesigns[0])
    expect(call[2]?.turntable).toBe(true)
    expect(root.querySelector('.culture-sources')?.textContent).toContain('Cloud scrolls')
    expect(root.querySelector('.culture-sources')?.textContent).not.toContain('Seigaiha')
    for (const option of gaiwanDesigns) {
      root.querySelector<HTMLInputElement>(`input[value="${option.id}"]`)!.click()
      await nextTick()
      expect(root.querySelector('figcaption')?.textContent).toContain(option.name)
    }
    expect(gallery.setDesign).toHaveBeenLastCalledWith(0, gaiwanDesigns[2])
    expect(createCupGallery).toHaveBeenCalledTimes(3)
    await chooseCulture('japan')
    expect(root.querySelector<HTMLInputElement>('input[value="mizutama"]')!.checked).toBe(true)
    await chooseCulture('china')
    expect(root.querySelector<HTMLInputElement>('input[value="huiwen"]')!.checked).toBe(true)
    expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.design).toBe(gaiwanDesigns[2])
  })

  it('shows the Colombian reference patterns and remembers the selected band', async () => {
    await mount()
    await chooseStudy('Designs')
    await chooseCulture('colombia')
    expect(root.querySelectorAll('.study-nav button')).toHaveLength(3)
    expect(root.querySelectorAll('input[name="cup-design"]')).toHaveLength(3)
    const view = vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!
    expect(view.vessel.id).toBe('colombian-mug')
    expect(view.vessel.colors.inkA).toBe('#f3eadb')
    expect(view.design).toBe(colombianDesigns[0])
    for (const design of colombianDesigns) {
      root.querySelector<HTMLInputElement>(`input[value="${design.id}"]`)!.click()
      await nextTick()
      expect(root.querySelector('figcaption')?.textContent).toContain(design.name)
      expect(root.querySelector('.culture-sources')?.textContent).toContain(design.note)
    }
    expect(gallery.setDesign).toHaveBeenLastCalledWith(0, colombianDesigns[2])
    await chooseCulture('japan')
    await chooseCulture('colombia')
    expect(root.querySelector<HTMLInputElement>('input[value="colombia-diagonals"]')!.checked).toBe(true)
    expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.design).toBe(colombianDesigns[2])
  })

  it('keeps manual rotation available for all cultures with reduced motion', async () => {
    await mount(true)
    await chooseStudy('Designs')
    for (const [culture, vessel] of [['china', 'gaiwan'], ['colombia', 'colombian-mug'], ['japan', 'yunomi']]) {
      await chooseCulture(culture!)
      expect(root.querySelector('[aria-label="Turn the cup"]')).not.toBeNull()
      expect(root.querySelector('.cup-canvas')?.classList.contains('is-hidden')).toBe(false)
      expect(root.textContent).not.toContain('Slow turn')
      expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.vessel.id).toBe(vessel)
    }
  })

  it('uses the matching cultural PNGs when WebGL is unavailable', async () => {
    await mount()
    vi.mocked(createCupGallery).mockImplementationOnce(() => { throw new Error('WebGL unavailable') })
    await chooseStudy('Designs')
    for (const [culture, designs] of [['china', gaiwanDesigns], ['colombia', colombianDesigns]] as const) {
      await chooseCulture(culture)
      for (const design of designs) {
        root.querySelector<HTMLInputElement>(`input[value="${design.id}"]`)!.click()
        await nextTick()
        expect(root.querySelector('.cup-viewport img')?.getAttribute('src')).toBe(`/cups/stills/designs/${design.id}.png`)
      }
    }
    expect(root.querySelector('[aria-label="Turn the cup"]')).toBeNull()
    expect(createCupGallery).toHaveBeenCalledTimes(2)
  })
})
