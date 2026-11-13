// @vitest-environment happy-dom
import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentSidebar from './AgentSidebar.vue'
import { AGENT_LOOK_MAX_BYTES, normaliseAgentLook } from './agent-look'
import { AVATAR_FRAME } from './cup2d'
import { COST_BUDGET_MS } from './quality'
import { createCupGallery } from './renderer'
import { runScenario, SCENARIOS } from './bench'

const gallery = vi.hoisted(() => ({
  refresh: vi.fn(), setQuality: vi.fn(), dispose: vi.fn(), wake: vi.fn(), rest: vi.fn(), sleep: vi.fn(), setActing: vi.fn(), setSteamColor: vi.fn(),
  // Une image par tasse, dont l'adresse dit la taille demandée.
  snapshot: vi.fn(async (indices: number[], size: number) => indices.map(i => `data:image/png;base64,${size}-${i}`))
}))

vi.mock('./renderer', async importOriginal => ({
  ...await importOriginal<typeof import('./renderer')>(),
  createCupGallery: vi.fn(() => gallery)
}))
vi.mock('./bench', async importOriginal => ({
  ...await importOriginal<typeof import('./bench')>(),
  gpuName: () => 'Test GPU',
  runScenario: vi.fn(async (scenario, options) => ({
    scenario, quality: options.quality, slowdown: options.slowdown, idleFrames: 0, verdict: scenario.id === 'hero' ? 'ok' : 'over',
    move: { frames: 180, mean: 1.5, p95: 2.25, max: 9.5, fps: 60 }
  }))
}))

describe('agents sidebar study', () => {
  let app: ReturnType<typeof createApp>
  let root: HTMLElement
  let media: EventTarget & { matches: boolean }

  beforeEach(() => {
    vi.clearAllMocks()
    // Le niveau retenu d'une visite à l'autre ne doit pas fuir d'un test à l'autre.
    localStorage.clear()
    media = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('matchMedia', () => media)
    root = document.createElement('div')
    document.body.append(root)
  })

  async function mount(reduced = false) {
    media.matches = reduced
    app = createApp(AgentSidebar)
    app.mount(root)
    await vi.waitFor(() => expect(root.querySelectorAll('.side-agent')).toHaveLength(40))
    if (!reduced) await vi.waitFor(() => expect(createCupGallery).toHaveBeenCalled())
  }
  const button = (label: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === label)!
  const views = () => vi.mocked(createCupGallery).mock.calls.at(-1)![1]
  const options = () => vi.mocked(createCupGallery).mock.calls.at(-1)![2]!

  afterEach(() => {
    app?.unmount()
    root.remove()
    vi.unstubAllGlobals()
  })

  it('lists agents by name with their cup, with grey placeholders for everything else, and no chats', async () => {
    await mount()
    expect([...root.querySelectorAll('.agent-name')].map(name => name.textContent).slice(0, 3)).toEqual(['Research', 'Contracts review', 'Inbox triage'])
    expect(root.querySelector('.side-label')?.textContent).toBe('Agents')
    expect(root.textContent?.toLowerCase()).not.toContain('chat')
    // La liste, les noms et le bouton d'agent sont lisibles ; les gris sont décoratifs.
    expect(root.querySelectorAll('.sk').length).toBeGreaterThan(8)
    expect(root.querySelector('.side-org')?.getAttribute('aria-hidden')).toBe('true')
    expect(root.querySelectorAll('.side-agent .agent-cup[aria-hidden="true"]')).toHaveLength(40)
    expect(root.querySelector('.side-agent.is-current .agent-name')?.textContent).toBe('Research')
    expect(root.querySelector('.side')?.getAttribute('style')).toContain('--cup: 32px')
  })

  it('draws every agent in one shared canvas, framed like the 2D cups', async () => {
    await mount()
    expect(root.querySelectorAll('canvas')).toHaveLength(1)
    expect(createCupGallery).toHaveBeenCalledTimes(1)
    expect(views()).toHaveLength(40)
    expect(views().every((view, i) => view.element === root.querySelectorAll('.agent-viewport')[i])).toBe(true)
    expect(views().map(view => view.vessel.id).slice(0, 4)).toEqual(['teacup', 'goblet', 'takeaway', 'rimmed-cup'])
    expect(views().map(view => view.accessory).slice(0, 4)).toEqual(['paintbrush', 'beret', undefined, 'tea-bag'])
    // Les tasses à motif portent leur motif, pas une couleur.
    expect(views()[4]!.design?.id).toBe('seigaiha')
    expect(options().frame).toEqual(AVATAR_FRAME)
    // Au repos, tout le monde regarde vers la droite.
    expect(options().resting).toEqual({ x: 0.6, y: 0 })
    expect(root.querySelector('.side-canvas')?.classList.contains('is-hidden')).toBe(false)
  })

  it('shows still images made by the 3D renderer, at the chosen size, each made once', async () => {
    await mount()
    await vi.waitFor(() => expect(root.querySelectorAll('.agent-still')).toHaveLength(40))
    expect(root.querySelectorAll('.flat-cup')).toHaveLength(0)
    expect(root.querySelector('.agent-still')?.getAttribute('src')).toMatch(/32-\d+$/)
    button('28 px').click()
    // Toutes les images, prises par lots de 8 : on attend la dernière.
    await vi.waitFor(() => expect([...root.querySelectorAll('.agent-still')].filter(img => /28-\d+$/.test(img.getAttribute('src')!))).toHaveLength(40))
    const asked = gallery.snapshot.mock.calls.length
    button('32 px').click()
    await vi.waitFor(() => expect(root.querySelector('.agent-still')?.getAttribute('src')).toMatch(/32-\d+$/))
    expect(gallery.snapshot.mock.calls.length).toBe(asked)
  })

  it('brings only the hovered row to life, then hands it back to its image', async () => {
    await mount()
    await vi.waitFor(() => expect(root.querySelectorAll('.agent-still')).toHaveLength(40))
    const agents = [...root.querySelectorAll<HTMLButtonElement>('.side-agent')]
    const hover = (i: number, type = 'mouse') => agents[i]!.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: type }))
    hover(2)
    expect(gallery.wake).toHaveBeenLastCalledWith(2)
    options().onShown!([2])
    await nextTick()
    const cups = [...root.querySelectorAll('.agent-cup')]
    expect(cups.map(cup => cup.classList.contains('is-live'))).toEqual(cups.map((_, i) => i === 2))
    hover(3)
    expect(gallery.rest).toHaveBeenLastCalledWith(2)
    expect(gallery.wake).toHaveBeenLastCalledWith(3)
    agents[3]!.dispatchEvent(new Event('pointerleave'))
    expect(gallery.rest).toHaveBeenLastCalledWith(3)
    options().onShown!([])
    await nextTick()
    expect(root.querySelectorAll('.agent-cup.is-live')).toHaveLength(0)
    // Pas de survol au doigt.
    gallery.wake.mockClear()
    hover(4, 'touch')
    expect(gallery.wake).not.toHaveBeenCalled()
  })

  it('sizes the cup box from the choice, and redraws when the list scrolls or the panel folds', async () => {
    await mount()
    button('24 px').click()
    await nextTick()
    expect(root.querySelector('.side')?.getAttribute('style')).toContain('--cup: 24px')
    button('Collapsed').click()
    await nextTick()
    await nextTick()
    expect(root.querySelector('.side')?.classList.contains('is-collapsed')).toBe(true)
    expect(root.querySelectorAll('.agent-name')).toHaveLength(0)
    expect(root.querySelector('.side-agent')?.getAttribute('title')).toBe('Research')
    expect(gallery.refresh).toHaveBeenCalled()
    gallery.refresh.mockClear()
    root.querySelector('.side-list')!.dispatchEvent(new Event('scroll'))
    // Dès le premier mouvement, tout redevient image d'un coup, sans attendre un redessin.
    expect(gallery.sleep).toHaveBeenCalledTimes(1)
    root.querySelector('.side-list')!.dispatchEvent(new Event('scroll'))
    expect(gallery.sleep).toHaveBeenCalledTimes(1)
    // Ni la taille ni le repli ne reconstruisent la scène.
    expect(createCupGallery).toHaveBeenCalledTimes(1)
  })

  it('gives agents past the examples a stable look derived from their id', async () => {
    await mount()
    expect(views()).toHaveLength(40)
    expect(root.querySelectorAll('.agent-viewport')).toHaveLength(40)
    expect(root.querySelectorAll('.agent-name')[39]!.textContent).toBe('Agent 40')
    const again = views().slice(10).map(view => `${view.vessel.id}|${view.accessory}`)
    button('10').click()
    await vi.waitFor(() => expect(createCupGallery).toHaveBeenCalledTimes(2))
    expect(gallery.dispose).toHaveBeenCalledTimes(1)
    expect(views()).toHaveLength(10)
    button('40').click()
    await vi.waitFor(() => expect(createCupGallery).toHaveBeenCalledTimes(3))
    expect(views().slice(10).map(view => `${view.vessel.id}|${view.accessory}`)).toEqual(again)
  })

  it('shows exactly what the app would store for the chosen agent, inside its budget', async () => {
    await mount()
    expect(root.querySelector('.agent-json')?.textContent).toBe('{"v":1,"cup":"teacup","colour":"sage","accessories":["paintbrush"],"personality":"focused"}')
    ;[...root.querySelectorAll<HTMLButtonElement>('.side-agent')][4]!.click()
    await nextTick()
    const stored = root.querySelector('.agent-json')!.textContent!
    expect(stored).toBe('{"v":1,"cup":"yunomi","design":"seigaiha","accessories":[],"personality":"shy"}')
    expect(normaliseAgentLook(JSON.parse(stored)).issues).toEqual([])
    expect(stored.length).toBeLessThanOrEqual(AGENT_LOOK_MAX_BYTES)
    expect(root.querySelector('.side-agent.is-current .agent-name')?.textContent).toBe('Onboarding')
    expect(root.textContent).toContain(`${stored.length} of ${AGENT_LOOK_MAX_BYTES} bytes`)
  })

  it('keeps the cups as still images with reduced motion, even on hover', async () => {
    await mount(true)
    await vi.waitFor(() => expect(root.querySelectorAll('.agent-still')).toHaveLength(40))
    expect(root.textContent).toContain('Reduced motion is on')
    root.querySelector('.side-agent')!.dispatchEvent(Object.assign(new Event('pointerenter'), { pointerType: 'mouse' }))
    expect(gallery.wake).not.toHaveBeenCalled()
  })

  it('steps the render quality down while frames run over budget, then falls back to static cups', async () => {
    await mount()
    const over = { cost: COST_BUDGET_MS * 3, interval: 16.7 }
    const feed = () => { for (let i = 0; i < 60; i++) options().onFrame!(over) }
    feed()
    await nextTick()
    expect(gallery.setQuality).toHaveBeenLastCalledWith('balanced')
    expect(button('Balanced').getAttribute('aria-pressed')).toBe('true')
    expect(root.querySelector('[role="status"]')?.textContent).toContain('dropped to balanced')
    feed()
    await nextTick()
    expect(gallery.setQuality).toHaveBeenLastCalledWith('low')
    feed()
    await vi.waitFor(() => expect(root.querySelectorAll('.flat-cup')).toHaveLength(40))
    expect(root.querySelector('[role="status"]')?.textContent).toContain('static cup')
    expect(gallery.dispose).toHaveBeenCalled()
    expect(root.querySelectorAll('.agent-viewport, .agent-still')).toHaveLength(0)
    expect(root.querySelector('.side-canvas')?.classList.contains('is-hidden')).toBe(true)
    // Même boîte carrée : la rangée ne change pas de hauteur.
    expect(root.querySelector('.flat-cup')?.getAttribute('viewBox')).toMatch(/^-?[\d.]+ -?[\d.]+ 3\.24 3\.24$/)
    expect(button('High').disabled).toBe(true)
  })

  it('does not step down when asked not to, or when frames fit the budget', async () => {
    await mount()
    for (let i = 0; i < 120; i++) options().onFrame!({ cost: 1, interval: 16.7 })
    expect(gallery.setQuality).not.toHaveBeenCalled()
    root.querySelector<HTMLInputElement>('.agents-check input')!.click()
    await nextTick()
    for (let i = 0; i < 120; i++) options().onFrame!({ cost: 40, interval: 16.7 })
    expect(gallery.setQuality).not.toHaveBeenCalled()
    button('Low').click()
    await nextTick()
    expect(gallery.setQuality).toHaveBeenCalledWith('low')
  })

  it('measures the large cup and the sidebar, at the chosen quality and CPU slowdown', async () => {
    await mount()
    button('Balanced').click()
    const select = root.querySelector<HTMLSelectElement>('select[aria-label="Simulated CPU slowdown"]')!
    select.value = '4'
    select.dispatchEvent(new Event('change'))
    await nextTick()
    button('Measure').click()
    await vi.waitFor(() => expect(root.querySelectorAll('.agents-results tbody tr')).toHaveLength(SCENARIOS.length))
    expect(vi.mocked(runScenario).mock.calls.map(call => call[0].id)).toEqual(['hero', 'sidebar', 'thinking'])
    expect(vi.mocked(runScenario).mock.calls.every(call => call[1].quality === 'balanced' && call[1].slowdown === 4)).toBe(true)
    const rows = [...root.querySelectorAll('.agents-results tbody tr')]
    expect(rows[0]!.textContent).toContain('One large cup')
    expect(rows[1]!.querySelector('.verdict')?.getAttribute('data-verdict')).toBe('over')
    expect(rows[0]!.textContent).toContain('2.25')
    expect(root.textContent).toContain('Test GPU')
    expect(button('Measure')).toBeTruthy()
  })
})
