# Cups as agents (page 08 of the lab)

What the App needs from the lab before batch 4.2, and where each answer lives.

## 1. The sidebar: still images at rest, 3D on hover

Decided: **neither always-3D nor always-2D.** Every agent rests as a still image of its own
3D cup, looking right (`REST = { x: 0.6, y: 0 }`, towards the conversation). Only the row
under the pointer comes to life, in 3D. Nothing is drawn, and the pointer costs nothing,
while it is anywhere else (`/cups`, study 08).

How it works (`GalleryOptions.resting`, `renderer.ts`):

- **One WebGL context, kept.** It is made once, in idle time after the page appears
  (`requestIdleCallback`), never per hover. Waking a row is a flag, not a new scene.
- **The images come from the same renderer.** `gallery.snapshot(indices, size)` draws each
  cup at its resting gaze in a corner of the shared canvas, at the size and pixel density the
  live cup will be drawn at, and copies it out in the same task (so nothing shows). The
  handover from image to 3D therefore lands on the same pixels. Patterns are rendered first:
  an image without its pattern would be wrong for the whole session. Images are cached per
  look, size and density for the session, and derived from what the agent stores, so the App
  stores nothing more.
- **Until they exist**, each row shows the flat SVG cup (`cup2d.ts`) with its eyes fixed to
  the right: no three, no WebGL. It is also what remains without WebGL, and once the quality
  governor gives up.
- **Hover** (`pointerenter`, mouse or pen; not touch) calls `wake(i)`: that cup aims at the
  pointer and is drawn. `onShown(indices)` fires in the same task as the frame that first
  draws it, and the page hides that row's image then, so there is no flash.
- **Leave** calls `rest(i)`: the cup eases back to its resting gaze; once it has settled it is
  no longer drawn, `onShown` fires again and the image returns. The canvas is then empty and
  stops drawing entirely.
- **A cup at rest does not even read its box** on `pointermove`, and the canvas is only cleared
  when something was on it: a still sidebar draws 0 frames.
- **Reduced motion**: the images stay, hovering wakes nothing.

**Same pixels and exact colour parity (`gl.readPixels` → 2D `srgb`).**
- Testing the cup's body centre (`cupBodyPixel`) confirmed it is already fully opaque
  (`rgba(63, 95, 127, 255)` = `#3f5f7f` on the `deepBlue` goblet, `alpha = 255`, `R, G, B ≤ A`)
  and does not shift over a `#ff00ff` magenta background.
- The visual difference between a live WebGL canvas and its `<img>` snapshot came from two
  separate browser paths: WebGL swapchain colour-space/compositing vs 2D `drawImage` + PNG decoding,
  plus viewport/camera aspect differences (`place(left, top, ...)` vs `place(0, 0, ...)`).
- **Best outcome (now the single path in `renderer.ts`):** In resting mode, WebGL renders offscreen
  at `place(0, 0, pixels, pixels, density)` with `aimCamera(entry, 1)` and transfers the tile via
  `gl.readPixels` → un-premultiplied `ImageData` → `putImageData` onto an explicit `colorSpace: 'srgb'`
  2D context for **both** the live `.side-canvas` and `snapshot()` (`toDataURL('image/png')`).
- Because sidebar avatars are at most `64 × 64 px` (`16 KB` per tile) and at most 2 cups are live at
  once, `gl.readPixels` costs `< 0.4 ms` while guaranteeing byte-identical pixels (`Δ = 0`) across
  light/dark themes and `100 %`, `125 %` and `150 %` display scaling.

### Agents that think

Who thinks is live status from the App, never part of the stored look.

- **Everyone who thinks** keeps their image and gets a small SVG steam over it (`.agent-steam`).
  The whole box rises and fades (`transform` and `opacity` only), so the browser hands it to the
  graphics card and repaints nothing, even with 40 agents. Duration and delay vary per row
  (`--phase`), so no two agents steam in unison. Static with reduced motion.
- **Two cups at most are live** with their own personality and real steam: the agent that is
  open, and the one under the pointer. That bound does not grow with the number of agents.
  A first version gave 1 to 3 "live slots" to visible thinkers; it slowed the page down (a
  thinker reshapes its eyes and steam on every frame and never settles, unlike a hover) and was
  removed.
- **A live thinker** (`GalleryOptions.act`, `setActing(i, on)`) is driven by its own performer
  (`createPerformer(seed)`, seed from the agent id, personality from its look). Its pose is
  blended in from the resting pose over `ACT_BLEND` (0.45 s), and back when it stops: only when
  the blend is at 0 and the steam is gone does its image return.
- **While the list scrolls, everything is an image** (`gallery.sleep()`): the browser scrolls
  the list before the canvas can be redrawn, so a live cup would trail behind its row. Life
  resumes 160 ms after the last scroll event.
- **Cadence.** Thinking alone runs at 30 fps at most (`ACT_FPS`).

The page offers cases rather than a count, on 40 agents: nobody, light (the latest agent), heavy
(five near the top and one near the bottom), everybody.

### How many can this device handle?

Not from a spec sheet. Three steps, in order of trust:

1. **A hint to start from** (`suggestTier`): cores, memory, data-saver. Browsers round or hide
   these, so it only picks between `High` (`2×`, `60 fps`) and `Balanced` (`1.5×`, `30 fps`).
2. **Measurement while it runs** (`createGovernor` with `floor: 'balanced'`): the 95th percentile
   of CPU time per frame against the 6 ms budget, *and* the cadence actually held. When `High`
   runs over budget, it steps down to `Balanced` (`1.5×`, `30 fps`) and never drops lower (`1×`
   looks too pixelated at `24–32 px`). Static SVG cups are used only when WebGL is unavailable.
3. **Memory** (`localStorage`, `cups.quality` & `cups.quality.locked`): picking a quality button
   locks that tier (`adaptive = false`) across reloads so `Balanced` never switches down automatically.


All cups use `AVATAR_FRAME` (`cup2d.ts`), which fits the tallest cup with a hat or headphones
(3.05 units) and nothing more: the editor's accessory frame leaves too much empty space at 32 px.

## 2. Performance while moving

The page has a **Measure** button. It builds a throwaway gallery off screen, moves a
synthetic cursor for 3 s, and reports, for *One large cup (320 px)* and *Sidebar, 10
agents (32 px)*, where the cursor sweeps the column and the row under it is woken, as on the page:

- frames drawn, frames per second held, and CPU milliseconds per frame (mean, p95, max);
- **idle frames**: frames drawn in the 2 s after the cursor stopped, which must be 0
  (this is the claim "no frames while idle" turned into a number);
- the device (cores, memory, screen ratio, GPU name).

CPU milliseconds are the time spent preparing and submitting each frame
(`GalleryOptions.onFrame`). **GPU time is not visible from a page**; for it, use the
Performance panel in the browser's developer tools.

**Low-end testing.** The *Simulated CPU* select makes every frame wait `(k − 1)×` its
own cost (k = 2, 4, 6) and reports the scaled cost, which is a fair stand-in for a CPU
k times slower. Chrome's own *CPU throttling* (4×, 6×) in the Performance panel does
the same for the whole page, GPU process aside. Neither slows the GPU: a phone with a
weak GPU needs a real phone.

**What happens on a slow device.** `quality.ts` defines four levels:

| level | pixel density | frames per second while moving |
|---|---|---|
| high | up to 2× | 60 |
| balanced | up to 1.5× | 30 |
| low | 1× | 20 |
| static | no canvas | none: SVG cups, eyes fixed to the right |

`createGovernor()` takes the `onFrame` samples. Every 60 frames it judges the 95th
percentile of CPU cost against `COST_BUDGET_MS` (6 ms) and the cadence actually held;
if the level is over, it steps one level down. It never climbs back up in a session
(no oscillation). The sidebar page wires it up and reports each step.

Before measuring on a real machine, one number from Node (no GPU, no draw calls):
updating the eyes of 10 cups costs about 0.23 ms per frame. With images at rest only one cup is
updated and drawn at a time, so the sidebar costs about what one small cup costs.

## 3. What the App stores for an agent

`agent-look.ts`, one small JSON document, validated on every read:

```json
{"v":1,"cup":"teacup","colour":"sage","accessories":["paintbrush"],"personality":"focused"}
```

- `v`: format version, `1`.
- `cup`: one of the 18 vessel ids.
- exactly one of `colour` (a palette id, for everyday cups) or `design` (a pattern id,
  for the 6 cultural cups). The cup decides which; the other one is refused.
- `accessories`: a list of at most **1** (`MAX_ACCESSORIES`) ids among `paintbrush`,
  `leaf` (shown as *Sprout*), `beret`, `tea-bag`, `headphones`, `scarf`. A list so the
  limit can be lifted later without changing the format; one today because they all
  sit in the same places around the face and rim. The lid is part of the vessel, not an
  accessory.
- `personality`: one of the 6 personality ids.
- nothing else: the expression is chosen live by the agent and never stored; unknown
  fields are dropped.

At most 160 bytes (`AGENT_LOOK_MAX_BYTES`; the longest possible look is well under that, and a
test checks every combination). `normaliseAgentLook(anything)` never throws: it returns a
valid look and a list of what it had to fix, so a bad row never breaks a sidebar.
`defaultAgentLook(agentId)` gives an agent that has not chosen yet a stable look derived
from its id. `agent-look.ts` has no dependency (no three, no Vue); a test keeps its
id lists equal to the real catalogues.

## The sidebar mock-up

Modelled on the app's sidebar (organisation picker, navigation, a list, account and
credits at the bottom), with grey boxes standing in for everything that is not agents.
The recent-chats list is replaced by **Agents**: a cup and a name per row, the current
agent highlighted, a collapsed mode that keeps only the cups. Row height is the cup box
plus 12 px (44 px at 32 px).

## Verified results

1. **Build & tests:** `vue-tsc --noEmit`, `vite build`, and all unit tests in `renderer.test.ts`,
   `AgentSidebar.test.ts` and `quality.test.ts` pass.
2. **Colour & pixel parity:** `gl.readPixels` → `srgb` 2D `putImageData` matches the live canvas
   and resting PNG snapshot within `Δ = 0` colour units in both `light` and `dark` themes at
   `100 %`, `125 %` and `150 %` display scaling, with opaque cup-body centre pixels (`alpha = 255`).
3. **Quality floor & frame pacing:** `High` (`2×`, `60 fps`) steps down at most to `Balanced`
   (`1.5×`, `30 fps`), manual selection locks the tier, and `30 fps` thinking/frame-pacing does not
   trigger false step-downs.
4. **Benchmark (10-agent sidebar in Chrome):** `60 fps` while moving (`~0.6 ms` mean CPU cost,
   `~1.1 ms` p95, well inside the `6 ms` budget) and `0` idle frames after settling.
