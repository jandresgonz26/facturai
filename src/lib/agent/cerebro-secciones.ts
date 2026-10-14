/**
 * Secciones del cerebro de la empresa (lo que todos los agentes saben de JAM Tech). Sin dependencias de
 * servidor: la página del cerebro las usa para guiar a José con preguntas y ejemplos.
 */
export type SeccionCerebro = 'empresa' | 'oferta' | 'cliente_ideal' | 'diferencial' | 'voz' | 'metas' | 'reglas' | 'recursos'

export type Seccion = { key: SeccionCerebro; titulo: string; preguntas: string; ejemplo: string }

/** En un proyecto (Wapalink, un cliente) las preguntas y ejemplos hablan del proyecto, no de la agencia. */
const DE_PROYECTO: Record<SeccionCerebro, Pick<Seccion, 'preguntas' | 'ejemplo'>> = {
    empresa: { preguntas: '¿Qué es, qué problema resuelve, en qué etapa está (idea, lista de espera, lanzado) y quién lo lleva?', ejemplo: 'Asistente de IA para WhatsApp que responde a los clientes de pequeños negocios las 24 horas. En lista de espera; lanzamiento previsto en diciembre…' },
    oferta: { preguntas: '¿Qué planes o servicios tiene, qué incluye cada uno y cuánto cuesta? ¿Hay prueba gratis, descuentos o condiciones?', ejemplo: 'Plan Básico: $… /mes, incluye… Plan Pro: $… /mes, incluye… Prueba gratis de 7 días…' },
    cliente_ideal: { preguntas: '¿Para quién es? Tipo de negocio, tamaño, país, qué le duele y qué lo hace decir que sí.', ejemplo: 'Negocios con muchas consultas por WhatsApp (tiendas, clínicas, restaurantes) que no dan abasto para responder…' },
    diferencial: { preguntas: '¿Por qué elegirlo frente a otras opciones? Resultados, casos, garantías.', ejemplo: 'Se configura en un día, habla como el negocio, soporte en español…' },
    voz: { preguntas: '¿Cómo habla este proyecto? Si es igual que JAM Tech, dilo; si cambia, en qué.', ejemplo: 'Igual que JAM Tech, pero más cercano y con emojis moderados…' },
    metas: { preguntas: '¿Qué quieres lograr con el proyecto y para cuándo? Clientes, ingresos, hitos.', ejemplo: '50 clientes de pago antes de marzo; $2.000 al mes de ingreso recurrente…' },
    reglas: { preguntas: '¿Qué nunca deben decir o prometer los agentes sobre este proyecto?', ejemplo: 'No prometer integraciones que aún no existen; no dar fechas de lanzamiento sin confirmar…' },
    recursos: { preguntas: '¿Dónde está el proyecto? Web, redes, listas, documentos clave (con enlace).', ejemplo: 'Web: …; lista de espera en Brevo; presentación: …' },
}

/** Las secciones con su texto para la empresa o, dentro de un proyecto, para el proyecto. */
export const seccionesPara = (proyecto: string | null): Seccion[] =>
    SECCIONES.map((s) => (proyecto ? { ...s, ...DE_PROYECTO[s.key], titulo: s.key === 'empresa' ? `Qué es ${proyecto}` : s.titulo } : s))

export const SECCIONES: Seccion[] = [
    { key: 'empresa', titulo: 'Quiénes somos', preguntas: '¿Qué hace la empresa, desde dónde, quién la dirige y cuáles son sus líneas de negocio?', ejemplo: 'Agencia de software y marketing de Puerto Ordaz dirigida por José González. Líneas: webs y apps, SEO, automatización con IA, Wapalink…' },
    { key: 'oferta', titulo: 'Qué vendemos y a qué precio', preguntas: '¿Cuáles son tus servicios y productos, qué incluye cada uno y cuánto cuesta (o en qué rango)? ¿Cuál es el que más te conviene vender?', ejemplo: 'SEO mensual: desde $… / mes, incluye auditoría, contenido y reporte. Web corporativa: desde $…, entrega en 3 semanas…' },
    { key: 'cliente_ideal', titulo: 'Cliente ideal', preguntas: '¿A quién le vendes mejor? Tipo de negocio, tamaño, país, qué le duele, qué ya intentó y qué lo hace decir que sí.', ejemplo: 'Pequeños negocios de Venezuela y Latinoamérica con 2 a 20 empleados que venden por WhatsApp y no tienen tiempo para el marketing…' },
    { key: 'diferencial', titulo: 'Por qué nos eligen', preguntas: '¿Qué te hace distinto? Resultados que puedes demostrar, casos de clientes, garantías.', ejemplo: 'Plataforma SEO propia con reportes mensuales claros; un solo equipo para web, SEO e IA; casos: …' },
    { key: 'voz', titulo: 'Voz de marca', preguntas: '¿Cómo habla la marca? Tuteo o usted, cercano o formal, palabras que sí y que no, cómo se escribe el nombre.', ejemplo: 'Cercana y clara, tuteo, sin jerga técnica. "JAM Tech" en textos, "JAM Tech Corp" en pies legales…' },
    { key: 'metas', titulo: 'Metas del año', preguntas: '¿Qué quieres lograr este año y el próximo? Facturación, clientes, lanzamientos, equipo.', ejemplo: 'Llegar a $… al mes de facturación recurrente; lanzar Wapalink en diciembre; sumar a mi socia…' },
    { key: 'reglas', titulo: 'Reglas que no se rompen', preguntas: '¿Qué nunca deben hacer o decir los agentes? Competidores, promesas, temas sensibles.', ejemplo: 'Nunca mencionar competidores de Wapalink ni de JAM Tech. No prometer posiciones concretas en Google…' },
    { key: 'recursos', titulo: 'Canales y recursos', preguntas: '¿Dónde está la marca y con qué trabaja? Web, redes, listas de correo, herramientas, documentos clave (con su enlace).', ejemplo: 'Web jamtech.cloud; Instagram @…; boletín "Aprende con Jami" en Brevo; portafolio: …' },
]

/** Una sección cuenta como completa con un mínimo de contenido (una frase con algo de detalle). */
export const MIN_COMPLETA = 40

export function completitud(contenidos: Partial<Record<SeccionCerebro, string>>): { pct: number; completas: number; total: number; faltan: SeccionCerebro[] } {
    const faltan = SECCIONES.filter((s) => (contenidos[s.key] ?? '').trim().length < MIN_COMPLETA).map((s) => s.key)
    const total = SECCIONES.length
    const completas = total - faltan.length
    return { pct: Math.round((completas / total) * 100), completas, total, faltan }
}
