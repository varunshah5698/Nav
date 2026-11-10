# Canva-ready stills

Static captures of the Horizon Homes prototype (`../index.html`) for a Canva deck, Figma board, or design handoff.

## Desktop — 1600px wide
1. `01-cabinet-dashboard.png` — My cabinet overview
2. `02-cabinet-portfolio.png` — Portfolio tab
3. `03-cabinet-statistics.png` — Statistics tab
4. `04-properties.png` — full property book (full-page capture, 1600×1133)
5. `05-property-detail.png` — property detail page
6. `06-analytics.png` — market analytics (full-page capture, 1600×1042)
7. `07-about.png` — What is Horizon?
8. `08-tools.png` — mortgage and rental yield calculators
9. `09-add-property-dialog.png` — add-property flow

## Mobile — 390×844 @2x
10. `10-mobile-cabinet.png`
11. `11-mobile-properties.png`
12. `12-mobile-property-detail.png`

## Import into Canva
Canva → **Uploads** → select the PNGs, or drag them onto a presentation page. These are raster stills, not an editable Canva file. The live prototype is interactive: filters, search, calculators, property details, and the add-property flow all work.

Sample data persists in the browser via `localStorage`; use **Reset demo data** under the profile card to restore the starting set.

## Notes
- Property imagery is gradient placeholder art, not photography. Swap in real images before production.
- Cross-browser checks passed in Chromium and WebKit (Safari engine) at 390px, 768px, and 1440px with no horizontal overflow. Firefox was not verified.
- The captures use the sample dataset with no user additions.
