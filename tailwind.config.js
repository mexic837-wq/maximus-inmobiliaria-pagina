/** Configuración de Tailwind para el landing (index.html).
 *  Reemplaza al CDN `cdn.tailwindcss.com`, que compilaba el CSS en el navegador.
 *  Recompilar tras cambiar clases: `npm run build:css`. */
module.exports = {
  content: ['./index.html', './js/**/*.js'],
  theme: {
    extend: {
      colors: {
        'maximus-dark': '#0B4A3F',
        'maximus-accent': '#10B981',
        'maximus-silver': '#D1D5DB',
        'maximus-black': '#111827',
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
