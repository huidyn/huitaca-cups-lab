# Cups as agents (page 08 of the lab)

What the App needs from the lab before batch 4.2, and where each answer lives.

## 1. The sidebar: 3D in one canvas, or a static cup?

Both are built, on the same list, in the same box, so they can be compared by eye
at 24, 28 and 32 px (`/cups`, study 08):

- **3D, shared canvas.** One `<canvas>` over the scrolling list, one `.agent-viewport`
  per row. Cups outside the visible list are skipped (`draw()` culls them), and the
  list's `scroll` calls `gallery.refresh()`.
- **Static, 2D eyes.** `cup2d.ts` draws the cup from the same outlines and colours as
  an SVG, and the eyes follow the cursor with one CSS transform per animation frame.
  No WebGL. Simpler accessories (a flat beret, an arc for headphones), no volume.

Both use `AVATAR_FRAME` (`cup2d.ts`), so a row has the same height either way. The
accessory frame of the editor leaves too much empty space at 32 px: the avatar frame
fits the tallest cup with a hat or headphones (3.05 units) and nothing more.

The static cup is also what the user gets with `prefers-reduced-motion`, without
WebGL, and when the quality governor gives up (see 2).

## 2. Performance while moving

The page has a **Measure** button. It builds a throwaway gallery off screen, moves a
synthetic cursor for 3 s, and reports, for *One large cup (320 px)* and *Sidebar, 10
agents (32 px)*:

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
| static | no canvas | none: SVG cups, 2D eyes |

`createGovernor()` takes the `onFrame` samples. Every 60 frames it judges the 95th
percentile of CPU cost against `COST_BUDGET_MS` (6 ms) and the cadence actually held;
if the level is over, it steps one level down. It never climbs back up in a session
(no oscillation). The sidebar page wires it up and reports each step.

Before measuring on a real machine, one number from Node (no GPU, no draw calls):
updating the eyes of 10 cups costs about 0.23 ms per frame.

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
