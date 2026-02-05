/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'Aeonik', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      colors: {
        surface: {
          DEFAULT: 'rgb(var(--color-bg))',
          elevated: 'rgb(var(--color-bg-elevated))',
          muted: 'rgb(var(--color-bg-muted))',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border))',
          strong: 'rgb(var(--color-border-strong))',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent))',
          hover: 'rgb(var(--color-accent-hover))',
          muted: 'rgb(var(--color-accent-muted))',
        },
      },
      borderRadius: {
        'ds-sm': 'var(--radius-sm)',
        'ds-md': 'var(--radius-md)',
        'ds-lg': 'var(--radius-lg)',
        'ds-xl': 'var(--radius-xl)',
        'ds-full': 'var(--radius-full)',
      },
      boxShadow: {
        'ds-sm': 'var(--shadow-sm)',
        'ds-md': 'var(--shadow-md)',
        'ds-lg': 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
};
