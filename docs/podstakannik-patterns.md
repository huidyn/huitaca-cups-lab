# Glass with podstakannik: holder ornament studies

## Form and regional context

A podstakannik is a handled metal holder around the lower part of a separate
drinking glass. The decoration therefore belongs to the holder, not to the
glass. The eyes stay on the exposed glass above it.

- [Rodina: "Подстаканник" (Bitkina, 2016)](https://rodina-history.ru/2016/10/18/rodina-podstakannik.html)
  describes Kolchugino production, Vladimir Oblast: brass holders plated with
  nickel and given decorative blackening, and a well-known plate "with little
  windows".
- [Wikimedia Commons: Podstakannik photographs](https://commons.wikimedia.org/wiki/Category:Podstakannik)
  show a row of tall openings near the base and stamped floral relief.
- [Казаковская филигрань](https://ru.wikipedia.org/wiki/Казаковская_филигрань)
  and the [Kazakovo enterprise history](https://xn--h1adpy.xn--p1ai/o-predpriyatii/istoriya-predpriyatiya/)
  document the filigree craft of Kazakovo, Nizhny Novgorod Oblast. It began in
  1939 with a glass holder and has no metal backing, so the work is openwork.
- [Labytnangi Museum: Tea glass holder](https://ar.culture.ru/en/subject/podstakannik-9)
  remains the source for the form.

Left out on purpose: emblems and pictorial scenes (Kremlin, Sputnik, eagles,
troika), which are political or too detailed for an avatar; Kubachi niello, a
Dagestani craft that should not be labelled generically Russian; and the
scalloped upper edge of some holders, which would change the approved shape.

## The glass, without transparency

The glass is not transparent. Blending and sorting would cost more and turn
pale and muddy at avatar size, where the eyes need contrast. Flat colours
carry the idea instead:

1. A brown drink, `#7b4526`, fills the glass up to Y=1.88, below the rim at
   Y=2.10. It is a general brown, not tied to tea or coffee.
2. Above that level the glass is empty: a pale glass tint `#b3d0cb` outside,
   a slightly darker `#93b6b0` on the inner wall, and a light rim `#dcebe8`.
3. A flat drink surface, `#4a2713`, closes the glass at the drink level,
   seen through the opening.
4. Openings in the holder use the drink brown, so the drink reads as
   continuing down inside the metal.

An earlier version took the brown all the way to the rim. Alessandro pointed
out that this read neither as glass nor as a glass with something in it.

The decorated face moves down to Y=1.58 so that the eyes stay in the drink
even at the top of their gaze travel. A white highlight streak was rejected:
it is a lighting cue on an unlit set, it would turn with the cup, and it
competes with the eyes.

The holder and handle are nickel grey `#aeb2b3`, with a darker upper border
`#8f9496`. The blackening ink is charcoal `#3a3d40`. These are flat visual
approximations, not measured metal or glass colours.
Each design uses at most two decorative inks on the nickel: charcoal
blackening and the drink brown seen through openings.

## Three holder designs

1. **Windows (Окошки):** eight tall round-topped openings in a plain sleeve,
   between two dark rules.
2. **Leaf scroll (Растительный орнамент):** four repeats of a running stem
   with curled offshoots, round flowers and broad leaves, bright on a
   blackened band.
3. **Filigree (Казаковская филигрань):** five pairs of mirrored wire scrolls
   with one granule between pairs, on an open ground between two solid nickel
   edges. The wire is drawn far thicker than real filigree.

All three are new simplified compositions, not copies of a factory model. The
repeat counts are composition choices. The Russian subtitles are descriptive
terms ("little windows", "plant ornament", "Kazakovo filigree"), not names of
specific patterns. No symbolic meaning is assigned.

## Rendering

The holder is thin metal: its wall sits 0.03 units outside the glass instead
of 0.06, with a smaller lip and foot. This changes the shared form, so the
grey Shapes still was regenerated too.

The pattern band targets the `holder` part, Y=0.26–1.02, instead of the body.
A decorated variant can give parts and the handle their own colour slots, so
the holder and handle use `metal`. The variant also splits the glass wall and
inner wall at the drink level, which adds two flat meshes: no texture, no
transparency and no extra draw for the pattern.

There is still one patterned draw, with no lighting or shadows. Mask-resolution margin, 2048-pixel cap, DPR limit and on-demand
drawing are unchanged. Research photographs are not redistributed.
