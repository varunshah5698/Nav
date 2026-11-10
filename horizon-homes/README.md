# Horizon Homes

Interactive real-estate dashboard prototype inspired by the Horizon Homes Dribbble concept. Self-contained HTML, CSS, and JavaScript — no build step or dependencies.

## Run

Open `index.html` in a browser. For the most reliable local persistence, serve the folder:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Screens

- **Personal cabinet** (`#home`) — KPI cards, mortgage and revenue charts, listings donut, portfolio tab, statistics tab.
- **Properties** (`#properties`) — searchable, filterable book of owned and for-sale listings.
- **Property detail** (`#property?id=…`) — shareable detail page with investment snapshot and add-to-portfolio action.
- **Market analytics** (`#analytics`) — median price trend, city inventory, market table.
- **About** (`#about`) — positioning, features, and how-it-works.
- **Tools & Calculators** (`#tools`) — live mortgage and rental-yield calculators.

## Working interactions

- Top-bar search and filter shortcut route into the property book.
- Ownership filters, live search, sorting, and empty states.
- Add Property dialog updates the sidebar, portfolio, counts, and total value.
- Market listings can be added to the portfolio from their detail page.
- Property cards and sidebar rows link to detail pages.
- Notification bell and reset-demo actions.
- Responsive layouts from 390px upward, with keyboard focus and ARIA labels.

## Data

All figures are realistic sample data. New properties persist in browser `localStorage` under `horizon-homes.properties.v2`. Use **Reset demo data** under the profile card to restore the seed set. There is no backend.

## Exports

`exports/` contains Canva-ready PNG stills of the desktop and mobile screens, plus import notes. Property imagery remains gradient placeholder art.

## Browser checks

Verified in Chromium and WebKit (Safari engine) at 390px, 768px, and 1440px with no horizontal overflow. Firefox was not verified.
