# Design Reference Audit — Dribbble 26985959 (Nixtio “Health Monitoring Dashboard” / flux)

Source: https://dribbble.com/shots/26985959-Health-Monitoring-Dashboard-UI-Design
Inspected: 2026-11-08 via browser (shot image `userupload/46396178/file/85d4c9408dc17c4ae7be0e21a80b2b62.png`).
Page copy: “A modern health dashboard UI designed for tracking fitness, wellness, and daily activity… energy usage, heart rate, activity, sleep analysis, and wellness index.”

## 1. Overall composition
- Outer page background: soft lime / pale yellow-green `#D4ED97` (≈ `#D6EE9A`). The dashboard floats centered as a rounded window on this background.
- App window: dark charcoal frame `#1E2222` (sidebar + outer bezel) surrounding a light content area `#EFEFF1` / `#F0F0F2`.
- Layout: fixed left sidebar (dark) ~230px + right content column (light). Top bar inside content area (profile left, search + bell + date right). Content header (“Health Overview” + subtitle) then card grid.
- Grid: 3-column card row on top (Energy Used wide-left, Heart Rate + Activity stacked middle, Wellness Index right), then one full-width dark card (Sleep Analysis) below.

## 2. Color tokens (extracted)
| Token | Value | Usage |
|---|---|---|
| `--bg-page` | `#D5ED9B` | Landing / outer backdrop |
| `--ink` | `#1E2222` | Sidebar, dark card, primary text on light |
| `--ink-2` | `#2A2F2F` | Hover / dark-card border |
| `--paper` | `#EFEFF1` | App content background |
| `--card` | `#FFFFFF` | Light cards |
| `--lime` | `#D8F85E` | Primary accent: Upgrade banner, progress, chart highlight, CTA |
| `--lime-deep` | `#BFE33B` | Hover / chart secondary |
| `--violet` | `#9C8BE5` | Chart series 1, “Running” bar, dot-matrix |
| `--violet-deep` | `#7A67D6` | Chart emphasis |
| `--sky` | `#A9C6FF` | Dot-matrix / secondary |
| `--text` | `#191D1D` | Headings |
| `--muted` | `#6B7171` | Subtitles, axis labels |
| `--line` | `#E2E4E3` | Card borders, dividers |
| `--good` | `#2E9E5B` | +5% / +10% badges (green pill on white) |
| `--warn` | `#E8B400` | Notification badge (yellow circle, dark text “2”, “3”, “1”) |
| `--dark-card` | `#202424` | Sleep Analysis card bg, white text, yellow `#E4F55A` + lavender bars |

Sidebar: bg `#1E2222`, white icons + `#C9CDCD` inactive, active item = white pill (`#FFFFFF`, dark text, 999px radius) + yellow count badge. Nav icons: minimal line icons (home, nutrition fork/spoon, reports bars, users, messages).
Upgrade card: lime `#D8F85E` rounded-2xl, dark heading, small muted copy, black pill button “Upgrade Now”, purple rocket illustration (decorative only — NOT reused in ResearchGraph).

## 3. Typography
- Family: geometric sans (Inter / Plus Jakarta Sans equivalent). Headings 600–700, body 400–500.
- H1 “Health Overview”: ~28px / 700 / -0.02em. Subtitle ~13px muted.
- Card title: 14px / 600 with 16px icon. Metric: 28–32px / 700 (e.g. “4,3k”, “62 bpm”, “78 %”). Small label 12px muted.
- Sidebar item: 13.5px / 500. Top-bar profile name 13px/600 + email 11px muted.
- Mono only for tiny hashes/logs (not in reference — added JetBrains Mono for experiment logs only).

## 4. Cards, radius, shadow, borders
- Light cards: `bg #fff`, `radius 20px`, `border 1px solid #E7E8E7`, `shadow: 0 1px 2px rgba(20,22,22,.04), 0 8px 24px rgba(20,22,22,.05)`.
- Card padding 18–20px. Card header row: icon (16px in 28px tinted square) + title + `…` menu right.
- Metric row: big number left + delta badge (green pill `+5%` with ↑) + secondary metric right (“Avg 78 Bpm”, “Active 75 Min”) in muted.
- Dark card: same 20px radius, bg `#202424`, white text, internal striped/solid bars, “Monthly” pill dropdown (dark-3 bg `#2E3333`).
- Pills/badges: radius 999px. Count badges: yellow circle 18px, dark text 11px/700.
- Buttons: black pill (`#1E2222`, white text) for primary on light; white pill for primary on dark. Secondary = outline `#D8DADA`.

## 5. Charts & data-viz language (must reuse)
- Donut/progress-circles: three overlapping solid circles (violet `#9C8BE5`, charcoal `#1E2222`, lime `#D8F85E`) with kcal labels — translated in RG to topic-share donuts, not copied literally.
- Horizontal progress bars: 6px rounded track `#EDEEEE`, fills violet / charcoal / lime with `% + label` left.
- Dot-matrix trend (Wellness Index): grid of ~8px dots, inactive `#D8DCDD`, active violet gradient, upward slope — translated to “graph health” sparklines.
- Bar chart (Sleep Analysis): grouped bars per month (Jun–Dec), striped ghost bars + solid neon (yellow `#E4F55A`, lavender `#9C8BE5`, blue `#7AA2FF`) for selected month, rounded tops (4px), muted x-labels, no y-gridlines except faint dotted baseline.
- Legends: small dot + 12px muted label. Tooltips: dark pill (`#1E2222`, white 12px text, 10px radius).
- Empty/loading/error: light card with dashed border + muted 13px copy (inferred standard, reference has no empty state — we follow same card language).

## 6. Navigation / header / controls
- Sidebar (dark): logo top (lime square 28px with dark plus + “flux” wordmark 15px/700 white). Nav list with 8px gap. Bottom: lime Upgrade card pinned.
- Topbar: profile cluster left (32px avatar, name/email stacked, chevron), right cluster (search input light `#F5F6F5` rounded-full with ⌕, bell with yellow dot, date “12 July, 2024” + “Today” pill button outline).
- Tabs/filters: pill segmented control (light track, white active pill w/ shadow). Sort/view toggles same language.
- Inputs: `bg #F4F5F4`, `border #E2E4E3`, `radius 12px`, focus ring `2px rgba(216,248,94,.6)`. Labels 12px/600 muted.
- Tables: header 11px uppercase muted, row 13.5px, dividers `#EDEEEE`, hover `#F7F8F6`.

## 7. Iconography & motion
- Stroke icons 1.5px, round caps, 16–18px in nav/cards. No medical iconography is carried into RG — we map to research icons (paper, dataset, question, flask, chip, memory, globe, share) in the same stroke style.
- Motion (inferred from “smooth UX” copy): 150–200ms ease-out hovers (translateY -1px + shadow), tab fade/slide 180ms, chart animate on mount (~600ms ease-out), no heavy glassmorphism, no neon glows, no gradients except lime banner flat fill.

## 8. What we adapt vs. never copy
- ADAPT: dark sidebar + light content shell, white 20px cards, lime primary, violet/charcoal/lime chart palette, pill badges, dark analytics card, topbar pattern, radius/shadow/typography scale above.
- NEVER COPY: health labels (Energy Used, Heart Rate, Activity, Wellness Index, Sleep Analysis), medical icons, kcal/km/bpm units, rocket illustration, “flux” brand, user “Lucas Bennett”.
- RG mapping: Energy Used → Sources Collected; Heart Rate → Knowledge Connections; Activity → Experiments Executed; Wellness Index → Graph Health (connected-node ratio); Sleep Analysis (dark card) → Research Activity (monthly bars).

## 9. Token source of truth
Implemented in `src/styles/tokens.css`. Every page (landing, auth, dashboard, all 7 modules, modals, drawers, charts, tables, forms) consumes these variables. Landing 3D scenes may use darker stage backgrounds but typography, lime/violet accents, pill buttons and card language stay identical.
