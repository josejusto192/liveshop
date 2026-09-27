import type { Config } from 'tailwindcss';

// Cores e raios vêm de design/tokens.css (importado em app/globals.css).
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        line: 'var(--line)',
        'line-2': 'var(--line-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
        dark: 'var(--dark)',
        'dark-2': 'var(--dark-2)',
        'dark-3': 'var(--dark-3)',
        'dark-line': 'var(--dark-line)',
        'dark-muted': 'var(--dark-muted)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        live: 'var(--live)',
        danger: 'var(--danger)',
        'danger-bg': 'var(--danger-bg)',
        warn: 'var(--warn)',
        'warn-bg': 'var(--warn-bg)',
        ok: 'var(--ok)',
        'ok-bg': 'var(--ok-bg)',
      },
      borderRadius: {
        input: 'var(--r-input)',
        card: 'var(--r-card)',
        'card-lg': 'var(--r-card-lg)',
        panel: 'var(--r-panel)',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
