/**
 * «Redactar con IA» en el editor de propuestas: a partir de las notas de José (lo que hablaron, una
 * conversación de WhatsApp pegada) y del cerebro de la empresa, un borrador con la estructura de
 * JAM Tech y una tabla de inversión propuesta. También reescribe un trozo seleccionado.
 * Devuelve Markdown: el editor lo convierte en bloques en el navegador.
 */
import { generateObject, generateText } from 'ai'
import { z } from 'zod'
import { cerebroParaPrompt } from '@/lib/agent/cerebro'
import { modeloPara } from '@/lib/agent/modelo'
import { getClient } from '@/lib/actions/clients'
import { normalizarPricing, uid, type Pricing } from './precios'

export const MARCA_INVERSION = '[[INVERSION]]'

const item = z.object({
    servicio: z.string().describe('Nombre corto del servicio'),
    descripcion: z.string().describe('Qué incluye, en una frase. Puede ir vacío.'),
    cantidad: z.number(),
    unidad: z.string().describe('«horas», «páginas», «meses»… o vacío'),
    precio: z.number().describe('Precio unitario. 0 si no hay referencia de precio.'),
    frecuencia: z.enum(['unico', 'mensual', 'trimestral', 'semestral', 'anual']),
    incluido: z.boolean().describe('true si va incluido sin costo'),
    a_convenir: z.boolean().describe('true si no hay precio de referencia y hay que definirlo'),
})

const esquema = z.object({
    markdown: z.string().describe(`La propuesta en Markdown, con títulos «## » para cada sección y la línea ${MARCA_INVERSION} sola donde va la tabla de precios.`),
    opciones: z.array(z.object({ nombre: z.string(), descripcion: z.string(), recomendada: z.boolean(), items: z.array(item) })).describe('Una opción, o 2-3 paquetes si las notas lo piden o tiene sentido ofrecer alternativas.'),
    extras: z.array(item).describe('Servicios opcionales que el cliente puede añadir. Puede ir vacío.'),
    plan_pagos: z.array(z.object({ concepto: z.string(), pct: z.number() })).describe('Reparto del pago único, p. ej. 50 % al firmar y 50 % al entregar. Vacío si no aplica.'),
    faltante: z.string().describe('Qué datos faltan para cerrar la propuesta (precios, plazos…), en una o dos frases. Vacío si no falta nada.'),
})

export type BorradorIA = { markdown: string; pricing: Pricing; faltante: string }

export async function redactarPropuesta(input: { clientId: string; titulo: string; notas: string }): Promise<BorradorIA> {
    const notas = input.notas.trim()
    if (notas.length < 15) throw new Error('Cuéntame un poco más: qué necesita el cliente y qué le vas a proponer.')
    const [client, cerebro] = await Promise.all([getClient(input.clientId), cerebroParaPrompt(null).catch(() => '')])
    const { model, providerOptions } = modeloPara('chat')
    const { object } = await generateObject({
        model,
        providerOptions,
        schema: esquema,
        maxOutputTokens: 12000,
        system: `Eres José González, de JAM Tech (agencia de software y marketing), y escribes una propuesta comercial para un cliente. Español neutro, tuteo, cercano y claro, sin jerga técnica innecesaria. Frases cortas. Nada de relleno ni superlativos vacíos.
Estructura (títulos «## » exactamente así, en este orden; puedes omitir una sección si no aplica):
## Tu situación — lo que entendimos de su negocio y su problema, con sus palabras.
## Lo que proponemos — la solución y qué va a conseguir con ella (2-3 párrafos).
## Qué incluye — lista con viñetas de entregables concretos.
## Qué no incluye — lista breve para evitar malentendidos.
## Cómo trabajaremos — fases y plazos (lista numerada o tabla Markdown si ayuda).
${MARCA_INVERSION}
## Próximos pasos — lista numerada: aceptar con el botón «Aceptar propuesta», primera factura, reunión de arranque.
Reglas:
- Usa SOLO lo que dicen las notas y el cerebro de la empresa. No inventes resultados, casos, cifras de tráfico ni plazos que nadie dijo; si falta un dato, escribe algo prudente y anótalo en «faltante».
- Precios: toma los de las notas; si no hay, usa los precios de referencia del cerebro; si tampoco hay, pon precio 0 y a_convenir = true. Nunca inventes un precio.
- No escribas precios en el texto: van en la tabla (${MARCA_INVERSION}).
- Nombre de la marca: «JAM Tech». Nunca menciones ni recomiendes competidores de JAM Tech ni de Wapalink.
- Para webs, el hosting que recomendamos es Hostinger (somos partners), si viene al caso.`,
        prompt: `CLIENTE: ${client.name}${client.contact_name ? ` (contacto: ${client.contact_name})` : ''}
TÍTULO DE LA PROPUESTA: ${input.titulo}
MONEDA: ${client.preferred_input_currency === 'EUR' ? 'EUR' : 'USD'}

NOTAS DE JOSÉ:
${notas.slice(0, 30000)}

${cerebro ? `CEREBRO DE JAM TECH (servicios, precios de referencia, voz, reglas):\n${cerebro.slice(0, 30000)}` : ''}`,
    })
    const pricing = normalizarPricing({
        titulo: 'Inversión',
        opciones: object.opciones.map((o) => ({ ...o, id: uid(), items: o.items.map((i) => ({ ...i, id: uid() })) })),
        extras: object.extras.map((i) => ({ ...i, id: uid() })),
        plan_pagos: object.plan_pagos.map((c) => ({ ...c, id: uid() })),
    })
    if (pricing.opciones.filter((o) => o.recomendada).length === 0 && pricing.opciones.length > 1) pricing.opciones[0].recomendada = true
    return { markdown: object.markdown, pricing, faltante: object.faltante }
}

export async function reescribir(markdown: string, instruccion: string): Promise<string> {
    const md = markdown.trim()
    if (!md) throw new Error('Selecciona primero el texto que quieres reescribir.')
    const { model, providerOptions } = modeloPara('chat')
    const { text } = await generateText({
        model,
        providerOptions,
        maxOutputTokens: 6000,
        system: `Reescribes un fragmento de una propuesta comercial de JAM Tech siguiendo la instrucción de José. Español neutro, tuteo, claro. Conserva los datos, cifras, nombres y enlaces exactos; no inventes nada nuevo. Conserva el formato Markdown (títulos, listas, negritas) salvo que la instrucción pida cambiarlo. Devuelve SOLO el fragmento reescrito, sin comentarios ni comillas.`,
        prompt: `INSTRUCCIÓN: ${instruccion.trim() || 'Mejóralo: más claro y directo.'}\n\nFRAGMENTO:\n${md.slice(0, 20000)}`,
    })
    return text.trim()
}
