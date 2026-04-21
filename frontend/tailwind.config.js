/** @type {import('tailwindcss').Config} */
export default {
  // Activar modo oscuro por clase en el elemento <html>
  darkMode: 'class',

  content: ['./index.html', './src/**/*.{js,jsx}'],

  theme: {
    extend: {
      colors: {
        // Colores semánticos reutilizables en dark/light
        surface:   { DEFAULT: '#ffffff',  dark: '#1e2433' },
        surfaceAlt:{ DEFAULT: '#f8fafc',  dark: '#252d3d' },
        border:    { DEFAULT: '#e2e8f0',  dark: '#2e3a4e' },
      },
    },
  },

  plugins: [],
};