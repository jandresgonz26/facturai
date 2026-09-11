import type { DayBlock } from '@/lib/task-priority'

/**
 * Paisaje ilustrado del banner, por capas y con degradados.
 *
 * Es SVG y no una imagen: pesa unos pocos kilobytes, se ve nítido en cualquier
 * pantalla y cambia de paleta según la hora sin tener que generar tres
 * archivos. Las capas van de fondo a frente (cielo, astro, cerros lejanos,
 * arboleda, cerros cercanos) para dar profundidad.
 */

interface Palette {
    skyTop: string
    skyMid: string
    skyLow: string
    far1: string
    far2: string
    mid1: string
    mid2: string
    near1: string
    near2: string
    tree: string
    treeAlt: string
    orb: string
    orbGlow: string
    accent: string
}

const PALETTES: Record<DayBlock, Palette> = {
    morning: {
        skyTop: '#9FD4F0',
        skyMid: '#FFD1A8',
        skyLow: '#FFAE86',
        far1: '#C2E5E0',
        far2: '#9BD6CF',
        mid1: '#63C2B4',
        mid2: '#3FA89B',
        near1: '#2A8C82',
        near2: '#1B6B63',
        tree: '#14554F',
        treeAlt: '#1E7A6F',
        // Dorado saturado: un amarillo pálido se perdía contra el cielo durazno.
        orb: '#FFB03A',
        orbGlow: '#FF8C42',
        accent: '#FFF4D6',
    },
    afternoon: {
        skyTop: '#5FB8EE',
        skyMid: '#A8DCF5',
        skyLow: '#FFE3B8',
        far1: '#BFE3C8',
        far2: '#95D2A6',
        mid1: '#63BE7C',
        mid2: '#43A15E',
        near1: '#2F8549',
        near2: '#216638',
        tree: '#1A5730',
        treeAlt: '#2A7844',
        orb: '#FFE066',
        orbGlow: '#FFC93C',
        accent: '#FFFBEA',
    },
    evening: {
        skyTop: '#151832',
        skyMid: '#2C2352',
        skyLow: '#5B3268',
        far1: '#3B3160',
        far2: '#2E2650',
        mid1: '#262046',
        mid2: '#1D1838',
        near1: '#16122B',
        near2: '#0E0B1E',
        tree: '#0A0818',
        treeAlt: '#141026',
        orb: '#F4F1E6',
        orbGlow: '#C9C2E8',
        accent: '#FFFFFF',
    },
}

/** Posiciones fijas: las estrellas no deben bailar en cada render. */
const STARS = [
    [70, 44, 1.6], [150, 88, 1.1], [232, 36, 2], [318, 74, 1.3], [402, 30, 1.7],
    [486, 82, 1.2], [560, 50, 1.9], [648, 92, 1.1], [726, 40, 1.5], [812, 70, 1.3],
    [894, 34, 1.8], [968, 86, 1.2], [1046, 52, 1.6], [1124, 78, 1.2],
] as const

/**
 * Arboleda sobre la loma media. Cada árbol se planta en la cota real de la
 * loma (baseY) para que no flote, y lleva tronco visible: sin él, las copas se
 * leen como piedras y no como árboles.
 */
function Grove({ p, id }: { p: Palette; id: string }) {
    // [x, cota de la loma en ese punto, tamaño, tipo]
    // El tercio izquierdo se deja despejado a propósito: ahí va el saludo, y
    // poner detalle detrás del texto es lo que ensucia la lectura.
    const trees: [number, number, number, 'round' | 'pine'][] = [
        [402, 216, 15, 'pine'], [442, 212, 22, 'round'], [486, 208, 14, 'pine'],
        [560, 204, 18, 'round'], [600, 206, 12, 'pine'],
        [806, 240, 18, 'round'], [846, 239, 12, 'pine'], [886, 236, 21, 'round'],
        [1054, 220, 16, 'pine'], [1096, 223, 19, 'round'],
    ]
    return (
        <g>
            {trees.map(([x, baseY, size, kind], i) => {
                const fill = i % 2 ? p.treeAlt : p.tree
                const trunkH = size * 0.75
                const topY = baseY - trunkH
                return (
                    <g key={`${id}-t-${i}`}>
                        <rect x={x - size * 0.09} y={topY} width={size * 0.18} height={trunkH + 2} fill={p.tree} rx={size * 0.09} />
                        {kind === 'pine' ? (
                            <>
                                <path d={`M${x} ${topY - size * 1.5} L${x + size * 0.62} ${topY - size * 0.35} L${x - size * 0.62} ${topY - size * 0.35} Z`} fill={fill} />
                                <path d={`M${x} ${topY - size * 1.05} L${x + size * 0.78} ${topY + size * 0.12} L${x - size * 0.78} ${topY + size * 0.12} Z`} fill={fill} />
                            </>
                        ) : (
                            <>
                                <circle cx={x} cy={topY - size * 0.62} r={size * 0.72} fill={fill} />
                                <circle cx={x - size * 0.5} cy={topY - size * 0.2} r={size * 0.5} fill={fill} />
                                <circle cx={x + size * 0.5} cy={topY - size * 0.24} r={size * 0.46} fill={fill} />
                            </>
                        )}
                    </g>
                )
            })}
        </g>
    )
}

export function DayScene({ block }: { block: DayBlock }) {
    const p = PALETTES[block]
    const id = `scene-${block}`
    const isNight = block === 'evening'
    // El sol de la mañana va bajo, pero por encima de la cresta más alta de los
    // cerros lejanos (y≈178): más abajo desaparecía por completo.
    const orb = isNight ? { cx: 1010, cy: 70, r: 26 } : block === 'morning' ? { cx: 896, cy: 142, r: 42 } : { cx: 940, cy: 76, r: 34 }

    return (
        <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 1200 320"
            preserveAspectRatio="xMidYMax slice"
            aria-hidden
        >
            <defs>
                <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.skyTop} />
                    <stop offset="55%" stopColor={p.skyMid} />
                    <stop offset="100%" stopColor={p.skyLow} />
                </linearGradient>
                <linearGradient id={`${id}-far`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.far1} />
                    <stop offset="100%" stopColor={p.far2} />
                </linearGradient>
                <linearGradient id={`${id}-mid`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.mid1} />
                    <stop offset="100%" stopColor={p.mid2} />
                </linearGradient>
                <linearGradient id={`${id}-near`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={p.near1} />
                    <stop offset="100%" stopColor={p.near2} />
                </linearGradient>
                <radialGradient id={`${id}-glow`}>
                    <stop offset="0%" stopColor={p.orbGlow} stopOpacity="0.85" />
                    <stop offset="100%" stopColor={p.orbGlow} stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* Cielo */}
            <rect width="1200" height="320" fill={`url(#${id}-sky)`} />

            {/* Estrellas, solo de noche */}
            {isNight &&
                STARS.map(([x, y, r], i) => (
                    <circle key={`${id}-s-${i}`} cx={x} cy={y} r={r} fill={p.accent} opacity={0.55 + (i % 3) * 0.15} />
                ))}

            {/* Astro con halo */}
            <circle cx={orb.cx} cy={orb.cy} r={orb.r * 3.4} fill={`url(#${id}-glow)`} />
            <circle cx={orb.cx} cy={orb.cy} r={orb.r} fill={p.orb} />
            {isNight && <circle cx={orb.cx + orb.r * 0.42} cy={orb.cy - orb.r * 0.3} r={orb.r * 0.92} fill={p.skyTop} />}

            {/* Nubes suaves (no de noche) */}
            {!isNight && (
                <g fill={p.accent} opacity="0.5">
                    <ellipse cx="230" cy="72" rx="54" ry="17" />
                    <ellipse cx="272" cy="64" rx="38" ry="14" />
                    <ellipse cx="760" cy="52" rx="46" ry="14" />
                    <ellipse cx="796" cy="46" rx="32" ry="11" />
                </g>
            )}

            {/* Cerros lejanos */}
            <path
                d="M0 232 C 90 196, 168 182, 248 206 C 320 228, 372 190, 452 178 C 536 166, 596 208, 676 214 C 760 220, 826 178, 912 186 C 1000 194, 1070 222, 1140 208 L 1200 200 L 1200 320 L 0 320 Z"
                fill={`url(#${id}-far)`}
                opacity="0.9"
            />

            {/* Loma media, con arboleda encima */}
            <path
                d="M0 258 C 96 226, 190 212, 286 230 C 372 246, 428 214, 516 206 C 612 198, 676 232, 768 238 C 856 244, 928 212, 1016 218 C 1096 224, 1152 246, 1200 238 L 1200 320 L 0 320 Z"
                fill={`url(#${id}-mid)`}
            />
            <Grove p={p} id={id} />

            {/* Cerros cercanos, los más oscuros */}
            <path
                d="M0 292 C 108 268, 208 258, 312 272 C 404 284, 470 262, 566 258 C 668 254, 740 280, 840 284 C 936 288, 1016 266, 1108 270 C 1156 272, 1182 282, 1200 278 L 1200 320 L 0 320 Z"
                fill={`url(#${id}-near)`}
            />

            {/* Detalles geométricos flotantes, como en la referencia */}
            <g fill={p.accent} opacity={isNight ? 0.35 : 0.45}>
                <circle cx="356" cy="126" r="3" />
                <circle cx="620" cy="98" r="2.4" />
                <circle cx="1004" cy="140" r="2.6" />
                <path d="M700 150 l5 9 -10 0 Z" />
                <path d="M268 158 l4.5 8 -9 0 Z" />
            </g>
        </svg>
    )
}
