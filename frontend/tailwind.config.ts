import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        kova: {
          accent: '#8b5cf6',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
