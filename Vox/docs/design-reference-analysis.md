# Design reference analysis

**Sole visual authority:** Dribbble shot 26892320, *"Healthcare CRM Dashboard UI
– Clinexa"* (<https://dribbble.com/shots/26892320-Healthcare-CRM-Dashboard-UI-Clinexa>).

No other dashboard template, kit or design system was used. Everything below was
derived from inspecting the shot itself, then mapped onto VoxSafe's domain. The
sampled images were kept outside version control (`.design-refs/`) because the
artwork is third-party material.

## 1. What was inspected

- The full dashboard composition: persistent left rail, top header, content grid.
- Colour: sampled from the artwork (rail tile, accents, page field, sunken
  wells, hairlines, ink).
- Typography: one geometric-humanist sans, tight tracking on headings, small
  uppercase labels, tabular numerals for metrics.
- Surfaces: white cards on a very light blue field, hairline strokes, almost no
  shadow, generous internal padding.
- Components: pill segmented filters, compact status badges, dense but airy
  tables, KPI tiles with a label above a large number, charts with muted grid
  lines and one saturated series colour.

## 2. Sampled palette

| Token | Hex | Where it came from / how it is used |
|---|---|---|
| `--vs-primary` | `#4D5BAD` | Active navigation tile and primary actions. The reference's most saturated surface. |
| `--vs-primary-hover` | `#3F4C99` | Pressed/hover state of the same indigo. |
| `--vs-primary-soft` | `#E7EAF9` | Selected pill and icon wells. |
| `--vs-periwinkle` | `#8FA4E4` | Secondary chart series. |
| `--vs-lavender` | `#C3CAFC` | Accent fills, dashed guides, timeline band. |
| `--vs-sage` | `#B4DAAA` | Positive/"operational" fills. |
| `--vs-sage-ink` | `#4F6B50` | Text on sage. |
| `--vs-teal` | `#78A3B2` | Third chart series, cool counterweight. |
| `--vs-amber` | `#F8D29A` | Attention fill (review state). |
| `--vs-clay` | `#C2564C` | Distress/locked states. Deliberately the only warm-alarm colour. |
| `--vs-clay-soft` | `#F7E6E3` | Background for clay badges and banners. |
| `--vs-canvas` | `#E9EEF8` | Outer app backdrop; the reference sits on a soft lavender-blue field. |
| `--vs-page` | `#F4F7FC` | Main content field. |
| `--vs-surface` | `#FFFFFF` | Cards. |
| `--vs-sunken` | `#EEF2F9` | Segmented control track. |
| `--vs-sunken-strong` | `#E3E9F9` | Rail hover, muted blocks. |
| `--vs-line` | `#E5EBF4` | Hairline card borders and table rules. |
| `--vs-line-strong` | `#D6DFEC` | Input borders, dashed empty-state frames. |
| `--vs-ink` | `#060607` | Headings and primary numbers. Near-black, not pure black. |
| `--vs-ink-2` | `#434F5F` | Body text. |
| `--vs-muted` | `#7C879B` | Secondary text. |
| `--vs-faint` | `#A6B0C2` | Labels, metadata, uppercase captions. |

Contrast: `#060607`, `#434F5F` and `#7C879B` on `#FFFFFF`/`#F4F7FC` clear WCAG AA
for body text; `#A6B0C2` is used only for non-essential labels at ≥ 10 px
(≈ 3.0:1) and is never the sole carrier of state.

## 3. Typography

One family: **Instrument Sans Variable** (self-hosted via
`@fontsource-variable/instrument-sans`, so there is no third-party font request
at runtime).

| Role | Size / weight | Tracking |
|---|---|---|
| Page title | 22 px / 600 | −0.01 em |
| Section title | 15 px / 600 | −0.02 em |
| Body | 14 px / 400 | 0 |
| Table cell | 11.5–12.5 px / 400–500 | 0 |
| Meta | 12 px / 400 | 0 |
| Uppercase label | 11 px / 600 | +0.06 em |
| KPI number | 22–30 px / 600 | −0.02 em, tabular numerals |

The reference's hierarchy is small-scale and precise rather than large and
decorative: the biggest element on a screen is usually the metric number, not a
headline.

## 4. Layout rules carried over

- **Rail:** 76 px wide, icon-only, one rounded 12 px tile per destination; the
  active tile is filled `--vs-primary` with a white icon. A 3 px indicator is
  not used — the fill is the state, exactly as in the reference.
- **Header:** 68 px tall, hairline bottom border, page title and one-line
  description on the left, actions on the right, account cluster far right.
- **Content:** max 1440 px, 16–24 px gutters, cards in a 4-up KPI row then a
  2-column analytics/filter region. Cards keep their own internal padding
  (16–24 px); the grid supplies the rhythm.
- **Radii:** cards 18 px, inner wells 12 px, fields 11 px, pills 999 px. Nothing
  is square, nothing is bubbly.
- **Borders over shadows:** a single hairline (`--vs-line`) defines a card; the
  shadow is a 14 px offset at 3 % opacity, felt rather than seen.
- **Density:** tables are compact (≈ 44 px rows) but never cramped; secondary
  metadata is 9.5–10.5 px mono and lives under the primary cell text.
- **Spacing scale:** 4 px base with an 8/12/16/20 rhythm — the reference's own
  cadence.

## 5. Component patterns reproduced

- **Segmented pill filters** on a `--vs-sunken` track; selected segment is white
  with a hairline border and `--vs-ink` label.
- **Status badges**: pill, 11 px, tinted background + darker ink, always paired
  with text and often an icon.
- **KPI tile**: uppercase label, large number, one line of provenance
  ("Computed from stored call records"), never a fabricated delta.
- **Data table**: uppercase 10 px header row, hairline row rules, hover tint,
  first column carries the identity plus a mono suffix.
- **Chart**: muted horizontal grid, no chart border, one saturated line/series,
  tooltip on a white card with the same radius language.
- **Empty state**: dashed `--vs-line-strong` frame, icon well, one sentence of
  explanation and (where useful) the action that creates data.

## 6. Where VoxSafe deliberately differs from the reference

- **Domain truth over decoration.** The reference is a healthcare CRM; VoxSafe
  shows a policy layer, evidence and an audit chain. The layout language is
  identical; the content is not a re-skin of patient cards.
- **No invented data.** The reference's charts are populated for a demo. VoxSafe
  renders real counts only, so most first-run screens are empty states — by
  design (see `docs/architecture.md`, "Empty states").
- **Alarm colour discipline.** Clay red appears only for distress/lock states
  and never as a general accent, so severity reads instantly.
- **Motion.** The authenticated app is essentially static; 3D exists only on the
  landing page and a restrained panel on login, honouring
  `prefers-reduced-motion`.
- **Accessibility.** Colour is never the only signal: every action/status badge
  carries a word, every chart has a table or legend, focus rings use the primary
  colour at 2 px.

## 7. Design-token implementation

Tokens live in [`frontend/src/styles/design-tokens.css`](../frontend/src/styles/design-tokens.css)
and are exposed to Tailwind through `frontend/tailwind.config.js`
(`canvas`, `page`, `surface`, `sunken`, `line`, `ink`, `primary`, `sage`,
`amber`, `clay`, …). The component layer (`frontend/src/styles/app.css`) defines
`.vs-card`, `.vs-btn`, `.vs-input`, `.vs-badge`, `.vs-tab`, `.vs-label`,
`.vs-mono`, `.vs-num` so a page never re-invents a surface.

Any new screen must be assembled from those primitives. Changing a token changes
every workspace consistently — that is the point of deriving them from the
reference rather than per-page styling.

## 8. If the reference is ever unavailable

This analysis is the record of the reference as inspected during the build. If
the shot is removed, do not invent a replacement visual system: use the sampled
values above, which are the measured evidence, and treat any new visual direction
as a deliberate, documented design decision.
