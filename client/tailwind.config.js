/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                background: '#0a0a0a',
                surface: '#1a1a1a',
                primary: '#3b82f6',
                success: '#10b981',
                warning: '#f59e0b',
                danger: '#ef4444',
                'neon-green': '#00ff9d',
                'neon-red': '#ff0055',
                'neon-blue': '#00d4ff',
            },
            animation: {
                'glow-blue': 'glow-blue 3s ease-in-out infinite',
                'glow-red': 'glow-red 2s ease-in-out infinite', // Faster for alarm
                'glow-orange': 'glow-orange 3s ease-in-out infinite',
            },
            keyframes: {
                'glow-blue': {
                    '0%, 100%': { boxShadow: '0 0 15px rgba(59, 130, 246, 0.3)', borderColor: 'rgba(59, 130, 246, 0.4)' },
                    '50%': { boxShadow: '0 0 30px rgba(59, 130, 246, 0.6)', borderColor: 'rgba(59, 130, 246, 0.8)' },
                },
                'glow-red': {
                    '0%, 100%': { boxShadow: '0 0 15px rgba(239, 68, 68, 0.4)', borderColor: 'rgba(239, 68, 68, 0.5)' },
                    '50%': { boxShadow: '0 0 40px rgba(239, 68, 68, 0.8)', borderColor: 'rgba(239, 68, 68, 1)' },
                },
                'glow-orange': {
                    '0%, 100%': { boxShadow: '0 0 15px rgba(245, 158, 11, 0.3)', borderColor: 'rgba(245, 158, 11, 0.4)' },
                    '50%': { boxShadow: '0 0 30px rgba(245, 158, 11, 0.6)', borderColor: 'rgba(245, 158, 11, 0.8)' },
                }
            }
        },
    },
    plugins: [],
}
