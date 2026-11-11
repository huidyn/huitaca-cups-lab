// @vitest-environment happy-dom
import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CupsLab from './CupsLab.vue'
import { vessels } from './catalogue'
import { palette } from './palette'
import { cayDesigns, colombianDesigns, gaiwanDesigns, kulhadColors, kulhadDesigns, podstakannikColors, podstakannikDesigns, yunomiDesigns } from './designs'
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
    expect(root.querySelectorAll('.study-nav button')).toHaveLength(4)
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
    expect(root.querySelectorAll('.study-nav button')).toHaveLength(4)
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
    expect(root.querySelectorAll('.study-nav button')).toHaveLength(4)
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
    expect(root.querySelectorAll('.study-nav button')).toHaveLength(4)
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
      expect(vi.mocked(createCupGallery).mock.calls.at(-1)![1][0]!.accessory).toBe(['paintbrush', 'beret', 'tea-bag', 'scarf'].includes(input.value) ? input.value : undefined)
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
    { reduced: false, accessory: 'beret', name: 'beret', note: 'soft red beret' },
    { reduced: true, accessory: 'beret', name: 'beret', note: 'soft red beret' },
    { reduced: false, accessory: 'tea-bag', name: 'tea tag', note: 'yellow tea tag' },
    { reduced: true, accessory: 'tea-bag', name: 'tea tag', note: 'yellow tea tag' },
    { reduced: false, accessory: 'scarf', name: 'scarf', note: 'rich-blue scarf' },
    { reduced: true, accessory: 'scarf', name: 'scarf', note: 'rich-blue scarf' }
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

  it('uses the correct grey still for every accessory cup when WebGL is unavailable', async () => {
    await mount()
    vi.mocked(createCupGallery).mockImplementationOnce(() => { throw new Error('WebGL unavailable') })
    await chooseStudy('Accessories')
    for (const accessory of ['paintbrush', 'beret', 'tea-bag', 'scarf']) {
      root.querySelector<HTMLInputElement>(`input[value="${accessory}"]`)!.click()
      await nextTick()
      for (const vessel of vessels) {
        await chooseCup(vessel.id)
        expect(root.querySelector('.cup-viewport img')?.getAttribute('src')).toBe(`/cups/stills/${vessel.id}.png`)
        expect(root.querySelector('.cup-viewport')?.getAttribute('aria-label')).toBe(`${vessel.name}, grey with no accessories`)
        expect(root.querySelector('[aria-label="Turn the cup"], [aria-label="View angle"]')).toBeNull()
      }
    }
    expect(createCupGallery).toHaveBeenCalledTimes(2)
    expect(root.textContent).toContain('WebGL unavailable')
  })
})
