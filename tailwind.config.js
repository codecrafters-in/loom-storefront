/**
 * Every colour is a CSS custom property holding an "R G B" triplet, consumed
 * through `rgb(var(--x) / <alpha-value>)`. That is what lets a theme be
 * re-skinned from one block in index.css — including opacity modifiers like
 * `bg-ink/10`, which break if the variable holds a hex string.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        page: 'rgb(var(--page) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        sunken: 'rgb(var(--sunken) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-ink': 'rgb(var(--accent-ink) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
        sale: 'rgb(var(--sale) / <alpha-value>)',
        good: 'rgb(var(--good) / <alpha-value>)',
      },
      fontFamily: {
        // Set by the store's theme at runtime (src/lib/theme.js); defaults in index.css.
        sans: ['var(--font-body)'],
        display: ['var(--font-display)'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-xl': ['clamp(2.75rem, 6vw, 5rem)', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
        'display-lg': ['clamp(2rem, 4vw, 3.25rem)', { lineHeight: '1.02', letterSpacing: '-0.025em' }],
        'display-md': ['clamp(1.5rem, 2.6vw, 2.25rem)', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
      },
      borderRadius: { xs: 'var(--radius)' },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.05), 0 12px 28px -18px rgb(var(--shadow) / 0.18)',
        lift: '0 2px 4px rgb(var(--shadow) / 0.06), 0 28px 56px -28px rgb(var(--shadow) / 0.22)',
        panel: '0 24px 64px -24px rgb(var(--shadow) / 0.28)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up .4s cubic-bezier(.22,1,.36,1) both',
        marquee: 'marquee 40s linear infinite',
      },
    },
  },
  plugins: [],
}
