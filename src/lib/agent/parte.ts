/**
 * «Parte del día»: UN solo mensaje por la mañana en vez de un aviso por departamento.
 *
 * Junta el aviso del asistente (facturas, tareas, correo…), los informes de los agentes que tocan hoy, el resumen
 * del correo y, los lunes, la semana en dinero; quita lo repetido entre fuentes y lo que ya se le dijo a José en
 * los últimos días sin que haya cambiado nada. Si al final no queda nada nuevo, no se manda nada: el silencio
 * quiere decir «todo sigue igual». Los informes completos siguen en la Oficina de la web.
 */
import { generateObject } from 'ai'
import { z } from 'zod'
import { buildCheckin, recordCheckin, type CheckinItem } from '@/lib/actions/assistant-checkin'
import { buildMorningEmailDigest } from '@/lib/actions/email-digest'
import { buildWeeklySummary } from '@/lib/actions/weekly-summary'
import { USER_TIMEZONE, todayISO } from '@/lib/actions/validation'
import { supabase } from '@/lib/supabase'
import { correrRutina } from './rutinas'
import { modeloPara } from './modelo'
import { registrarEvento } from './eventos'
import { DEPARTAMENTOS, type Departamento } from './shared'
import { carteraSeo, videoResumenSeo } from './tools-seo'

/** Los que revisan todos los días; el resto, solo los lunes. */
const DIARIOS: Departamento[] = ['operaciones', 'finanzas', 'ventas']
const SOLO_LUNES: Departamento[] = ['marketing', 'seo', 'direccion']
/** Un asunto ya dicho no se repite antes de esto, salvo que haya cambiado algo de verdad. */
export const DIAS_SIN_REPETIR = 7
const HORAS_SIN_REPETIR = DIAS_SIN_REPETIR * 24 - 12
/** Lo que se lee de una sentada en el teléfono; lo que no cabe sale otro día. */
const MAX_LINEAS = 6
const TITULO_EVENTO = 'Parte del día'

export const esLunes = (now: Date) => new Intl.DateTimeFormat('en-US', { timeZone: USER_TIMEZONE, weekday: 'short' }).format(now) === 'Mon'

export type ItemParte = { clave: string; linea: string; nivel: 'urgente' | 'novedad'; departamento: Departamento; boton: string | null; pedido: string | null }

export interface Parte {
    /** Markdown ligero listo para mdToTelegramHtml, o null si no hay nada nuevo que contar. */
    texto: string | null
    items: ItemParte[]
    /** Lo que no cupo en el mensaje: va solo en la conversación, para cuando pregunte «¿qué más hay?». */
    resto: string[]
    /** Asuntos que se callaron por estar ya dichos (o por no caber). */
    callados: number
    informes: Partial<Record<Departamento, string>>
    errores: Partial<Record<Departamento, string>>
    /** Los avisos del asistente que salen en el mensaje: se marcan como dichos al enviarlo. */
    checkinItems: CheckinItem[]
}

/** Partes enviados en los últimos días: si hoy ya salió uno, y qué se dijo (clave → línea). */
async function historial(now: Date): Promise<{ enviadoHoy: boolean; dicho: Map<string, string> }> {
    const desde = new Date(now.getTime() - HORAS_SIN_REPETIR * 3_600_000).toISOString()
    const { data } = await supabase.from('agent_events').select('detalle, created_at').eq('tipo', 'aviso').eq('titulo', TITULO_EVENTO).gte('created_at', desde).order('created_at')
    const hoy = todayISO(now)
    const dicho = new Map<string, string>()
    let enviadoHoy = false
    for (const r of data ?? []) {
        const d = (r.detalle ?? {}) as { fecha?: string; items?: { clave: string; linea: string }[] }
        if (d.fecha === hoy) enviadoHoy = true
        for (const i of d.items ?? []) dicho.set(i.clave, i.linea)
    }
    return { enviadoHoy, dicho }
}

export async function parteYaEnviadoHoy(now = new Date()): Promise<boolean> {
    return (await historial(now)).enviadoHoy
}

const ESQUEMA = z.object({
    resumen: z.string().nullable().describe('Solo si hay resumen semanal: UNA línea con lo facturado y cobrado la semana pasada. Si no, null.'),
    items: z.array(z.object({
        clave: z.string().describe('Identificador estable del asunto. Para los AVISOS usa la clave que traen. Para lo demás «tipo:identificador», p. ej. factura:123, cotizacion:nombre-del-cliente, lead:nombre, correo:remitente, boletin:edicion-12, seo:cliente, objetivo:nombre, decision:tema'),
        linea: z.string().describe('Una sola línea, máximo 20 palabras: «**Etiqueta corta:** qué pasa», con la cifra clave si la hay'),
        nivel: z.enum(['urgente', 'novedad', 'rutina']),
        cambio: z.boolean().describe('true SOLO si la clave aparece en YA DICHO y algo cambió de verdad (respondió, pagó, subió el monto, venció un plazo nuevo). Si es lo mismo con otras palabras, false.'),
        departamento: z.enum(Object.keys(DEPARTAMENTOS) as [Departamento, ...Departamento[]]),
        boton: z.string().nullable().describe('Si hay una acción concreta que el asistente puede hacer: texto de botón de máximo 24 caracteres que empieza con verbo («Enviar recordatorio»). Si no, null.'),
        pedido: z.string().nullable().describe('Lo que José le pediría al asistente para hacer esa acción, completo y con nombres, números y montos. null si no hay botón.'),
    })),
})

/**
 * Arma el parte. `guardar: false` (prueba) no guarda nada derivado de las rutinas (consejos de Dirección).
 * No envía ni marca nada como dicho: de eso se encarga quien lo manda (`registrarParte`).
 */
export async function armarParte(now = new Date(), opts: { guardar?: boolean } = {}): Promise<Parte> {
    const lunes = esLunes(now)
    const deps = lunes ? [...DIARIOS, ...SOLO_LUNES] : DIARIOS

    const [checkin, rutinas, digest, semana, { dicho }] = await Promise.all([
        buildCheckin(now, { cooldownHours: HORAS_SIN_REPETIR, parte: true }),
        Promise.allSettled(deps.map((d) => correrRutina(d, { guardar: opts.guardar }))),
        buildMorningEmailDigest(now).catch(() => null),
        lunes ? buildWeeklySummary(now).catch(() => null) : Promise.resolve(null),
        historial(now),
    ])

    const informes: Parte['informes'] = {}
    const errores: Parte['errores'] = {}
    rutinas.forEach((r, i) => {
        if (r.status === 'fulfilled') informes[deps[i]] = r.value.informe
        else errores[deps[i]] = r.reason instanceof Error ? r.reason.message : String(r.reason)
    })
    const conNovedad = Object.entries(informes).filter(([, t]) => t && t !== 'SIN_NOVEDADES') as [Departamento, string][]
    const vacio: Parte = { texto: null, items: [], resto: [], callados: 0, informes, errores, checkinItems: [] }
    if (checkin.items.length === 0 && conNovedad.length === 0 && !digest && !semana) return vacio

    const claveAviso = (i: CheckinItem) => `aviso:${i.kind}:${i.ref_id}`
    const fuentes = [
        checkin.items.length ? `AVISOS DEL ASISTENTE (departamento operaciones o finanzas según el tema; usa su clave tal cual):\n${checkin.items.map((i) => `- [${claveAviso(i)}] ${i.text}`).join('\n')}` : '',
        ...conNovedad.map(([d, t]) => `INFORME DE ${DEPARTAMENTOS[d].nombre.toUpperCase()} (departamento ${d}):\n${t}`),
        digest ? `CORREO RECIBIDO DESDE AYER (departamento operaciones):\n${digest.text}` : '',
        semana ? `RESUMEN DE LA SEMANA PASADA:\n${semana.text}` : '',
    ].filter(Boolean).join('\n\n')
    const yaDicho = dicho.size ? [...dicho].map(([c, l]) => `- [${c}] ${l}`).join('\n') : '(nada)'

    const { model, providerOptions } = modeloPara('rutinas')
    const { object } = await generateObject({
        model, providerOptions, schema: ESQUEMA,
        system: `Armas el mensaje de la mañana que José, dueño de JAM Tech, lee en Telegram en el teléfono. Le cansan los mensajes largos y que le repitan lo mismo cada día.
Reglas:
- Un asunto = un item. Si varias fuentes hablan de lo mismo (la misma factura, el mismo cliente, el mismo correo), júntalas en un solo item.
- nivel «urgente»: dinero en riesgo serio, una web de cliente posiblemente hackeada, un cliente esperando algo que vence hoy. «novedad»: algo nuevo o que José debe decidir. «rutina»: estado que no pide nada (todo va bien, cifras sin cambios, recordatorios genéricos).
- No inventes nada que no esté en las fuentes. Montos con punto de miles y coma decimal ($1.851,88), fechas como «5 oct».
- Nada de saludos ni cierres.`,
        prompt: `FUENTES DE HOY:\n\n${fuentes}\n\nYA DICHO EN LOS ÚLTIMOS ${DIAS_SIN_REPETIR} DÍAS (clave → lo que se dijo):\n${yaDicho}`,
    })

    let callados = 0
    const items: ItemParte[] = []
    for (const it of object.items) {
        if (it.nivel === 'rutina') continue
        const clave = it.clave.trim().toLowerCase()
        if (dicho.has(clave) && !it.cambio) { callados++; continue }
        items.push({ clave, linea: it.linea.trim(), nivel: it.nivel, departamento: it.departamento, boton: it.boton?.trim() || null, pedido: it.pedido?.trim() || null })
    }
    items.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'urgente' ? -1 : 1))
    const mostrados = items.slice(0, MAX_LINEAS)
    callados += items.length - mostrados.length
    if (mostrados.length === 0 && !object.resumen) return { ...vacio, callados }

    const fecha = new Intl.DateTimeFormat('es-VE', { timeZone: USER_TIMEZONE, weekday: 'long', day: 'numeric', month: 'short' }).format(now)
    const lineas = [`☀️ Parte del día · ${fecha}`]
    if (object.resumen) lineas.push(object.resumen.trim())
    lineas.push('', ...mostrados.map((i) => `- ${i.nivel === 'urgente' ? '🔴 ' : ''}${i.linea}`))
    const resto = items.slice(MAX_LINEAS)
    if (resto.length) lineas.push('', `Hay ${resto.length} asunto${resto.length === 1 ? '' : 's'} más; pregúntame «¿qué más hay?».`)

    const enMensaje = new Set(mostrados.map((i) => i.clave))
    return {
        texto: lineas.join('\n'), items: mostrados, resto: resto.map((i) => i.linea), callados, informes, errores,
        checkinItems: checkin.items.filter((i) => enMensaje.has(claveAviso(i))),
    }
}

/** Botones del parte: hasta 3, con el pedido completo guardado (el botón solo lleva el id). */
export async function botonesDeParte(items: ItemParte[]): Promise<{ id: string; etiqueta: string }[]> {
    const conAccion = items.filter((i) => i.boton && i.pedido).slice(0, 3)
    if (conAccion.length === 0) return []
    const { data, error } = await supabase.from('telegram_acciones').insert(conAccion.map((i) => ({
        departamento: i.departamento, etiqueta: i.boton!.slice(0, 32), pedido: i.pedido!.slice(0, 1500),
    }))).select('id, etiqueta')
    if (error) throw new Error(error.message)
    return (data ?? []) as { id: string; etiqueta: string }[]
}

/** Deja constancia de lo dicho: así mañana no se repite. */
export async function registrarParte(p: Parte, now = new Date()): Promise<void> {
    await recordCheckin(p.checkinItems)
    await registrarEvento({
        departamento: 'operaciones', tipo: 'aviso', titulo: TITULO_EVENTO, fuente: 'cron',
        detalle: { fecha: todayISO(now), items: p.items.map((i) => ({ clave: i.clave, linea: i.linea })), callados: p.callados, texto: p.texto?.slice(0, 4000) ?? null },
    })
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Los lunes: el resumen en video de cada cliente de SEO, como una línea de enlaces al final del parte (la
 * plataforma reutiliza el de la semana si ya existe). Un cliente que falla no impide los demás.
 */
export async function lineaVideosSeo(): Promise<string | null> {
    let clientes: { slug: string; nombre: string }[]
    try { clientes = (await carteraSeo()).clientes } catch { return null }
    if (clientes.length === 0) return null
    const enlaces: string[] = []
    for (const c of clientes) {
        try {
            const v = await videoResumenSeo(c.slug)
            if (v.enlace) enlaces.push(`<a href="${esc(v.enlace)}">${esc(c.nombre)}</a>`)
        } catch (e) {
            console.error(`[parte] video SEO de ${c.slug}`, e)
        }
    }
    return enlaces.length ? `🎬 <b>Videos SEO de la semana:</b> ${enlaces.join(' · ')}` : null
}
