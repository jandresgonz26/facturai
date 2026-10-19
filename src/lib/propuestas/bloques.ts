/**
 * El contenido de una propuesta son los bloques del editor (BlockNote) guardados tal cual en JSON.
 * Aquí viven los tipos mínimos que leen la página pública y el PDF (sin importar BlockNote, que solo
 * corre en el navegador), la plantilla de JAM Tech y las guías en gris que se borran al tocarlas.
 */

export type EstilosTexto = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; code?: boolean; textColor?: string; backgroundColor?: string }
export type TextoInline = { type: 'text'; text: string; styles: EstilosTexto }
export type EnlaceInline = { type: 'link'; href: string; content: TextoInline[] }
export type Inline = TextoInline | EnlaceInline

export type CeldaTabla = Inline[] | { type: 'tableCell'; content: Inline[]; props?: { backgroundColor?: string; textColor?: string; textAlignment?: string; colspan?: number; rowspan?: number } }
export type ContenidoTabla = { type: 'tableContent'; columnWidths?: (number | null | undefined)[]; headerRows?: number; headerCols?: number; rows: { cells: CeldaTabla[] }[] }

export type Bloque = {
    id: string
    type: string
    props: Record<string, unknown>
    content?: Inline[] | ContenidoTabla
    children: Bloque[]
}

export const esTabla = (c: Bloque['content']): c is ContenidoTabla => !!c && !Array.isArray(c) && (c as ContenidoTabla).type === 'tableContent'
export const inlineDe = (b: Bloque): Inline[] => (Array.isArray(b.content) ? b.content : [])
export const celdaInline = (c: CeldaTabla): Inline[] => (Array.isArray(c) ? c : c?.content ?? [])

export function textoPlano(inl: Inline[]): string {
    return inl.map((x) => (x.type === 'link' ? x.content.map((t) => t.text).join('') : x.text)).join('')
}

/** Los bloques vienen de la base: se aceptan solo con la forma esperada. */
export function normalizarBloques(raw: unknown): Bloque[] {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((b): b is Bloque => !!b && typeof b === 'object' && typeof (b as Bloque).type === 'string')
        .map((b) => ({ id: String(b.id ?? ''), type: b.type, props: b.props && typeof b.props === 'object' ? b.props : {}, content: b.content, children: normalizarBloques(b.children) }))
}

// ─── Guías de la plantilla ───────────────────────────────────────────────────

/** Texto en gris de la plantilla: orienta al escribir, se borra al hacer clic y nunca llega al cliente. */
export const GUIAS = [
    'Cuéntale qué entendiste de su negocio y qué problema hay que resolver, con sus palabras: así sabe que lo escuchaste.',
    'La solución en dos o tres párrafos: qué vamos a hacer y qué va a conseguir con eso.',
    'Un entregable concreto por línea (por ejemplo: «Sitio web de 5 páginas adaptado a móvil»).',
    'Lo que queda fuera, para evitar malentendidos (por ejemplo: «Redacción de textos» o «Fotografía profesional»).',
    'Las fases y los plazos: qué pasa en cada etapa y qué necesitamos de su parte.',
] as const

const GUIAS_SET = new Set<string>(GUIAS)
export const esGuia = (b: Bloque): boolean => b.props?.textColor === 'gray' && GUIAS_SET.has(textoPlano(inlineDe(b)).trim())

const guia = (type: string, text: string) => ({ type, props: { textColor: 'gray' }, content: [{ type: 'text', text, styles: { italic: true } }] })
const h = (text: string) => ({ type: 'heading', props: { level: 2 }, content: text })

/** Contenido inicial de una propuesta nueva (forma de bloque parcial de BlockNote). */
export function plantillaJamTech(): unknown[] {
    return [
        h('Tu situación'),
        guia('paragraph', GUIAS[0]),
        h('Lo que proponemos'),
        guia('paragraph', GUIAS[1]),
        h('Qué incluye'),
        guia('bulletListItem', GUIAS[2]),
        h('Qué no incluye'),
        guia('bulletListItem', GUIAS[3]),
        h('Cómo trabajaremos'),
        guia('paragraph', GUIAS[4]),
        { type: 'inversion' },
        h('Próximos pasos'),
        { type: 'numberedListItem', content: 'Aceptas la propuesta con el botón «Aceptar propuesta» de esta página.' },
        { type: 'numberedListItem', content: 'Te enviamos la factura del primer pago.' },
        { type: 'numberedListItem', content: 'Agendamos la reunión de arranque y empezamos.' },
    ]
}

/** Para mostrar al cliente: sin guías sin tocar ni párrafos vacíos sobrantes al final. */
export function bloquesVisibles(bloques: Bloque[]): Bloque[] {
    const out = bloques.filter((b) => !esGuia(b)).map((b) => ({ ...b, children: bloquesVisibles(b.children) }))
    while (out.length && out[out.length - 1].type === 'paragraph' && !textoPlano(inlineDe(out[out.length - 1])).trim()) out.pop()
    return out
}

export type Grupo = { lista: 'bullet' | 'numbered' | 'check'; items: Bloque[] } | { bloque: Bloque }

/** Agrupa los ítems de lista consecutivos (en BlockNote cada ítem es un bloque suelto). */
export function agrupar(bloques: Bloque[]): Grupo[] {
    const out: Grupo[] = []
    const tipoLista = (t: string) => (t === 'bulletListItem' ? 'bullet' : t === 'numberedListItem' ? 'numbered' : t === 'checkListItem' ? 'check' : null)
    for (const b of bloques) {
        const l = tipoLista(b.type)
        const last = out[out.length - 1]
        if (l && last && 'lista' in last && last.lista === l) last.items.push(b)
        else if (l) out.push({ lista: l, items: [b] })
        else out.push({ bloque: b })
    }
    return out
}

/** Colores de texto/fondo de BlockNote → tonos de la marca para la página y el PDF. */
export const COLOR_TEXTO: Record<string, string> = {
    gray: '#6b7280', brown: '#8a5a3b', red: '#c0392b', orange: '#d9730d', yellow: '#b8860b', green: '#3f8f2a', blue: '#106898', purple: '#7c3aed', pink: '#c2417a',
}
export const COLOR_FONDO: Record<string, string> = {
    gray: '#f1f3f5', brown: '#f4eee9', red: '#fdecea', orange: '#fdf0e6', yellow: '#fdf7dc', green: '#edf7e8', blue: '#e7f2f8', purple: '#f1ebfd', pink: '#fbeaf2',
}
