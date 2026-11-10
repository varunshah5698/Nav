/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--vs-canvas)',
        page: 'var(--vs-page)',
        surface: 'var(--vs-surface)',
        sunken: 'var(--vs-sunken)',
        line: 'var(--vs-line)',
        'line-strong': 'var(--vs-line-strong)',
        ink: 'var(--vs-ink)',
        'ink-2': 'var(--vs-ink-2)',
        muted: 'var(--vs-muted)',
        primary: 'var(--vs-primary)',
        'primary-hover': 'var(--vs-primary-hover)',
        'primary-soft': 'var(--vs-primary-soft)',
        sage: 'var(--vs-sage)',
        'sage-ink': 'var(--vs-sage-ink)',
        periwinkle: 'var(--vs-periwinkle)',
        lavender: 'var(--vs-lavender)',
        teal: 'var(--vs-teal)',
        amber: 'var(--vs-amber)',
        clay: 'var(--vs-clay)',
        'clay-soft': 'var(--vs-clay-soft)',
      },
      borderRadius: {
        card: 'var(--vs-radius-card)',
        field: 'var(--vs-radius-field)',
      },
      boxShadow: {
        card: 'var(--vs-shadow-card)',
        raised: 'var(--vs-shadow-raised)',
      },
      fontFamily: {
        sans: ['"Instrument Sans Variable"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        meta: ['0.75rem', { lineHeight: '1.1rem' }],
      },
    },
  },
  plugins: [],
}
