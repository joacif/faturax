/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Habilita o dark mode por classe, mas definiremos por padrão no body
  theme: {
    extend: {
      colors: {
        background: '#0a0a0c', // Fundo escuro profundo
        card: '#121216',       // Grafite/Cinza escuro para cards
        border: '#1f1f27',     // Borda fina elegante
        accent: {
          DEFAULT: '#6366f1',  // Azul Violeta (Indigo)
          hover: '#4f46e5',
        },
        success: '#10b981',    // Esmeralda para "Pago" / Entradas
        danger: '#ef4444',     // Vermelho para saídas/atrasos
        textMuted: '#8b8e9f',  // Cinza médio para textos secundários
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        'premium': '0 4px 30px rgba(0, 0, 0, 0.4)',
        'premium-sm': '0 2px 12px rgba(0, 0, 0, 0.3)',
      }
    },
  },
  plugins: [],
}
