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

**Same pixels.** In resting mode the canvas is given a CSS size that is exactly its pixel grid
(`fit()`), and each live cup is placed on whole device pixels, rounded from the page the way the
browser rounds the row's image (`place()`). A canvas whose size is not a whole number of device
pixels is stretched, which blurred the live cup and moved it by a pixel next to its image.

### Agents that think

Who thinks is live status from the App, never part of the stored look. The sidebar takes it per
agent and decides who gets the full 3D treatment:

- **Live slots** (`LIVE_SLOTS`, `quality.ts`): 3 at high, 2 at balanced, 1 at low, 0 at static.
  They go to the thinking agents nearest the top of what is *visible* in the list (the App sorts
  by last conversation, so that is where they usually are). The hovered row always gets one more.
  A row scrolled out of view gives its slot back.
- **A live thinker** (`GalleryOptions.act`, `setActing(i, on)`) is driven by its own performer
  (`createPerformer(seed)`, seed from the agent id, personality from its look), with real steam.
  Its pose is blended in from the resting pose over `ACT_BLEND` (0.45 s).
- **No unison.** Each agent has its own seed, so blinks, glances and the thinking look fall at
  different times even for two agents with the same personality; each steam reads the clock with
  its own offset (`STEAM_PHASE`).
- **The others** keep their image and get a small SVG steam over it (`.agent-steam`): three wisps
  with three different periods and a per-row delay (`--phase`), animated by CSS only. Static with
  reduced motion.
- **Stopping.** `setActing(i, false)` and `performer.setThinking(false)`: the steam fades by
  itself, the pose blends back to rest, and only when the blend is at 0 and the steam is gone is
  the cup no longer drawn and its image returns. Weight 0 *is* the image, so nothing jumps.
- **Cadence.** Thinking alone runs at 30 fps at most (`ACT_FPS`); a hover brings back the level's
  own cadence.

The page offers cases rather than a count, on 40 agents: nobody, light (the latest agent), heavy
(five near the top and one near the bottom), everybody.

### How many can this device handle?

Not from a spec sheet. Three steps, in order of trust:

1. **A hint to start from** (`suggestTier`): cores, memory, data-saver. Browsers round or hide
   these, so it only picks the starting level.
2. **Measurement while it runs** (`createGovernor`): the 95th percentile of CPU time per frame
   against the 6 ms budget, *and* the cadence actually held. GPU time is not readable from a
   page, but a GPU that cannot keep up shows as missed frames, which is why cadence counts.
   When a level is over, it steps down: fewer live slots first of all, then density and cadence
   (one level carries all three).
3. **Memory** (`localStorage`, `cups.quality`): the level reached is kept, so the next visit
   starts there and does not stutter its way down again.


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

## To verify (written without running it)

The thinking agents, the pixel snapping and the device hint were written and committed without
being built, tested or opened in a browser. To check, in this order:

1. `pnpm build`, then `pnpm test`. Expected to need updates: `AgentSidebar.test.ts` and the
   sidebar test in `CupsLab.test.ts` (the list is 40 agents now, the counts are 10/20/40, the
   gallery mock needs `setActing` and `setSteamColor`, `snapshot` is called in batches of 8),
   `renderer.test.ts` (resting mode now sizes the canvas from its parent and calls
   `setViewport` through `place()`), `quality.test.ts` (new `LIVE_SLOTS`, `suggestTier`,
   `lowerTier`), and anything asserting the bench scenarios (a third one, `thinking`).
2. In the browser, page 08, light and dark: hover in and out of a row and look for any 1 px
   shift or colour change between image and live cup, at 100 %, 125 % and 150 % display scaling.
3. Thinking cases: *Light*, *Heavy*, *Everybody*. Live thinkers must not move in unison; the
   others show the SVG steam; switching to *Nobody* must ease each one back to its image, and
   the frame counter must then stop.
4. Scroll the list while *Everybody* thinks: slots follow what is visible.
5. Measure: the third scenario, and that *Idle* is 0 for both sidebar scenarios.
