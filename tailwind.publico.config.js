/** Tailwind de catálogo, ficha del inmueble y login.
 *  Reemplaza al CDN `cdn.tailwindcss.com`. Recompilar tras cambiar clases: `npm run build:css`. */
module.exports = {
  content: ['./catalog.html', './property-detail.html', './login.html', './js/**/*.js'],
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
        sans: ['Montserrat', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'premium': '0 10px 30px -5px rgba(11, 74, 63, 0.08), 0 4px 12px -2px rgba(11, 74, 63, 0.04)',
        'premium-hover': '0 20px 35px -5px rgba(11, 74, 63, 0.15), 0 10px 15px -5px rgba(11, 74, 63, 0.08)',
      },
    },
  },
  plugins: [],
};
