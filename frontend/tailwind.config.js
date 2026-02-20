/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Earthy Palette
                'olive-leaf': '#606c38',
                'black-forest': '#283618',
                'cornsilk': '#fefae0',
                'sunlit-clay': '#dda15e',
                'copperwood': '#bc6c25',
                // Derived shades
                'olive': {
                    50: '#f4f6ef',
                    100: '#e6ebd8',
                    200: '#cdd7b4',
                    300: '#aebe87',
                    400: '#8fa562',
                    500: '#606c38',
                    600: '#545f31',
                    700: '#414a28',
                    800: '#283618',
                    900: '#1a2410',
                },
                'clay': {
                    50: '#fefae0',
                    100: '#fdf3c7',
                    200: '#fce68a',
                    300: '#f7d070',
                    400: '#dda15e',
                    500: '#bc6c25',
                    600: '#a35a1f',
                    700: '#85491a',
                    800: '#6d3b17',
                    900: '#5a3015',
                },
                // Legacy compat
                'agri': {
                    50: '#f4f6ef',
                    100: '#e6ebd8',
                    200: '#cdd7b4',
                    300: '#aebe87',
                    400: '#8fa562',
                    500: '#606c38',
                    600: '#545f31',
                    700: '#414a28',
                    800: '#283618',
                    900: '#1a2410',
                },
            },
            fontFamily: {
                'display': ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
            },
            fontSize: {
                'fluid-xs': 'clamp(0.65rem, 1.5vw, 0.75rem)',
                'fluid-sm': 'clamp(0.8rem, 2vw, 0.875rem)',
                'fluid-base': 'clamp(0.875rem, 2.2vw, 1rem)',
                'fluid-lg': 'clamp(1rem, 2.5vw, 1.125rem)',
                'fluid-xl': 'clamp(1.125rem, 3vw, 1.25rem)',
                'fluid-2xl': 'clamp(1.25rem, 3.5vw, 1.5rem)',
            },
            borderRadius: {
                'clay': '1.5rem',
                'clay-lg': '2rem',
                'clay-sm': '1rem',
            },
            boxShadow: {
                'clay': '6px 6px 16px #A69E8B, -4px -4px 12px rgba(255,255,255,0.6)',
                'clay-sm': '4px 4px 10px #A69E8B, -3px -3px 8px rgba(255,255,255,0.5)',
                'clay-md': '8px 8px 20px #A69E8B, -6px -6px 14px rgba(255,255,255,0.7)',
                'clay-lg': '10px 10px 24px #A69E8B, -8px -8px 16px rgba(255,255,255,0.7)',
                'clay-inset': 'inset 4px 4px 8px rgba(0,0,0,0.08), inset -4px -4px 8px rgba(255,255,255,0.5)',
                'clay-olive': '4px 4px 8px rgba(96, 108, 56, 0.2), -3px -3px 6px rgba(255, 255, 255, 0.6)',
                'clay-float': '12px 12px 28px #A69E8B, -8px -8px 18px rgba(255,255,255,0.7)',
                'clay-hover': '8px 8px 20px #A69E8B, -6px -6px 14px rgba(255,255,255,0.7)',
                'clay-press': 'inset 3px 3px 6px rgba(0,0,0,0.08), inset -3px -3px 6px rgba(255,255,255,0.4)',
                'glow-olive': '0 0 16px rgba(96, 108, 56, 0.25)',
            },
            animation: {
                'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'fade-in': 'fadeIn 0.5s ease-out',
                'fade-up': 'fadeUp 0.4s ease-out both',
                'bounce-in': 'bounceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both',
                'slide-right': 'slideRight 0.4s ease-out both',
                'shimmer': 'shimmerAnim 1.8s ease-in-out infinite',
                'breathe': 'breatheAnim 2s ease-in-out infinite',
                'spin-leaf': 'spinLeaf 1.2s linear infinite',
                'toast-in': 'toastIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                fadeUp: {
                    '0%': { opacity: '0', transform: 'translateY(12px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                bounceIn: {
                    '0%': { transform: 'scale(0.9)', opacity: '0' },
                    '60%': { transform: 'scale(1.03)', opacity: '1' },
                    '100%': { transform: 'scale(1)' },
                },
                slideRight: {
                    '0%': { transform: 'translateX(30px)', opacity: '0' },
                    '100%': { transform: 'translateX(0)', opacity: '1' },
                },
                shimmerAnim: {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
                breatheAnim: {
                    '0%, 100%': { transform: 'scale(1)', opacity: '0.6' },
                    '50%': { transform: 'scale(1.3)', opacity: '1' },
                },
                spinLeaf: {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                },
                toastIn: {
                    '0%': { transform: 'translateX(100%) scale(0.9)', opacity: '0' },
                    '60%': { transform: 'translateX(-5px) scale(1.02)' },
                    '100%': { transform: 'translateX(0) scale(1)', opacity: '1' },
                },
            },
            screens: {
                'xs': '475px',
                'tablet': '768px',
                'landscape': { raw: '(orientation: landscape) and (max-height: 500px)' },
            },
        },
    },
    plugins: [],
}
