import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'wa-green': '#25D366',
        'wa-dark': '#075E54',
        'wa-light': '#DCF8C6',
        'wa-bg': '#ECE5DD',
        'wa-header': '#00897B',
        'wa-chat-bg': '#E5DDD5',
      },
    },
  },
  plugins: [],
};

export default config;
