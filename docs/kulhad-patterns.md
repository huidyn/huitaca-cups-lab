# Kulhad: earthy painted-pottery studies

## Form and regional context

A kulhad is a small, handleless earthenware cup, normally unglazed and
undecorated. The illustrated flower, triangles and vine are contemporary
decorations, not authenticated historical kulhad patterns.

The painted-pottery context is Khavda, in Kutch, Gujarat. It is not a
generic style shared by every Indian region. The original vessel's broader
India / South Asia attribution remains unchanged.

- [Khamir: pottery](https://www.khamir.org/crafts/pottery) documents Kachchh
  pottery communities, local clay, white clay and black stone used for
  decoration, and red, black and white clay-based paints.
- [Gaatha: Khavda pottery](https://gaatha.org/Craft-of-India/khavda-pottery-kutch-gujarat/)
  documents geru red earth, khari mitt white soil, geometric decoration and
  plant-inspired motifs including flowers and leaves.
- [Kulhar / kulhad: vessel context](https://en.wikipedia.org/wiki/Kulhar)
  describes the normally undecorated, unglazed cup.

Jaipur blue pottery was also researched. Its glazed, quartz-based body is a
different craft, so it is not used to identify this terracotta cup or its
paint recipes.

## Pigments and chosen flat colours

Alessandro preferred the darker photographed pottery over the illustration's
bright ochre, indigo and green. The sources describe:

- Geru: reddish-brown earth applied as a wash.
- Khari mitt: fine white soil mixed with water.
- Black stone / black clay-based paint: the dark decoration.

They do not identify the photographed olive cast as a green pigment or
establish a particular chemical composition for its black paint. The lab
therefore calls it olive-charcoal, not a traditional green dye.

The chosen unlit equivalents are red-earth body `#b26443`, warm cream
`#e5d9bd` and olive-charcoal `#454638`. These are visual approximations,
not standardized pigment values or colour measurements independent of
lighting and firing. The inside is darker clay `#77402d`; the rim stays
the same terracotta as the body, as on a typical unpainted kulhad. The dark
painted rim of the decorative reference object is not copied. The eyes use
the same cream as the pattern.

Every design uses at most two decorative inks: cream and olive-charcoal.
The terracotta body is the substrate. A cream band counts as an ink, not
as a free extra background colour.

## Three reference-led motifs

1. **Floral fan:** four fans wrap around the cup. Seven rounded teardrop
   petals surround a dark semicircular centre. It preserves the supplied
   illustration's broad flower structure without claiming a named
   traditional flower or a symbolic petal count.
2. **Triangle band:** six repeats of two offset rows of filled triangles,
   dark on cream. Small gaps keep the rows separate at avatar size.
   Geometry is a formal family, not an exclusive community attribution.
3. **Leafy vine:** four repeats of a curving stem and four broad pointed
   leaves, dark on cream. Fine veins and the source pottery's tiny dotted
   outlines are omitted for readability.

The English subtitles are descriptive study labels, not invented native
names. No sacred meaning or prescribed repeat count is assigned.

## Rendering

Only the decorated variant raises the face to Y=1.22. The body band occupies
Y=0.18–0.84, leaving 0.195 units beneath the eyes. The grey Shapes cup,
original face at Y=1.03, outline and handleless form remain unchanged.

The collection uses the existing two-channel mask and one body draw pass.
The shader now combines the two channel coverages directly: sequential
mixes incorrectly let terracotta show through an edge covered entirely by
the two inks. Single-ink designs retain the same coverage formula.
No new meshes, lighting, shadows or material effects are introduced. The
25% mask-resolution margin, 2048-pixel width cap, DPR limit and on-demand
drawing remain unchanged. Research photographs are not redistributed.
