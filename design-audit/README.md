# Horizon reference audit

Literal overlay comparison between the Horizon Homes Dribbble dashboard
(`horizon-homes/exports/01-cabinet-dashboard.png`) and the ResearchGraph
dashboard at 1440×1000.

## Method

- Cropped the reference content shell and the ResearchGraph content area
  (excluding the left navigation) to comparable regions.
- Scaled both to 900×600.
- Produced a 50% blend (`horizon-overlay-50.png`) and an amplified
  per-pixel difference (`horizon-diff.png`).

## Result

| Metric | Before | After |
| --- | --- | --- |
| Mean RGB difference | 24.3 / 24.0 / 18.5 | 20.3 / 19.0 / 15.6 |
| Dominant reference surface | `#343332` | `#343332` |
| Dominant app surface | `#292725` | `#302F2D`–`#3A3937` |

Palette, type and card treatment now line up: Manrope, warm neutral
charcoal shell, `#F3703F` orange, `#82E78F` green, translucent charcoal
cards, 18px card radius.

## Remaining difference

The remaining diff is structural, not tonal:

- ResearchGraph keeps its persistent left navigation; the reference uses a
  top navigation bar.
- The two products show different content (research sources vs properties),
  so charts, labels and the right rail cannot be pixel-identical.

Adding a literal overlay of different content will always show differences
in those regions; the surface-level match is what was measured and fixed.
