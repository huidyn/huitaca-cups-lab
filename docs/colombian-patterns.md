# Colombian clay mug: contemporary pattern studies

The clay mug uses the reference's terracotta `#b5533c` and cream `#f3eadb`.
These are new geometric drawings, not authenticated reproductions of a
particular Indigenous community's symbols.

## References and attribution limits

- Luz Helena Ballestas Rincón,
  [Relaciones formales de la gráfica precolombina de Colombia, México y Perú](https://www.americanistas.es/wp-content/uploads/2024/10/19-005-Ballestas-Rincon-Luz-Helena-Relaciones-formales-de-la-grafica-precolombina-de-Colombia-Mexico-y-Peru-Congreso-Santiago-de-Compostela-Universidade-de-Santiago-de-Compostela-2022-1.pdf):
  Colombian ceramic correspondence examples, figure 1 / printed page 44;
  Colombian spiral morphology, figure 5 / printed page 45.
  The regional tables must not be mixed together as a generic pattern library.
- [Artesanías de Colombia: Ráquira, de arcilla a objeto artesanal](https://artesaniasdecolombia.com.co/PortalAC/Noticia/colombia-artesanal-raquira-de-arcilla-a-objeto-artesanal_6273)
  documents pottery practice. It is context for the clay vessel, not evidence
  that the three ornaments originate in Ráquira.
- Alessandro's supplied mug illustration and subsequent ceramic crops guide
  the visible compositions. The crops show useful structures, but do not by
  themselves establish the maker, community, meaning or reproduction rights.
  Research photographs and the academic PDF are not shipped with the lab.

The paper discusses culturally specific forms, including Nariño reflected
triangles and Quimbaya positive-negative compositions. The lab does not borrow
those names for unrelated geometry or invent spiritual meanings. No consulted
source establishes universal repeat counts or grants blanket permission to
adapt sacred or community-specific imagery.

## The three choices

1. **Stepped band / Banda escalonada.** Retains the first mug illustration's
   two stair levels, broad troughs and separate upper rule. Six repeats,
   offset so the front falls on an upper plateau. Unchanged by the latest
   revisions.
2. **Square spirals / Espirales cuadradas.** Restores the exact design that
   previously occupied the third slot in the staged version, now in slot two.
   Eight open square spirals sit below a separate upper rule. The proposed
   round-spiral replacements are no longer selectable.
3. **Diagonal band / Triángulos y diagonales.** Following Alessandro's clarified
   sketch, closed upright and inverted triangles alternate with groups of
   three falling and two rising parallel diagonals, framed by two rules.
   Two complete repeats leave space for the triangle centres. Strokes are
   75% thicker than the earlier nested-angle version; rail thickness rises
   from 10% to 12% of band height.
   Each triangle is centred between its flanking diagonals. All diagonal
   strokes reach both rail centres, with flat ends hidden inside the rails.

The alternate crop with paired angular spirals remains a research reference,
not an additional selectable pattern.

## Rendering

The existing unlit channel-mask shader handles all three designs. There are no
additional meshes, passes, lights or shadows. SVG geometry is generated when
the mask changes, not on each rendered frame. The handle and grey Shapes
geometry remain unchanged.

The decorated mug raises the eyes to Y=1.16 above the Y=0.12–0.82 band,
leaving 0.155 units of clear space. At a 512px export the mask is 1024 × 136;
its capped size is 2048 × 272, below the existing yunomi mask area. Native
64px renders were inspected for the stepped band, square spirals and diagonals.
These are rendering checks and texture dimensions, not low-end hardware
performance measurements.
