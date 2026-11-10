# Huitaca Cups lab

## Current pass: two rows, twelve shapes

Preview: <http://localhost:5190/cups>. Original bloub: <http://localhost:5190/>.
First six approved and committed locally at `ed76d29`. No pushes.
The next six are also approved for a local commit. The broader lab brief remains open.

### Second row, visually approved

- Added in the reference's order: footed bowl, round bowl, rimmed cup,
  rounded tumbler, goblet, and round mug.
- All six reuse the existing JSON outlines, unlit palette, recessed dark interiors,
  surface-following eyes and shared renderer. No new geometry code or dependency.
- The bowls have separate low feet. The rimmed cup has a thick collar. The goblet
  has a short stem and broad foot. The round mug uses the approved 1.3x handle
  flares over 0.24 units, with both terminal rings buried inside its outer wall.
- The approved first six JSON entries are unchanged. Desktop keeps six columns;
  below 64rem, three columns. Labels now count through 12 rather than 010–012.
- Generated six matching 512px fallback PNGs from the real renderer, without
  posting static previews. Review the shapes directly in `/cups`.
- Strict TypeScript, production build and all 51 focused cup tests pass. These
  cover all twelve surfaces and gaze extremes, handle joins, lid and renderer;
  new overhead-ray checks confirm clear openings into all six new interiors.
- Live pane: all twelve labels are present, one canvas has rendered, and the
  three-column narrow layout has no horizontal overflow.
- The validation table below records the first-row checkpoint, not new performance
  measurements for twelve cups.

![Earlier shape study, before the flared-handle pass](docs/cups-top-row.png)

### What was tried

- Six silhouettes in the reference's order: mug, tall mug, teacup with saucer,
  tumbler, takeaway with lid, small cup.
- Grey exteriors, darker recessed interiors, white capsule eyes. No patterns,
  lighting, shadows, transparency, or decorative colours.
- Separate revolved outer walls, thin rims, inner walls and floors. Saucer and
  lid are their own outlines. Handles use tubes along JSON curve points.
- Review correction: the small cup's lower handle stopped at the outer wall,
  leaving part of its open tube end visible. Extended its last JSON point inward
  from X=0.65 to X=0.58 without changing the rest of the cup. A regression checks
  that both complete terminal rings sit inside the wall. Refreshed its fallback
  PNG and the row preview; comparison: `docs/small-cup-handle-fix.png`.
- Next review: the teacup also had an exposed lower tube end. Fixed its overlap
  and tried Alessandro's chosen gentle flares on all four handled vessels.
  `handle.flare.length` sets the affected distance from either end in vessel
  units; `handle.flare.scale` sets the endpoint radius multiplier. After trials
  at 1.6x and 1.4x, Alessandro selected 1.3x on all four handles, over 0.24 units.
  Smoothstep blends back to the unchanged middle radius.
  This deforms existing TubeGeometry rings once at construction, adding no
  vertices, triangles, meshes, or per-frame calculations. It is an overlapping
  flared attachment, not a welded or boolean-unioned ceramic fillet.
  Endpoints were extended to bury the wider terminal rings. Regression tests now
  cover both ends of every handle, not just the small cup. All four fallback
  PNGs were refreshed. Earlier review images remain historical; no new static
  previews were generated for this pass.
- Takeaway lid: following the real-lid reference, replaced the closed rotational
  top with a generated surface and a raised lip around the viewer-right opening. An enlarged capsule
  slot passes through the lid into the dark cup interior. There is no hidden
  underside disk blocking the opening and no painted-on hole. A short dark
  throat gives the opening depth; `anchors.steam` sits at its centre for a later
  steam effect. The cap, its skirt, and the throat come from the optional JSON
  `lid` definition, without a model or boolean operation. No steam animation yet.
  Refreshed the takeaway fallback without posting another static preview.
  Final review removed the full-width ramp and its horn-like corners: only a
  narrow capsule-shaped lip rises now, with a flat outer edge. The opening is
  0.44 × 0.26, centred at `[0.40, 0]` and turned 90 degrees in the lid plane.
  Its lip uses a 0.04-unit margin and 0.08-unit falloff; the steam anchor follows it.
- A 16-degree elevated orthographic view. The slider offers 0–32 degrees.
- Eyes follow the pointer within the JSON face zone; the body turns a little too.
  Eye vertices follow the actual curved wall, so they rotate and foreshorten with it.
- A simple triangulated capsule initially clipped through the convex teacup wall.
  A subdivided capsule surface fixes this. Tests check triangle interiors as well
  as vertices, including all extremes of the gaze.
- Slow turning is opt-in. With it off, mouse following settles and stops drawing.
  This resolves the tension between continuous idle animation and zero idle work.
- One shared WebGL canvas with scissor viewports for the entire shape study.
  Pixel density is capped at 2. Hidden tabs cancel scheduled rendering.
- Runtime reduced-motion changes switch to static PNGs. Failure to create WebGL
  also selects PNGs. PNGs use the same geometry and camera as the live renderer,
  not a separate drawing.
- `exportCupPng(vessel, size)` in `src/cups/renderer.ts` returns a transparent PNG
  data URL for integer sizes from 1 to 4096. Six 512px fallbacks are checked in
  under `public/cups/stills/`.

### Alessandro's decisions

Requested: a NEW screen, plain monochrome shapes and darker interiors.
The first six and the final lid correction are approved for a local commit.
Next: the reference's second row of six. No push requested.

Selected for the current trial: fix the teacup gap and add gentle flared joins.
Approved handle flare scale: 1.3x.
Lid trial: raised on one side, with an artistically enlarged sipping opening,
without the reference's lettering or moulded details.
Review directly in the live screen; do not post static previews every iteration.

The first row's current appearance is approved as the starting point. Later
material, expression and interaction studies can build on it.

Glass look: not compared or selected yet.
Sidebar A versus B: not built or selected yet.

## Validation and initial measurements

| Check | Result |
| --- | --- |
| Full test suite at the first-row checkpoint | 242 passing tests in 17 files |
| Current focused geometry and lid checks | 26 passing tests in 2 files |
| Strict TypeScript and production build | Pass |
| Shared canvas count | 1 |
| Idle rendering in the live preview | 0 new frames during an 800ms observation |
| Settled mouse-follow rendering | 0 new frames during another 800ms observation |
| Density cap | 3x input produces a 2x backing buffer in the renderer test |
| Reduced-motion live preview | All 6 static PNGs loaded; canvas hidden |
| Lazy renderer including Three.js | 558.78 kB minified / 140.56 kB gzip |
| Cup page code and vessel data | 8.25 kB minified / 3.00 kB gzip |
| Cup page CSS | 2.96 kB / 1.15 kB gzip |
| Original screen | Mounted normally; no Three.js request observed |

The bundle values come from the production Vite build, not development requests.
The full suite and production build were rerun for the first-row commit.
Lid checks cover the clear passage into the cup, the local raised lip and flat
outer edge, visibility during turns, finite geometry, and the future steam anchor.
Vite warns that the lazy renderer exceeds 500 kB before gzip. It is never in the
original screen's download path and is not requested on initial reduced-motion
visits.

Zero rendered frames is NOT a CPU-utilisation measurement. Laptop CPU percentage,
single-cup frame time, and sidebar A/B frame time remain unmeasured and deferred
with those later studies. Do not interpret this table as the final performance
comparison requested in the broader brief.

The Factory browser pane does not support viewport emulation or creating another
tab via CDP here. Actual background-tab switching could not be tested in that
pane. Hidden/resume cancellation, motion-preference changes, pointer settling,
and cleanup are covered by DOM lifecycle tests. Reduced-motion PNG switching and
pointer following were also checked in the live browser.

On this Windows setup `pnpm build` could not resolve its local `vue-tsc` command,
even with the local binary directory on PATH. The identical build steps passed
when invoked directly:

```powershell
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
node node_modules/vite/bin/vite.js build
node node_modules/vitest/vitest.mjs run --reporter=default --no-color
```

The current preview server was started with
`node node_modules/vite/bin/vite.js --host 127.0.0.1`.

## Vessel JSON format

`src/cups/vessels.json` is an array of vessel definitions. Units are arbitrary
and shared by every vessel. Y points up. An outline point is `[radius, height]`;
handle and accessory-anchor points are `[x, y, z]`. The front faces positive Z.

- `parts`: named revolved outlines, each naming a material preset and colour slot.
  Only `flat` is implemented in this first pass.
- `handle`: a curve, tube radius and colour slot, or `null`. Optional `flare`
  adds a smooth widening near both attachments, with `length` in vessel units
  and `scale` as a radius multiplier. Omit it for a constant-radius tube.
- `lid` (optional): top radius, base height, cap height, lip rise, and
  `raise.margin` / `raise.falloff`; outer/interior colour slots; and a capsule `opening`
  with `[x, z]` centre, angle in degrees, width, depth and throat-wall depth. Its generated top
  replaces the closed cap, while the rotational `parts` keep the lid's brim.
- `face`: supporting part, centre height, surface-space zone dimensions, capsule
  dimensions, eye-centre separation, and colour slot.
- `anchors`: named accessory attachment points. Nothing attaches to them yet.
- `colors`: palette slots, independent of the rendering code.

Complete example, the current mug:

```json
{
  "id": "mug",
  "name": "Mug",
  "colors": {
    "body": "#959693",
    "inside": "#626460",
    "rim": "#a3a49f",
    "eyes": "#fffef9"
  },
  "parts": [
    {
      "id": "body",
      "material": "flat",
      "color": "body",
      "outline": [[0,0],[0.66,0],[0.74,0.025],[0.78,0.07],[0.79,0.16],[0.79,1.75],[0.78,1.82]]
    },
    {
      "id": "rim",
      "material": "flat",
      "color": "rim",
      "outline": [[0.78,1.82],[0.77,1.845],[0.72,1.845],[0.70,1.82]]
    },
    {
      "id": "inside",
      "material": "flat",
      "color": "inside",
      "outline": [[0.70,1.82],[0.70,0.22],[0.65,0.16],[0,0.16]]
    }
  ],
  "handle": {
    "color": "body",
    "radius": 0.105,
    "flare": { "length": 0.24, "scale": 1.3 },
    "points": [[0.73,1.47,0],[1.10,1.50,0],[1.32,1.25,0],[1.34,0.93,0],[1.19,0.61,0],[0.69,0.46,0]]
  },
  "face": {
    "surface": "body",
    "centerY": 1.04,
    "width": 0.98,
    "height": 0.72,
    "eyeWidth": 0.17,
    "eyeHeight": 0.37,
    "separation": 0.39,
    "color": "eyes"
  },
  "anchors": {
    "top": [0,1.845,0],
    "handle": [1.34,0.93,0]
  }
}
```

The original Jérémy Perret MIT licence remains unchanged in `LICENSE`.

## Open questions / later passes

1. Add and review the reference's second row, preserving the approved first six.
2. Shall the openings be this visible, or closer to the reference's shallower view?
3. Eye size, position, and roundness; how far should their gaze and bodies follow?
4. Turning remains optional until the visual and idle-power tradeoff is chosen.
5. Russian glass A/B/C, metal/clay presets, recolourable patterns, Islamic glass,
   kulhad, bowl, and the two sidebar implementations are deliberately deferred.
6. Regenerate fallback PNGs after any geometry, palette, face or default-camera edit.
