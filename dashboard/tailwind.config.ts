import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        wa: {
          bg: '#0B141A',
          panel: '#202C33',
          border: '#2A3942',
          text: '#E9EDEF',
          accent: '#00A884',
          'accent-hover': '#00C49A',
          muted: '#8696A0',
          input: '#2A3942',
          danger: '#EF4444',
          warning: '#F59E0B',
          success: '#00A884',
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.3s ease-in-out',
        slideIn: 'slideIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
