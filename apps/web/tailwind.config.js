/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Monochrome product chrome: deep dark ground, white type, white accent.
        ink: {
          900: '#07070a',
          850: '#0b0b10',
          800: '#101017',
          750: '#15151d',
          700: '#1b1b24',
          600: '#24242f',
          500: '#33333f',
          400: '#494955',
          300: '#6b6b78',
          200: '#9c9ca8',
          100: '#d2d2da',
          50: '#f4f4f6',
        },
        line: 'rgba(255,255,255,0.09)',
        'line-strong': 'rgba(255,255,255,0.16)',
        accent: '#ffffff',
      },
      fontFamily: {
        sans: ['var(--ff-ui)'],
        display: ['var(--ff-display)'],
        mono: ['var(--ff-mono)'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.06em' }],
      },
      borderRadius: {
        card: '18px',
        tile: '14px',
        pill: '999px',
      },
      boxShadow: {
        soft: '0 1px 0 rgba(255,255,255,0.04) inset, 0 18px 40px -24px rgba(0,0,0,0.9)',
        lift: '0 30px 80px -40px rgba(0,0,0,0.85), 0 2px 8px -4px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(255,255,255,0.14), 0 24px 60px -30px rgba(255,255,255,0.22)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      keyframes: {
        drift: {
          '0%': { transform: 'translate3d(-2%, -1%, 0) scale(1)' },
          '50%': { transform: 'translate3d(3%, 2%, 0) scale(1.08)' },
          '100%': { transform: 'translate3d(-2%, -1%, 0) scale(1)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-7px)' },
        },
        pulseSoft: {
          '0%,100%': { opacity: '0.35' },
          '50%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-140% 0' },
          '100%': { backgroundPosition: '240% 0' },
        },
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        drift: 'drift 26s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 1.5s ease-in-out infinite',
        shimmer: 'shimmer 2.4s linear infinite',
        rise: 'riseIn .5s cubic-bezier(.2,.8,.2,1) both',
      },
      transitionTimingFunction: {
        launch: 'cubic-bezier(.22,.8,.24,1)',
      },
    },
  },
  plugins: [],
};
