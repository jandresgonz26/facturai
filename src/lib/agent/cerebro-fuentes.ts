/**
 * Fuentes del cerebro (tabla cerebro_fuentes): de una web, un PDF, una imagen o unas notas se extrae el texto
 * una sola vez, y con todas las fuentes la IA propone el contenido de las secciones del cerebro. José revisa
 * y guarda: nada se guarda en el cerebro sin que lo vea.
 */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { modeloPara } from './modelo'
import { SECCIONES, type SeccionCerebro } from './cerebro-secciones'
import { leerCerebro } from './cerebro'
import { leerProyecto, porAlcance, type ProyectoId } from './proyectos'

export type Fuente = { id: string; created_at: string; tipo: 'url' | 'archivo' | 'nota'; nombre: string; url: string | null; caracteres: number }

const MAX_FUENTE = 40_000
const MAX_HTML = 2_000_000
const PAGINAS_EXTRA = 4
// Páginas internas que suelen tener lo que el cerebro necesita.
const UTILES = /(precio|price|plan|tarifa|servicio|service|producto|product|nosotros|about|quienes|empresa|faq|preguntas|contacto|contact|caracteristicas|features|soluciones)/i

export async function listarFuentes(proyecto: ProyectoId): Promise<Fuente[]> {
    const { data, error } = await porAlcance(supabase.from('cerebro_fuentes').select('id, created_at, tipo, nombre, url, contenido'), proyecto).order('created_at')
    if (error) throw new Error(error.message)
    return (data ?? []).map((r) => ({ id: r.id, created_at: r.created_at, tipo: r.tipo, nombre: r.nombre, url: r.url, caracteres: String(r.contenido ?? '').length }))
}

export async function borrarFuente(id: string): Promise<void> {
    await supabase.from('cerebro_fuentes').delete().eq('id', id)
}

async function guardar(proyecto: ProyectoId, f: { tipo: Fuente['tipo']; nombre: string; url?: string | null; contenido: string }): Promise<void> {
    const contenido = f.contenido.trim().slice(0, MAX_FUENTE)
    if (contenido.length < 30) throw new Error(`«${f.nombre}» no tiene texto legible.`)
    const { error } = await supabase.from('cerebro_fuentes').insert({ proyecto_id: proyecto, tipo: f.tipo, nombre: f.nombre.slice(0, 200), url: f.url ?? null, contenido })
    if (error) throw new Error(error.message)
}

// ───────────── Web ─────────────

/** Solo direcciones públicas: una URL no puede apuntar al propio servidor ni a la red interna. */
async function urlPublica(raw: string): Promise<URL> {
    let u: URL
    try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`) } catch { throw new Error(`«${raw}» no es un enlace válido.`) }
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Solo enlaces http o https.')
    const ips = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true }).catch(() => [])
    if (ips.length === 0) throw new Error(`No encuentro el sitio ${u.hostname}.`)
    const privada = (ip: string) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip)
    if (ips.some((i) => privada(i.address))) throw new Error('Ese enlace apunta a una dirección interna.')
    return u
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ', uuml: 'ü', iquest: '¿', iexcl: '¡', euro: '€', copy: '©' }
const decodificar = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e] ?? m)

/** HTML → texto legible: sin scripts ni estilos, con saltos de línea en los bloques, título y descripción arriba. */
export function htmlATexto(html: string): { titulo: string; texto: string } {
    const titulo = decodificar(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '')
    const desc = decodificar(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1] ?? '')
    const cuerpo = html
        .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|section|article|li|h[1-6]|tr|header|footer|ul|ol|table|main|nav)>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<[^>]+>/g, ' ')
    const texto = decodificar(cuerpo).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1)
    // Quita líneas repetidas (menús y pies que salen en cada bloque).
    const vistas = new Set<string>()
    const unicas = texto.filter((l) => (vistas.has(l) ? false : (vistas.add(l), true)))
    return { titulo, texto: `${desc ? `${desc}\n\n` : ''}${unicas.join('\n')}` }
}

/** Descarga la página siguiendo como mucho 4 redirecciones, comprobando que cada salto siga siendo público. */
async function bajar(inicio: URL): Promise<string> {
    let u = inicio
    let r: Response | null = null
    for (let saltos = 0; saltos <= 4; saltos++) {
        r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; JAMTechOficina/1.0)', accept: 'text/html,*/*' }, redirect: 'manual', signal: AbortSignal.timeout(15_000) })
        const destino = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null
        if (!destino) break
        u = await urlPublica(new URL(destino, u).href)
    }
    if (!r || !r.ok) throw new Error(`${u.hostname} respondió ${r?.status ?? 'sin respuesta'}.`)
    if (!(r.headers.get('content-type') ?? '').includes('html')) throw new Error(`${u.href} no es una página web.`)
    const html = await r.text()
    return html.slice(0, MAX_HTML)
}

/** Una web: la página indicada y hasta 4 páginas internas útiles (precios, servicios, nosotros, preguntas…). */
export async function agregarUrl(proyecto: ProyectoId, raw: string): Promise<void> {
    const u = await urlPublica(raw)
    const html = await bajar(u)
    const { titulo, texto } = htmlATexto(html)
    const enlaces = [...html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)].map((m) => { try { return new URL(m[1], u) } catch { return null } })
        .filter((x): x is URL => !!x && x.hostname === u.hostname && x.pathname !== u.pathname && UTILES.test(x.pathname))
    const extra = [...new Map(enlaces.map((x) => [x.pathname, x])).values()].slice(0, PAGINAS_EXTRA)
    const partes = [`# ${titulo || u.href}\n${u.href}\n\n${texto}`]
    for (const x of extra) {
        try { const t = htmlATexto(await bajar(x)); partes.push(`# ${t.titulo || x.pathname}\n${x.href}\n\n${t.texto}`) } catch { /* una página interna que falla no impide el resto */ }
    }
    const contenido = partes.join('\n\n---\n\n')
    if (texto.length < 200 && extra.length === 0) throw new Error(`${u.hostname} casi no tiene texto legible (puede que se arme con JavaScript). Prueba con un PDF o pega el texto como nota.`)
    await guardar(proyecto, { tipo: 'url', nombre: titulo || u.hostname, url: u.href, contenido })
}

// ───────────── Archivos y notas ─────────────

const TIPOS_IA = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** PDF o imagen: Claude lo lee una vez y deja notas fieles; texto plano o markdown se guarda tal cual. */
export async function agregarArchivo(proyecto: ProyectoId, f: { nombre: string; tipo: string; datos: Uint8Array }): Promise<void> {
    if (f.tipo.startsWith('text/') || /\.(txt|md|csv)$/i.test(f.nombre)) {
        return guardar(proyecto, { tipo: 'archivo', nombre: f.nombre, contenido: new TextDecoder().decode(f.datos) })
    }
    if (!TIPOS_IA.includes(f.tipo)) throw new Error(`«${f.nombre}»: por ahora leo PDF, imágenes y texto (no Word ni Excel; expórtalo a PDF).`)
    const { model, providerOptions } = modeloPara('rutinas')
    const { text } = await generateText({
        model, providerOptions, maxOutputTokens: 8000,
        messages: [{
            role: 'user',
            content: [
                { type: 'file', data: f.datos, mediaType: f.tipo, filename: f.nombre },
                { type: 'text', text: 'Transcribe en notas fieles TODO lo útil para conocer este negocio: qué es, productos o servicios, precios y planes (exactos), a quién va dirigido, diferenciales, casos y resultados, tono, metas, condiciones, contactos y enlaces. Conserva cifras, nombres y textos tal cual; no resumas de más ni inventes. Escribe en español, en markdown ligero.' },
            ],
        }],
    })
    await guardar(proyecto, { tipo: 'archivo', nombre: f.nombre, contenido: text })
}

export async function agregarNota(proyecto: ProyectoId, texto: string): Promise<void> {
    const nombre = texto.trim().split('\n')[0].slice(0, 60) || 'Nota'
    await guardar(proyecto, { tipo: 'nota', nombre: `Nota: ${nombre}`, contenido: texto })
}

// ───────────── Generar el cerebro ─────────────

const CAMPOS = Object.fromEntries(SECCIONES.map((s) => [s.key, z.string().describe(`${s.titulo}. ${s.preguntas} Vacío si las fuentes no dicen nada de esto.`)])) as Record<SeccionCerebro, z.ZodString>
const esquema = z.object({ ...CAMPOS, faltante: z.string().describe('En una o dos frases: qué no encontraste en las fuentes y conviene que José complete') })

export type PropuestaCerebro = Partial<Record<SeccionCerebro, string>> & { faltante?: string }

/**
 * Propone el texto de las secciones (o de una sola) a partir de las fuentes, integrando lo que ya hay escrito.
 * Sin fuentes, se apoya en lo que ya hay (cerebro de la empresa, descripción del proyecto) para redactar mejor.
 */
export async function generarCerebro(proyecto: ProyectoId, solo?: SeccionCerebro): Promise<PropuestaCerebro> {
    const [fuentes, actual, empresa, p] = await Promise.all([
        porAlcance(supabase.from('cerebro_fuentes').select('nombre, url, contenido'), proyecto).order('created_at').then(({ data }) => data ?? []),
        leerCerebro(proyecto),
        proyecto ? leerCerebro(null) : Promise.resolve({}),
        leerProyecto(proyecto),
    ])
    let presupuesto = 120_000
    const textoFuentes = fuentes.map((f) => {
        const t = String(f.contenido).slice(0, Math.max(0, presupuesto)); presupuesto -= t.length
        return t ? `### FUENTE: ${f.nombre}${f.url ? ` (${f.url})` : ''}\n${t}` : ''
    }).filter(Boolean).join('\n\n')
    const quien = p ? `el proyecto «${p.nombre}» de JAM Tech${p.descripcion ? ` (${p.descripcion})` : ''}` : 'la empresa JAM Tech'
    const escrito = SECCIONES.filter((s) => actual[s.key]?.trim()).map((s) => `## ${s.titulo}\n${actual[s.key]}`).join('\n\n')
    const deEmpresa = p ? SECCIONES.filter((s) => (empresa as Record<string, string>)[s.key]?.trim()).map((s) => `## ${s.titulo}\n${(empresa as Record<string, string>)[s.key]}`).join('\n\n') : ''

    const { model, providerOptions } = modeloPara('chat')
    const { object } = await generateObject({
        model, providerOptions, schema: esquema,
        system: `Redactas el «cerebro» de ${quien}: lo que sus agentes de IA deben saber para trabajar (precios, cliente ideal, tono, reglas). Escribe en español, en frases claras y concretas, con cifras, nombres y enlaces exactos tal como aparecen en las fuentes.
Reglas:
- Usa SOLO lo que dicen las fuentes y lo que ya está escrito. No inventes precios, cifras, clientes ni metas: si algo no aparece, deja esa sección vacía ("").
- La voz de marca puedes deducirla del tono en que están escritas las fuentes (dilo: «Por el tono de la web: …»).
- Si una sección ya tiene texto de José, consérvalo e intégralo con lo nuevo; nunca lo contradigas ni lo borres.
- Cada sección, de 2 a 8 frases o una lista corta con guiones. Sin títulos dentro.
${p ? '- Es un proyecto: «Quiénes somos» describe el proyecto (qué es, qué problema resuelve, etapa, quién lo lleva), no la empresa. No repitas lo que ya está en el cerebro de la empresa salvo que el proyecto lo cambie.' : ''}
- Nunca menciones ni recomiendes competidores de Wapalink ni de JAM Tech.${solo ? `\n- Esta vez solo importa la sección «${SECCIONES.find((s) => s.key === solo)!.titulo}»: deja las demás vacías.` : ''}`,
        prompt: `${textoFuentes ? `FUENTES:\n${textoFuentes}` : 'No hay fuentes: apóyate solo en lo ya escrito.'}\n\n${escrito ? `LO QUE YA ESTÁ ESCRITO EN ESTE CEREBRO:\n${escrito}` : 'El cerebro está vacío.'}${deEmpresa ? `\n\nCEREBRO DE LA EMPRESA (contexto, no lo copies):\n${deEmpresa}` : ''}`,
    })
    const out: PropuestaCerebro = { faltante: object.faltante }
    for (const s of SECCIONES) {
        const v = (object[s.key] ?? '').trim()
        if (v && (!solo || solo === s.key) && v !== (actual[s.key] ?? '').trim()) out[s.key] = v
    }
    return out
}
