/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Token semantik. Sebelumnya nilai rgba(45,212,191,...) ditulis ulang
        // puluhan kali langsung di dalam JSX, jadi ganti warna berarti
        // memburu satu per satu.
        brand: {
          50: '#ECFDF5',
          200: '#99F6E4',
          300: '#5EEAD4',
          400: '#2DD4BF',
          500: '#14B8A6',
          600: '#0D9488',
          700: '#0F766E',
        },
        accent: {
          300: '#D8B4FE',
          400: '#C084FC',
          500: '#A855F7',
          600: '#9333EA',
          700: '#7E22CE',
        },
        ink: {
          // Hindari #000000 murni: bikin smear di layar OLED.
          950: '#09090B',
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
        },
        danger: { 400: '#F87171', 500: '#EF4444' },
        warn: { 400: '#FBBF24' },
        ok: { 400: '#34D399' },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        // Lantai 12px: di bawah itu teks tidak terbaca di ponsel.
        micro: ['0.75rem', { lineHeight: '1rem' }],
      },
      spacing: {
        // Ruang aman ponsel (poni atas & garis gestur bawah).
        safe: 'env(safe-area-inset-bottom, 0px)',
        'safe-top': 'env(safe-area-inset-top, 0px)',
        dock: '6.5rem',
      },
      borderRadius: { '4xl': '2rem' },
      transitionTimingFunction: {
        // Expo.out — terasa cepat di awal lalu mendarat halus.
        expo: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      boxShadow: {
        'glow-brand': '0 0 20px rgba(45, 212, 191, 0.35)',
        'glow-accent': '0 0 20px rgba(168, 85, 247, 0.35)',
        glass: '0 8px 32px rgba(0, 0, 0, 0.35)',
      },
      keyframes: {
        'aurora-drift': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(6%, -8%, 0) scale(1.12)' },
          '66%': { transform: 'translate3d(-7%, 5%, 0) scale(0.94)' },
        },
        'coin-spin': {
          '0%': { transform: 'rotateX(18deg) rotateY(0deg)' },
          '100%': { transform: 'rotateX(18deg) rotateY(360deg)' },
        },
        'coin-float': {
          '0%, 100%': { transform: 'translateY(-10px)' },
          '50%': { transform: 'translateY(10px)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        twinkle: {
          '0%, 100%': { opacity: '0', transform: 'scale(0.4) rotate(0deg)' },
          '50%': { opacity: '1', transform: 'scale(1) rotate(45deg)' },
        },
        'float-up': {
          '0%': { transform: 'translateY(0) scale(0.6)', opacity: '0' },
          '15%': { opacity: '0.9' },
          '85%': { opacity: '0.5' },
          '100%': { transform: 'translateY(-70vh) scale(1.1)', opacity: '0' },
        },
        'ring-sweep': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'sheen': {
          '0%': { transform: 'translateX(-120%) skewX(-18deg)' },
          '60%, 100%': { transform: 'translateX(220%) skewX(-18deg)' },
        },
      },
      animation: {
        // Semua hanya menganimasikan transform/opacity supaya diproses GPU,
        // bukan memaksa browser menghitung ulang tata letak setiap frame.
        'aurora-drift': 'aurora-drift 22s ease-in-out infinite',
        'coin-spin': 'coin-spin 26s linear infinite',
        'coin-float': 'coin-float 7s ease-in-out infinite',
        shimmer: 'shimmer 1.6s infinite',
        twinkle: 'twinkle 4s ease-in-out infinite',
        'float-up': 'float-up 14s linear infinite',
        'ring-sweep': 'ring-sweep 18s linear infinite',
        sheen: 'sheen 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
