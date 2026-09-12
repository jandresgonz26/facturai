/**
 * Identidad de la app. Los colores salen del logo de JAM Tech (medidos sobre
 * el PNG oficial) y se replican como tokens en globals.css; aquí viven los
 * valores para usarlos desde JS (gráficas, SVG inline) sin duplicar hex a mano.
 */
export const BRAND = {
    company: 'JAM Tech',
    legalName: 'JAM Tech C.A.',
    owner: 'José González',
    initials: 'JG',
    role: 'Gerencia',
    colors: {
        blue: '#106898',
        cyan: '#48C0C0',
        green: '#68B840',
        gray: '#404040',
        navy: '#0B3552',
    },
    logo: '/brand/jamtech-logo.png',
    logoOnDark: '/brand/jamtech-logo-white.png',
    mark: '/brand/jamtech-mark.png',
} as const
