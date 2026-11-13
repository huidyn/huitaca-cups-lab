// @vitest-environment happy-dom
import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CupsLab from './CupsLab.vue'
import { vessels } from './catalogue'
import { palette } from './palette'
import { cayDesigns, colombianDesigns, gaiwanDesigns, kulhadColors, kulhadDesigns, podstakannikColors, podstakannikDesigns, yunomiDesigns } from './designs'
import { createCupGallery } from './renderer'
import { EXPRESSIONS } from './expressions'
import { PERSONALITIES } from './personality'

const gallery = vi.hoisted(() => ({
  setColors: vi.fn(),
  setDesign: vi.fn(),
  setElevation: vi.fn(),
  setTurning: vi.fn(),
  refresh: vi.fn(),
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

  async function chooseCup(value: string) {
    const select = root.querySelector<HTMLSelectElement>('[aria-label="Cup"]')!
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    await vi.waitFor(() => expect(root.querySelector('.cup-stage')?.getAttribute('data-ready')).toBe('true'))
  }

  it('keeps the shape gallery grey and separates the twelve colours into a single-cup study', async () => {
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

  it('offers only the twelve non-cultural cups in Colours and keeps the palette and each study’s cup selection', async () => {
    await mount()
    await chooseStudy('Colours')
    const everyday = vessels.filter(vessel => !vessel.heritage)
    const picker = root.querySelector<HTMLSelectElement>('[aria-label="Cup"]')!
    expect([...picker.options].map(option => option.value)).toEqual(everyday.map(vessel => vessel.id))
    expect(picker.options).toHaveLength(12)
    expect(picker.querySelector('optgroup[label="Cultural forms"]')).toBeNull()
    root.querySelector<HTMLInputElement>('input[value="graphite"]')!.click()
    await nextTick()
    await chooseCup(everyday.at(-1)!.id)
    for (const vessel of everyday) {
      await chooseCup(vessel.id)
      const view = vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!
      expect(view.vessel.id).toBe(vessel.id)
      expect(view.vessel.colors).toMatchObject(palette.at(-1)!.colors)
      expect(view.vessel.parts.map(part => part.outline)).toEqual(vessel.parts.map(part => part.outline))
      if (vessel.id === 'takeaway') {
        expect(view.vessel.colors.lid).toBe('#c4c6c0')
        expect(view.vessel.parts.find(part => part.id === 'lid')!.color).toBe('lid')
        expect(view.vessel.parts.find(part => part.id === 'lid-edge')!.color).toBe('lidEdge')
        expect(view.vessel.lid!.insideColor).toBe('lidInside')
        expect(root.querySelector('.palette-note')?.textContent).toContain('The lid stays light grey.')
      }
      expect(view.design).toBeUndefined()
      expect(root.querySelector('figcaption')?.textContent).toContain(`${vessel.name} · Graphite`)
      expect(root.querySelector<HTMLInputElement>('input[value="graphite"]')!.checked).toBe(true)
      expect(root.querySelectorAll('canvas, .cup-viewport')).toHaveLength(2)
    }
    const calls = vi.mocked(createCupGallery).mock.calls.length
    root.querySelector<HTMLInputElement>('input[value="oat"]')!.click()
    await nextTick()
    expect(createCupGallery).toHaveBeenCalledTimes(calls)
    expect(gallery.setColors).toHaveBeenLastCalledWith(0, palette[0]!.colors)
    expect(root.querySelector('.cup-viewport')?.getAttribute('aria-label')).toContain('Oat with dark eyes')
    await chooseStudy('Accessories')
    expect(root.querySelector<HTMLSelectElement>('[aria-label="Cup"]')!.value).toBe('mug')
    await chooseCup(vessels[17]!.id)
    await chooseStudy('Colours')
    expect(root.querySelector<HTMLSelectElement>('[aria-label="Cup"]')!.value).toBe(everyday.at(-1)!.id)
    expect(root.querySelector<HTMLInputElement>('input[value="oat"]')!.checked).toBe(true)
    media.matches = true
    media.dispatchEvent(new Event('change'))
    await nextTick()
    expect(root.querySelector('.cup-viewport img')?.getAttribute('src')).toBe(`/cups/stills/palette/${everyday.at(-1)!.id}/oat.png`)
    const beforeResume = vi.mocked(createCupGallery).mock.calls.length
    media.matches = false
    media.dispatchEvent(new Event('change'))
    await vi.waitFor(() => expect(createCupGallery).toHaveBeenCalledTimes(beforeResume + 1))
    expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.vessel.id).toBe(everyday.at(-1)!.id)
    expect(vessels.every(vessel => vessel.colors.body === '#959693')).toBe(true)
  })

  it.each(['reduced motion', 'unavailable WebGL'])('matches all 144 non-cultural cup/colour stills with %s', async mode => {
    await mount(mode === 'reduced motion')
    if (mode === 'unavailable WebGL') {
      vi.mocked(createCupGallery).mockImplementationOnce(() => { throw new Error('WebGL unavailable') })
    }
    await chooseStudy('Colours')
    for (const vessel of vessels.filter(vessel => !vessel.heritage)) {
      await chooseCup(vessel.id)
      for (const option of palette) {
        root.querySelector<HTMLInputElement>(`input[value="${option.id}"]`)!.click()
        await nextTick()
        const folder = vessel.id === 'mug' ? '' : `${vessel.id}/`
        expect(root.querySelector('.cup-viewport img')?.getAttribute('src')).toBe(`/cups/stills/palette/${folder}${option.id}.png`)
        expect(root.querySelector('figcaption')?.textContent).toContain(`${vessel.name} · ${option.name}`)
        expect(root.querySelector('.cup-viewport')?.getAttribute('aria-label')).toContain(`${vessel.name}, ${option.name}`)
      }
    }
    expect(createCupGallery).toHaveBeenCalledTimes(mode === 'reduced motion' ? 0 : 2)
    expect(root.querySelector('.cup-canvas')?.classList.contains('is-hidden')).toBe(true)
    expect(root.querySelector('[aria-label="View angle"]')).toBeNull()
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
    expect(root.querySelectorAll('.study-nav button')).toHaveLength(7)
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
    expect(root.querySelectorAll('.study-nav button')).toHaveLength(7)
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

  it('adds the three çay designs, keeps the gold rim, and remembers Çintamani', async () => {
    await mount()
    await chooseStudy('Designs')
    await chooseCulture('turkiye')
    expect(root.querySelectorAll('.study-nav button')).toHaveLength(7)
    expect(root.querySelectorAll('input[name="cup-design"]')).toHaveLength(3)
    const view = vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!
    expect(view.vessel.id).toBe('cay-glass')
    expect(view.vessel.colors.body).toBe('#2fa3a0')
    expect(view.vessel.colors.rim).toBe('#c9a24b')
    expect(view.design).toBe(cayDesigns[0])
    for (const design of cayDesigns) {
      root.querySelector<HTMLInputElement>(`input[value="${design.id}"]`)!.click()
      await nextTick()
      expect(root.querySelector('figcaption')?.textContent).toContain(design.name)
      expect(root.querySelector('.culture-sources')?.textContent).toContain(design.note)
    }
    expect(gallery.setDesign).toHaveBeenLastCalledWith(0, cayDesigns[2])
    await chooseCulture('colombia')
    await chooseCulture('turkiye')
    expect(root.querySelector<HTMLInputElement>('input[value="cay-cintamani"]')!.checked).toBe(true)
    expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.design).toBe(cayDesigns[2])
  })

  it('adds the kulhad with two earthy inks and remembers the selected motif', async () => {
    await mount()
    await chooseStudy('Designs')
    await chooseCulture('india')
    expect(root.querySelectorAll('.study-nav button')).toHaveLength(7)
    expect(root.querySelectorAll('input[name="cup-design"]')).toHaveLength(3)
    const view = vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!
    expect(view.vessel.id).toBe('kulhad')
    expect(view.vessel.colors).toMatchObject(kulhadColors)
    expect(view.design).toBe(kulhadDesigns[0])
    for (const design of kulhadDesigns) {
      root.querySelector<HTMLInputElement>(`input[value="${design.id}"]`)!.click()
      await nextTick()
      expect(root.querySelector('figcaption')?.textContent).toContain(design.name)
      expect(root.querySelector('.culture-sources')?.textContent).toContain(design.note)
    }
    expect(gallery.setDesign).toHaveBeenLastCalledWith(0, kulhadDesigns[2])
    await chooseCulture('turkiye')
    await chooseCulture('india')
    expect(root.querySelector<HTMLInputElement>('input[value="kulhad-vine"]')!.checked).toBe(true)
    expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.design).toBe(kulhadDesigns[2])
  })

  it('adds the Russian glass with a patterned nickel holder and remembers the selected motif', async () => {
    await mount()
    await chooseStudy('Designs')
    await chooseCulture('russia')
    expect(root.querySelectorAll('input[name="cup-design"]')).toHaveLength(3)
    const view = vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!
    expect(view.vessel.id).toBe('podstakannik')
    expect(view.vessel.colors).toMatchObject(podstakannikColors)
    expect(view.vessel.pattern!.surface).toBe('holder')
    expect(view.design).toBe(podstakannikDesigns[0])
    for (const design of podstakannikDesigns) {
      root.querySelector<HTMLInputElement>(`input[value="${design.id}"]`)!.click()
      await nextTick()
      expect(root.querySelector('figcaption')?.textContent).toContain(design.name)
      expect(root.querySelector('.culture-sources')?.textContent).toContain(design.note)
      expect(root.querySelector(`input[value="${design.id}"]`)!.closest('label')!.querySelector('img')!.getAttribute('src'))
        .toContain(encodeURIComponent(podstakannikColors.metal!))
    }
    await chooseCulture('india')
    await chooseCulture('russia')
    expect(root.querySelector<HTMLInputElement>('input[value="podstakannik-filigree"]')!.checked).toBe(true)
    expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.design).toBe(podstakannikDesigns[2])
  })

  it('keeps manual rotation available for all cultures with reduced motion', async () => {
    await mount(true)
    await chooseStudy('Designs')
    for (const [culture, vessel] of [['china', 'gaiwan'], ['colombia', 'colombian-mug'], ['turkiye', 'cay-glass'], ['india', 'kulhad'], ['russia', 'podstakannik'], ['japan', 'yunomi']]) {
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
    for (const [culture, designs] of [['china', gaiwanDesigns], ['colombia', colombianDesigns], ['turkiye', cayDesigns], ['india', kulhadDesigns], ['russia', podstakannikDesigns]] as const) {
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

  it('adds an accessories workspace with all eighteen default cups, the paintbrush and no colour controls', async () => {
    await mount()
    await chooseStudy('Accessories')
    expect(root.querySelector('.study-nav button[aria-pressed="true"]')?.textContent).toContain('04 Accessories')
    const picker = root.querySelector<HTMLSelectElement>('[aria-label="Cup"]')!
    expect([...picker.options].map(option => option.value)).toEqual(vessels.map(vessel => vessel.id))
    expect([...picker.querySelectorAll('optgroup')].map(group => group.children.length)).toEqual([12, 6])
    expect(root.querySelector('.accessory-picker')?.textContent).toContain('Bristles out')
    expect([...root.querySelectorAll<HTMLInputElement>('input[name="cup-accessory"]')].map(input => input.getAttribute('aria-label')))
      .toEqual(['Paintbrush', 'Leaf', 'Beret', 'Tea tag', 'Headphones', 'Scarf'])
    expect(root.querySelector('input[name="cup-colour"], .design-picker, .culture-sources')).toBeNull()
    for (const vessel of vessels) {
      await chooseCup(vessel.id)
      const call = vi.mocked(createCupGallery).mock.calls.at(-1)!
      expect(call[1]).toHaveLength(1)
      expect(call[1][0]!.vessel).toBe(vessel)
      expect(call[1][0]!.design).toBeUndefined()
      expect(call[1][0]!.accessory).toBe('paintbrush')
      expect(call[2]?.turntable).toBe(true)
      expect(call[2]?.frame).toEqual({ lift: 1.4, halfHeight: 2.05 })
      expect(root.querySelector('.cup-viewport')?.getAttribute('aria-valuetext')).toBe(`${vessel.name}, grey with a paintbrush, turned 0 degrees`)
      expect(root.querySelectorAll('canvas')).toHaveLength(1)
      expect(root.querySelectorAll('.cup-viewport')).toHaveLength(1)
      expect(root.querySelector('figcaption')?.textContent).toContain(vessel.name)
    }
    expect(gallery.setDesign).not.toHaveBeenCalled()
    expect(gallery.setColors).not.toHaveBeenCalled()
  })

  it('selects exactly one of the six named accessories, rebuilds only when the shown model changes, and keeps it across cup and study changes', async () => {
    await mount()
    await chooseStudy('Accessories')
    const calls = vi.mocked(createCupGallery).mock.calls.length
    for (const input of root.querySelectorAll<HTMLInputElement>('input[name="cup-accessory"]')) {
      input.click()
      await nextTick()
      expect(root.querySelectorAll('input[name="cup-accessory"]:checked')).toHaveLength(1)
      expect(root.querySelector<HTMLInputElement>('input[name="cup-accessory"]:checked')!.value).toBe(input.value)
      expect(input.closest('label')!.classList.contains('is-selected')).toBe(true)
      await vi.waitFor(() => expect(root.querySelector('.cup-stage')?.getAttribute('data-ready')).toBe('true'))
      expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.accessory).toBe(input.value)
    }
    // Pinceau → feuille → béret → étiquette → casque → écharpe.
    expect(createCupGallery).toHaveBeenCalledTimes(calls + 5)
    expect(root.querySelector('.accessory-picker')?.textContent).toContain('rich-blue scarf')
    expect(gallery.setDesign).not.toHaveBeenCalled()
    await chooseCup(vessels[17]!.id)
    expect(root.querySelector<HTMLInputElement>('input[value="scarf"]')!.checked).toBe(true)
    await chooseStudy('Designs')
    await chooseStudy('Accessories')
    expect(root.querySelector<HTMLInputElement>('input[value="scarf"]')!.checked).toBe(true)
    expect(root.querySelector('.cup-viewport')?.getAttribute('aria-valuetext')).toContain('grey with a scarf')
  })

  it.each([
    { reduced: false, accessory: 'leaf', name: 'leaf', note: 'two-leaf sprout' },
    { reduced: true, accessory: 'leaf', name: 'leaf', note: 'two-leaf sprout' },
    { reduced: false, accessory: 'beret', name: 'beret', note: 'soft red beret' },
    { reduced: true, accessory: 'beret', name: 'beret', note: 'soft red beret' },
    { reduced: false, accessory: 'tea-bag', name: 'tea tag', note: 'yellow tea tag' },
    { reduced: true, accessory: 'tea-bag', name: 'tea tag', note: 'yellow tea tag' },
    { reduced: false, accessory: 'scarf', name: 'scarf', note: 'rich-blue scarf' },
    { reduced: true, accessory: 'scarf', name: 'scarf', note: 'rich-blue scarf' },
    { reduced: false, accessory: 'headphones', name: 'pair of headphones', note: 'Charcoal-grey headphones' },
    { reduced: true, accessory: 'headphones', name: 'pair of headphones', note: 'Charcoal-grey headphones' }
  ])('shows the $name on every cup and retains selection and viewing angles (reduced motion: $reduced)', async ({ reduced, accessory: chosenAccessory, name, note }) => {
    await mount(reduced)
    await chooseStudy('Accessories')
    vi.mocked(createCupGallery).mock.calls.at(-1)![2]!.onTurn!(135)
    const angle = root.querySelector<HTMLInputElement>('[aria-label="View angle"]')!
    angle.value = '42'
    angle.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    for (const accessory of [chosenAccessory, 'paintbrush', chosenAccessory]) {
      const calls = vi.mocked(createCupGallery).mock.calls.length
      root.querySelector<HTMLInputElement>(`input[value="${accessory}"]`)!.click()
      await nextTick()
      await vi.waitFor(() => expect(createCupGallery).toHaveBeenCalledTimes(calls + 1))
      expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.accessory).toBe(accessory)
      expect(vi.mocked(createCupGallery).mock.calls.at(-1)![2]?.initialTurn).toBe(135)
      expect(gallery.setElevation).toHaveBeenLastCalledWith(42)
    }
    for (const vessel of vessels) {
      await chooseCup(vessel.id)
      expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.accessory).toBe(chosenAccessory)
      expect(root.querySelector('.cup-viewport')?.getAttribute('aria-valuetext'))
        .toBe(`${vessel.name}, grey with a ${name}, turned 135 degrees`)
      expect(root.querySelector('.palette-note')?.textContent).toContain(note)
      expect(root.querySelector('[aria-label="Turn the cup"]')).not.toBeNull()
    }
    const calls = vi.mocked(createCupGallery).mock.calls.length
    root.querySelector<HTMLInputElement>(`input[value="${chosenAccessory}"]`)!.click()
    await nextTick()
    expect(createCupGallery).toHaveBeenCalledTimes(calls)
    await chooseStudy('Shapes')
    if (reduced) expect(root.querySelectorAll('.cup-viewport img')).toHaveLength(18)
    else expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1].every(view => view.accessory === undefined)).toBe(true)
    await chooseStudy('Accessories')
    expect(root.querySelector<HTMLInputElement>(`input[value="${chosenAccessory}"]`)!.checked).toBe(true)
    expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.accessory).toBe(chosenAccessory)
  })

  describe('editor study', () => {
    async function pick(name: string, value: string) {
      const input = root.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!
      input.click()
      await nextTick()
      await vi.waitFor(() => expect(root.querySelector('.cup-stage')?.getAttribute('data-ready')).toBe('true'))
    }
    const lastView = () => vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!
    const lastOptions = () => vi.mocked(createCupGallery).mock.calls.at(-1)![2]!

    it('opens as the fifth study with a cursor-following cup and three tabs', async () => {
      await mount()
      await chooseStudy('Editor')
      expect(root.querySelector('.study-nav button[aria-pressed="true"]')?.textContent).toContain('05 Editor')
      expect([...root.querySelectorAll('.editor-tabs button')].map(button => button.textContent)).toEqual(['Vessel', 'Colour', 'Accessory'])
      // La première tasse part de la couleur par défaut : la pierre, qui est le gris de la palette.
      expect(lastView().vessel.id).toBe(vessels[0]!.id)
      expect(lastView().vessel.colors.body).toBe(vessels[0]!.colors.body)
      expect(root.querySelector<HTMLInputElement>('input[name="editor-colour"][value="stone"]')!.checked).toBe(true)
      expect(lastView().design).toBeUndefined()
      expect(lastView().accessory).toBeUndefined()
      // Pas de platine : la tasse suit le curseur comme sur la première page.
      expect(lastOptions().turntable).toBe(false)
      expect(lastOptions().frame).toEqual({ lift: 1.4, halfHeight: 2.05 })
      expect(root.querySelector('.cup-viewport.is-turntable')).toBeNull()
      expect(root.querySelectorAll('.cup-viewport')).toHaveLength(1)
      expect(root.querySelector('.interaction-hint')?.textContent).toContain('cursor')
    })

    it('offers all eighteen vessels, exactly the twelve colours on an ordinary cup, and six accessories plus none', async () => {
      await mount()
      await chooseStudy('Editor')
      expect(root.querySelectorAll('input[name="editor-vessel"]')).toHaveLength(18)
      expect([...root.querySelectorAll<HTMLInputElement>('input[name="editor-colour"]')].map(input => input.value)).toEqual(palette.map(option => option.id))
      expect([...root.querySelectorAll<HTMLInputElement>('input[name="editor-accessory"]')].map(input => input.value))
        .toEqual(['none', 'paintbrush', 'leaf', 'beret', 'tea-bag', 'headphones', 'scarf'])
    })

    it('rebuilds for a new vessel or accessory but recolours in place', async () => {
      await mount()
      await chooseStudy('Editor')
      const calls = vi.mocked(createCupGallery).mock.calls.length
      await pick('editor-colour', 'blush')
      await pick('editor-colour', 'oat')
      expect(createCupGallery).toHaveBeenCalledTimes(calls)
      expect(gallery.setColors).toHaveBeenLastCalledWith(0, expect.objectContaining({ body: palette.find(option => option.id === 'oat')!.colors.body }))
      await pick('editor-vessel', 'tall-mug')
      expect(createCupGallery).toHaveBeenCalledTimes(calls + 1)
      expect(lastView().vessel.id).toBe('tall-mug')
      expect(lastView().vessel.colors.body).toBe(palette.find(option => option.id === 'oat')!.colors.body)
      await pick('editor-accessory', 'beret')
      expect(createCupGallery).toHaveBeenCalledTimes(calls + 2)
      expect(lastView().accessory).toBe('beret')
      expect(root.querySelector('.cup-viewport')?.getAttribute('aria-label')).toBe('Tall mug, oat, with a beret')
    })

    it('turns the second tab into Pattern on a cultural vessel, which opens on its first pattern and never on grey', async () => {
      await mount()
      await chooseStudy('Editor')
      await pick('editor-vessel', 'gaiwan')
      expect([...root.querySelectorAll('.editor-tabs button')].map(button => button.textContent)).toEqual(['Vessel', 'Pattern', 'Accessory'])
      // Les couleurs ordinaires disparaissent : motif OU couleur, selon la tasse.
      expect(root.querySelector('input[name="editor-colour"]')).toBeNull()
      const patterns = [...root.querySelectorAll<HTMLInputElement>('input[name="editor-pattern"]')]
      expect(patterns.map(input => input.value)).toEqual(gaiwanDesigns.map(design => design.id))
      expect(patterns[0]!.checked).toBe(true)
      expect(lastView().design).toBe(gaiwanDesigns[0])
      expect(lastView().vessel.colors.body).not.toBe(vessels[0]!.colors.body)
      await pick('editor-accessory', 'leaf')
      expect(lastView().design).toBe(gaiwanDesigns[0])
      expect(lastView().accessory).toBe('leaf')
      const calls = vi.mocked(createCupGallery).mock.calls.length
      await pick('editor-pattern', gaiwanDesigns[1]!.id)
      expect(createCupGallery).toHaveBeenCalledTimes(calls)
      expect(gallery.setDesign).toHaveBeenLastCalledWith(0, gaiwanDesigns[1])
      expect(root.querySelector('.cup-viewport')?.getAttribute('aria-label')).toContain(`${gaiwanDesigns[1]!.name} pattern`)
      expect(lastView().accessory).toBe('leaf')
      // Les accessoires se posent sur la tasse nue, pas sur le verre rempli.
      expect(lastView().fitVessel).toBe(vessels.find(vessel => vessel.id === 'gaiwan'))
    })

    it('keeps a colour across ordinary cups but starts every cultural vessel from its default', async () => {
      await mount()
      await chooseStudy('Editor')
      await pick('editor-colour', 'blush')
      await pick('editor-vessel', 'tall-mug')
      expect(root.querySelector<HTMLInputElement>('input[name="editor-colour"][value="blush"]')!.checked).toBe(true)
      expect(lastView().vessel.colors.body).toBe(palette.find(option => option.id === 'blush')!.colors.body)
      // Une tasse culturelle ne reprend pas la couleur : elle ouvre sur son premier motif.
      await pick('editor-vessel', 'yunomi')
      expect(lastView().design).toBe(yunomiDesigns[0])
      await pick('editor-pattern', yunomiDesigns[1]!.id)
      expect(gallery.setDesign).toHaveBeenLastCalledWith(0, yunomiDesigns[1])
      // Au retour sur une tasse ordinaire, la couleur repart elle aussi de la pierre.
      await pick('editor-vessel', 'mug')
      expect(lastView().design).toBeUndefined()
      expect(root.querySelector<HTMLInputElement>('input[name="editor-colour"][value="stone"]')!.checked).toBe(true)
      expect(lastView().vessel.colors.body).toBe(vessels[0]!.colors.body)
      expect(root.querySelector('input[name="editor-pattern"]')).toBeNull()
    })

    it('keeps its choices when leaving and returning, and stays 3D with reduced motion', async () => {
      await mount()
      await chooseStudy('Editor')
      await pick('editor-vessel', 'teacup')
      await pick('editor-accessory', 'headphones')
      await chooseStudy('Shapes')
      await chooseStudy('Editor')
      expect(root.querySelector<HTMLInputElement>('input[name="editor-vessel"][value="teacup"]')!.checked).toBe(true)
      expect(lastView().vessel.id).toBe('teacup')
      expect(lastView().accessory).toBe('headphones')
      media.matches = true
      media.dispatchEvent(new Event('change'))
      await nextTick()
      expect(root.querySelector('.cup-canvas.is-hidden')).toBeNull()
    })
  })

  it('keeps the viewing angle across repeated cup changes and remembers the cup independently of the other studies', async () => {
    await mount()
    await chooseStudy('Accessories')
    vi.mocked(createCupGallery).mock.calls.at(-1)![2]!.onTurn!(135)
    const angle = root.querySelector<HTMLInputElement>('[aria-label="View angle"]')!
    angle.value = '42'
    angle.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    for (const vessel of [vessels[12]!, vessels[17]!, vessels[0]!, vessels[12]!]) {
      await chooseCup(vessel.id)
      expect(vi.mocked(createCupGallery).mock.calls.at(-1)![2]?.initialTurn).toBe(135)
      expect(gallery.setElevation).toHaveBeenLastCalledWith(42)
      expect(root.querySelector('[aria-label="Turn the cup"]')?.getAttribute('aria-valuenow')).toBe('135')
      expect(root.querySelector('[aria-label="View angle"]')?.getAttribute('max')).toBe('60')
    }
    const calls = vi.mocked(createCupGallery).mock.calls.length
    root.querySelectorAll<HTMLButtonElement>('.theme-control button')[1]!.click()
    await nextTick()
    expect(createCupGallery).toHaveBeenCalledTimes(calls)
    expect(root.querySelector('main')?.getAttribute('data-theme')).toBe('dark')
    await chooseStudy('Designs')
    expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.vessel.id).toBe('yunomi')
    await chooseStudy('Accessories')
    expect(root.querySelector<HTMLSelectElement>('[aria-label="Cup"]')!.value).toBe(vessels[12]!.id)
    expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.vessel).toBe(vessels[12])
    await chooseStudy('Shapes')
    expect(root.querySelectorAll('.cup-viewport')).toHaveLength(18)
  })

  it('allows manual accessory inspection with initial and runtime reduced motion without enabling automatic turning', async () => {
    await mount(true)
    await chooseStudy('Accessories')
    for (const vessel of vessels) {
      await chooseCup(vessel.id)
      expect(root.querySelector('[aria-label="Turn the cup"]')).not.toBeNull()
      expect(root.querySelector('.cup-canvas')?.classList.contains('is-hidden')).toBe(false)
      expect(root.textContent).not.toContain('Slow turn')
    }
    media.matches = false
    media.dispatchEvent(new Event('change'))
    await nextTick()
    const turnButton = [...root.querySelectorAll<HTMLButtonElement>('.controls button')][0]!
    turnButton.click()
    await nextTick()
    expect(gallery.setTurning).toHaveBeenLastCalledWith(true)
    const calls = vi.mocked(createCupGallery).mock.calls.length
    media.matches = true
    media.dispatchEvent(new Event('change'))
    await nextTick()
    expect(gallery.setTurning).toHaveBeenLastCalledWith(false)
    expect(createCupGallery).toHaveBeenCalledTimes(calls)
    expect(root.querySelector('[aria-label="Turn the cup"]')).not.toBeNull()
    expect(root.textContent).not.toContain('Slow turn')
  })

  it.each(['paintbrush', 'beret', 'tea-bag', 'headphones', 'scarf'])('uses the correct grey still for every %s cup when WebGL is unavailable', async accessory => {
    await mount()
    vi.mocked(createCupGallery).mockImplementationOnce(() => { throw new Error('WebGL unavailable') })
    await chooseStudy('Accessories')
    root.querySelector<HTMLInputElement>(`input[value="${accessory}"]`)!.click()
    await nextTick()
    for (const vessel of vessels) {
      await chooseCup(vessel.id)
      expect(root.querySelector('.cup-viewport img')?.getAttribute('src')).toBe(`/cups/stills/${vessel.id}.png`)
      expect(root.querySelector('.cup-viewport')?.getAttribute('aria-label')).toBe(`${vessel.name}, grey with no accessories`)
      expect(root.querySelector('[aria-label="Turn the cup"], [aria-label="View angle"]')).toBeNull()
    }
    expect(createCupGallery).toHaveBeenCalledTimes(2)
    expect(root.textContent).toContain('WebGL unavailable')
  })

  describe('expression and personality studies', () => {
    const AWAY = { x: 0, y: 0, active: false }
    const lastCall = () => vi.mocked(createCupGallery).mock.calls.at(-1)!
    // En mouvement réduit, l'interprète rend la pose juste : c'est ce qu'on lit ici.
    const act = () => lastCall()[2]!.perform!(0, AWAY, true)
    async function pickInput(name: string, value: string) {
      root.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)!.click()
      await nextTick()
      await vi.waitFor(() => expect(root.querySelector('.cup-stage')?.getAttribute('data-ready')).toBe('true'))
    }

    afterEach(() => {
      vi.useRealTimers()
    })

    it('shows the editor cup twice on Expressions, large and at sidebar size, with a performer', async () => {
      await mount()
      await chooseStudy('Editor')
      await pickInput('editor-vessel', 'gaiwan')
      await pickInput('editor-accessory', 'leaf')
      await chooseStudy('Expressions')
      expect(root.querySelector('.study-nav button[aria-pressed="true"]')?.textContent).toContain('06 Expressions')
      const [, views, options] = lastCall()
      expect(views).toHaveLength(2)
      for (const view of views) {
        expect(view.vessel.id).toBe('gaiwan')
        expect(view.design).toBe(gaiwanDesigns[0])
        expect(view.accessory).toBe('leaf')
        expect(view.fitVessel).toBe(vessels.find(vessel => vessel.id === 'gaiwan'))
      }
      expect(views[1]!.element.closest('.cup-mini')).not.toBeNull()
      expect(options!.turntable).toBe(false)
      expect(options!.frame).toEqual({ lift: 1.4, halfHeight: 2.05 })
      expect(options!.perform).toBeTypeOf('function')
      expect([...root.querySelectorAll<HTMLInputElement>('input[name="expression"]')].map(input => input.value)).toEqual(EXPRESSIONS.map(expression => expression.id))
      expect(root.querySelectorAll('.expression-glyph polygon')).toHaveLength(32)
      expect(root.querySelector('input[name="personality"], .chat-demo')).toBeNull()
      expect(root.querySelector('figcaption')?.textContent).toContain('Neutral')
      expect(root.querySelector<HTMLInputElement>('[aria-label="View angle"]')!.value).toBe('8')
    })

    it('holds the picked expression without rebuilding the scene, and brings steam with Thinking', async () => {
      await mount()
      await chooseStudy('Expressions')
      const calls = vi.mocked(createCupGallery).mock.calls.length
      expect(act()).toMatchObject({ expression: 'neutral', steam: 0 })
      await pickInput('expression', 'happy')
      expect(act()).toMatchObject({ expression: 'happy', steam: 0 })
      expect(gallery.refresh).toHaveBeenCalled()
      expect(root.querySelector('.cup-viewport')?.getAttribute('aria-label')).toBe('Mug, stone, looking happy')
      expect(root.querySelector('figcaption')?.textContent).toContain('Mug · Happy')
      await pickInput('expression', 'thinking')
      expect(act()).toMatchObject({ expression: 'thinking', steam: 1 })
      expect(createCupGallery).toHaveBeenCalledTimes(calls)
    })

    it('plays a conversation on Personalities: listening, thinking with steam, then the reply', async () => {
      await mount()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      await chooseStudy('Personalities')
      expect(root.querySelector('.study-nav button[aria-pressed="true"]')?.textContent).toContain('07 Personalities')
      expect([...root.querySelectorAll<HTMLInputElement>('input[name="personality"]')].map(input => input.value)).toEqual(PERSONALITIES.map(personality => personality.id))
      expect(root.querySelector<HTMLInputElement>('input[name="personality"][value="lively"]')!.checked).toBe(true)
      expect(root.querySelector('.chat-thread')?.getAttribute('data-phase')).toBe('idle')
      expect(root.querySelector('.chat-bubble')).toBeNull()
      expect(act()).toMatchObject({ expression: 'neutral', steam: 0 })

      const until = async (phase: string) => {
        for (let i = 0; i < 100 && root.querySelector('.chat-thread')?.getAttribute('data-phase') !== phase; i++) {
          vi.advanceTimersByTime(100)
          await nextTick()
        }
        expect(root.querySelector('.chat-thread')?.getAttribute('data-phase')).toBe(phase)
      }
      await until('listening')
      expect(root.querySelector('.chat-user')?.textContent).toBe('I got the job!')
      expect(act()).toMatchObject({ expression: 'attentive', steam: 0 })
      await until('thinking')
      expect(root.querySelector('.steam-indicator')?.getAttribute('aria-label')).toBe('Thinking')
      expect(root.querySelectorAll('.steam-indicator path')).toHaveLength(3)
      expect(act()).toMatchObject({ expression: 'thinking', steam: 1 })
      expect(root.querySelector('.cup-viewport')?.getAttribute('aria-label')).toContain('thinking, with steam rising')
      await until('replying')
      expect(root.querySelector('.steam-indicator')).toBeNull()
      expect(root.querySelector('.chat-agent')?.textContent).toBe('That is wonderful news. Congratulations!')
      expect(act()).toMatchObject({ expression: 'delighted', steam: 0 })
      await until('idle')
      expect(act()).toMatchObject({ expression: 'neutral' })
      await until('listening')
      expect(root.querySelector('.chat-user')?.textContent).toBe('Can you plan my week?')
    })

    it('lets the personality change how the same expression is played, and pauses to try one', async () => {
      await mount()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      await chooseStudy('Personalities')
      const calls = vi.mocked(createCupGallery).mock.calls.length
      await pickInput('expression', 'surprised')
      expect(root.querySelector('.chat-heading button')?.textContent).toBe('Play')
      expect(root.querySelector('.chat-thread')?.getAttribute('data-phase')).toBe('paused')
      const lively = act()
      expect(lively.expression).toBe('surprised')
      await pickInput('personality', 'deadpan')
      const deadpan = act()
      expect(deadpan.expression).toBe('surprised')
      expect(deadpan.face.eyes[0].w).toBeLessThan(lively.face.eyes[0].w)
      expect(deadpan.face.eyes[0].lid).toBeGreaterThan(0.3)
      await pickInput('personality', 'playful')
      expect(act().face.eyes[0].w).toBeGreaterThan(lively.face.eyes[0].w)
      // En pause, rien n'avance tout seul.
      vi.advanceTimersByTime(20_000)
      await nextTick()
      expect(act().expression).toBe('surprised')
      root.querySelector<HTMLButtonElement>('.chat-heading button')!.click()
      await nextTick()
      expect(root.querySelector('.chat-thread')?.getAttribute('data-phase')).toBe('idle')
      expect(act().expression).toBe('neutral')
      expect(createCupGallery).toHaveBeenCalledTimes(calls)
      // La planche des expressions revient à la personnalité par défaut.
      await chooseStudy('Expressions')
      await pickInput('expression', 'surprised')
      expect(act().face.eyes[0].w).toBeCloseTo(lively.face.eyes[0].w, 9)
    })

    it('keeps the 3D cup with reduced motion, and falls back to the still without WebGL', async () => {
      await mount(true)
      await chooseStudy('Expressions')
      expect(root.querySelector('.cup-viewport img')).toBeNull()
      expect(lastCall()[2]!.perform).toBeTypeOf('function')
      expect(root.querySelector('.interaction-hint')?.textContent).toContain('expressions change without animation')
      vi.mocked(createCupGallery).mockImplementationOnce(() => { throw new Error('WebGL unavailable') })
      await chooseStudy('Personalities')
      expect(root.querySelector('.cup-viewport img')?.getAttribute('src')).toBe('/cups/stills/mug.png')
      expect(root.querySelector('.cup-mini')).toBeNull()
    })
  })
})
