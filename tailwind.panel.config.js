/** Tailwind del panel (dashboard-layout.html).
 *  Reemplaza al CDN `cdn.tailwindcss.com`, que compilaba el CSS en el navegador en cada carga.
 *  Recompilar tras cambiar clases: `npm run build:css`. */
module.exports = {
  darkMode: 'class',
  content: ['./dashboard-layout.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        'maximus-dark': '#0B4A3F',
        'maximus-accent': '#10B981',
        'maximus-silver': '#D1D5DB',
        'maximus-black': '#111827',
        'maximus-bg': '#F4F7F6',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      boxShadow: {
        'premium': '0 4px 20px -2px rgba(11, 74, 63, 0.05)',
        'premium-hover': '0 10px 30px -5px rgba(11, 74, 63, 0.1)',
      },
    },
  },
  plugins: [],
};
