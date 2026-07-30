import type { Config } from 'tailwindcss'
import { fontFamily } from 'tailwindcss/defaultTheme'

export default {
  darkMode: 'media',
  content: [
    './app.vue',
    './pages/**/*.vue',
    './layouts/**/*.vue',
    './components/**/*.vue',
    './composables/**/*.ts',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', ...fontFamily.sans],
        mono: ['JetBrains Mono', ...fontFamily.mono],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        brand: {
          50: '#f0eeff',
          100: '#e2ddff',
          200: '#c9bfff',
          300: '#a894ff',
          400: '#8b6bff',
          500: '#7c4dff',
          600: '#6d2fff',
          700: '#5c1fe8',
          800: '#4a19bb',
          900: '#3b1690',
          950: '#220e5c',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
} satisfies Config
