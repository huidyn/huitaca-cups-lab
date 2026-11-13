// @vitest-environment happy-dom
import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgentSidebar from './AgentSidebar.vue'
import { AGENT_LOOK_MAX_BYTES, normaliseAgentLook } from './agent-look'
import { AVATAR_FRAME } from './cup2d'
import { COST_BUDGET_MS } from './quality'
import { createCupGallery } from './renderer'
import { runScenario, SCENARIOS } from './bench'

const gallery = vi.hoisted(() => ({ refresh: vi.fn(), setQuality: vi.fn(), dispose: vi.fn() }))

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
    media = Object.assign(new EventTarget(), { matches: false })
    vi.stubGlobal('matchMedia', () => media)
    root = document.createElement('div')
    document.body.append(root)
  })

  async function mount(reduced = false) {
    media.matches = reduced
    app = createApp(AgentSidebar)
    app.mount(root)
    await vi.waitFor(() => expect(root.querySelectorAll('.side-agent')).toHaveLength(10))
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
    expect(root.querySelectorAll('.side-agent .agent-cup[aria-hidden="true"]')).toHaveLength(10)
    expect(root.querySelector('.side-agent.is-current .agent-name')?.textContent).toBe('Research')
    expect(root.querySelector('.side')?.getAttribute('style')).toContain('--cup: 32px')
  })

  it('draws every agent in one shared canvas, framed like the 2D cups', async () => {
    await mount()
    expect(root.querySelectorAll('canvas')).toHaveLength(1)
    expect(createCupGallery).toHaveBeenCalledTimes(1)
    expect(views()).toHaveLength(10)
    expect(views().every((view, i) => view.element === root.querySelectorAll('.agent-viewport')[i])).toBe(true)
    expect(views().map(view => view.vessel.id).slice(0, 4)).toEqual(['teacup', 'goblet', 'takeaway', 'rimmed-cup'])
    expect(views().map(view => view.accessory).slice(0, 4)).toEqual(['paintbrush', 'beret', undefined, 'tea-bag'])
    // Les tasses à motif portent leur motif, pas une couleur.
    expect(views()[4]!.design?.id).toBe('seigaiha')
    expect(options().frame).toEqual(AVATAR_FRAME)
    expect(root.querySelector('.side-canvas')?.classList.contains('is-hidden')).toBe(false)
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
    expect(gallery.refresh).toHaveBeenCalledTimes(1)
    // Ni la taille ni le repli ne reconstruisent la scène.
    expect(createCupGallery).toHaveBeenCalledTimes(1)
  })

  it('gives agents past the examples a stable look derived from their id', async () => {
    await mount()
    button('40').click()
    await vi.waitFor(() => expect(createCupGallery).toHaveBeenCalledTimes(2))
    expect(gallery.dispose).toHaveBeenCalledTimes(1)
    expect(views()).toHaveLength(40)
    expect(root.querySelectorAll('.agent-viewport')).toHaveLength(40)
    expect(root.querySelectorAll('.agent-name')[39]!.textContent).toBe('Agent 40')
    const again = views().slice(10).map(view => `${view.vessel.id}|${view.accessory}`)
    button('10').click()
    await vi.waitFor(() => expect(createCupGallery).toHaveBeenCalledTimes(3))
    button('40').click()
    await vi.waitFor(() => expect(createCupGallery).toHaveBeenCalledTimes(4))
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

  it('swaps to static SVG cups with 2D eyes, without destroying the layout', async () => {
    await mount()
    button('Static, 2D eyes').click()
    await vi.waitFor(() => expect(root.querySelectorAll('.flat-cup')).toHaveLength(10))
    expect(gallery.dispose).toHaveBeenCalled()
    expect(root.querySelector('.side-canvas')?.classList.contains('is-hidden')).toBe(true)
    expect(root.querySelectorAll('.agent-viewport')).toHaveLength(0)
    expect(root.querySelectorAll('.flat-cup .flat-eyes rect')).toHaveLength(20)
    expect(root.querySelector('.flat-cup')?.getAttribute('viewBox')).toMatch(/^-?[\d.]+ -?[\d.]+ 3\.24 3\.24$/)
    // Même boîte carrée que la 3D : la rangée ne change pas de hauteur.
    expect(root.querySelectorAll('.side-agent .agent-cup')).toHaveLength(10)
    expect(root.textContent).toContain('Static cups')
    expect(button('High').disabled).toBe(true)
  })

  it('aims the 2D eyes at the cursor, one update per frame, and not at all when reduced', async () => {
    await mount()
    button('Static, 2D eyes').click()
    await vi.waitFor(() => expect(root.querySelectorAll('.flat-cup')).toHaveLength(10))
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback))
    const first = root.querySelector<SVGElement>('.flat-cup')!
    for (const x of [10, 400, 800]) window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: x, clientY: 0, pointerType: 'mouse' }))
    expect(frames).toHaveLength(1)
    frames[0]!(0)
    expect(first.style.getPropertyValue('--gx')).not.toBe('')
    expect(Math.abs(Number(first.style.getPropertyValue('--gx')))).toBeLessThanOrEqual(1)
    frames.length = 0
    media.matches = true
    media.dispatchEvent(new Event('change'))
    await nextTick()
    window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 5, clientY: 5, pointerType: 'mouse' }))
    expect(frames).toHaveLength(0)
  })

  it('shows static cups and no canvas context with reduced motion', async () => {
    await mount(true)
    expect(createCupGallery).not.toHaveBeenCalled()
    expect(root.querySelectorAll('.flat-cup')).toHaveLength(10)
    expect(root.textContent).toContain('Reduced motion is on')
    expect(button('3D, shared canvas').disabled).toBe(true)
    expect(root.querySelector('.side-canvas')?.classList.contains('is-hidden')).toBe(true)
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
    await vi.waitFor(() => expect(root.querySelectorAll('.flat-cup')).toHaveLength(10))
    expect(root.querySelector('[role="status"]')?.textContent).toContain('static cup')
    // De retour en 3D, le juge repart de zéro.
    button('3D, shared canvas').click()
    await vi.waitFor(() => expect(root.querySelectorAll('.agent-viewport')).toHaveLength(10))
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
    expect(vi.mocked(runScenario).mock.calls.map(call => call[0].id)).toEqual(['hero', 'sidebar'])
    expect(vi.mocked(runScenario).mock.calls.every(call => call[1].quality === 'balanced' && call[1].slowdown === 4)).toBe(true)
    const rows = [...root.querySelectorAll('.agents-results tbody tr')]
    expect(rows[0]!.textContent).toContain('One large cup')
    expect(rows[1]!.querySelector('.verdict')?.getAttribute('data-verdict')).toBe('over')
    expect(rows[0]!.textContent).toContain('2.25')
    expect(root.textContent).toContain('Test GPU')
    expect(button('Measure')).toBeTruthy()
  })
})
