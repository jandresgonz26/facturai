/**
 * Tareas guiadas de cada agente: entregables profesionales listos para usar (no prompts sueltos). Cada una
 * pide primero los datos que necesita, consulta los datos reales de su área (solo lectura) y guarda el
 * resultado en la biblioteca de entregables. Sin dependencias de servidor: la UI pinta los formularios.
 */
import type { Departamento } from './shared'

export type CampoTarea = {
    key: string
    etiqueta: string
    tipo: 'texto' | 'parrafo' | 'numero' | 'fecha'
    ayuda?: string
    requerido?: boolean
}

export type TareaGuiada = {
    id: string
    departamento: Departamento
    titulo: string
    /** Qué te llevas, en una frase. */
    para: string
    campos: CampoTarea[]
    /** Herramientas de lectura que puede usar para apoyarse en datos reales. */
    herramientas: string[]
    web?: boolean
    encargo: string
    /** Tareas que suelen venir después (la UI las sugiere al terminar). */
    siguiente?: string[]
}

export const TAREAS: TareaGuiada[] = [
    // ── 📋 Operaciones · Sofía
    {
        id: 'semana_enfocada', departamento: 'operaciones', titulo: 'Plan de la semana', para: 'Tus 3 a 5 compromisos de la semana repartidos por día, y qué soltar.',
        campos: [
            { key: 'imprescindible', etiqueta: '¿Qué tiene que salir sí o sí esta semana?', tipo: 'parrafo', requerido: true },
            { key: 'horas', etiqueta: 'Horas reales de trabajo disponibles', tipo: 'numero', ayuda: 'Las que de verdad tienes, sin reuniones.' },
        ],
        herramientas: ['list_tasks', 'get_day_plan', 'list_active_alerts', 'objetivos_listar'],
        encargo: 'Arma el plan de la semana: elige entre 3 y 5 compromisos (lo imprescindible primero, luego lo que mueve los objetivos), repártelos por día según las horas disponibles, y lista qué tareas viejas conviene partir o soltar y por qué. Si no cabe, dilo y propone qué sacar.',
        siguiente: ['limpieza_pendientes'],
    },
    {
        id: 'limpieza_pendientes', departamento: 'operaciones', titulo: 'Limpieza de pendientes', para: 'Cada tarea vieja decidida: hacerla, partirla o soltarla.',
        campos: [{ key: 'criterio', etiqueta: '¿Algo que deba tener en cuenta?', tipo: 'parrafo', ayuda: 'Ej.: este mes priorizo cobrar y vender.' }],
        herramientas: ['list_tasks', 'get_day_plan', 'objetivos_listar'],
        encargo: 'Revisa las tareas abiertas, sobre todo las arrastradas y las que llevan más de dos semanas sin planificarse. Para cada una decide: hacer esta semana, partir en un primer paso de menos de 1 hora (escríbelo), o soltar. Agrupa por decisión y termina con cuántas quedan vivas.',
        siguiente: ['semana_enfocada'],
    },
    {
        id: 'proceso_documentado', departamento: 'operaciones', titulo: 'Documentar un proceso', para: 'Un procedimiento paso a paso que cualquiera del equipo pueda seguir.',
        campos: [
            { key: 'proceso', etiqueta: '¿Qué proceso?', tipo: 'texto', requerido: true, ayuda: 'Ej.: alta de un cliente nuevo de SEO.' },
            { key: 'como', etiqueta: 'Cuéntame cómo lo haces hoy', tipo: 'parrafo', requerido: true },
            { key: 'herramientas', etiqueta: 'Herramientas que usas', tipo: 'texto' },
        ],
        herramientas: [],
        encargo: 'Convierte lo que contó José en un procedimiento: objetivo, cuándo se usa, responsables, pasos numerados con su lista de verificación, plantillas de mensajes si hacen falta, y al final qué partes se podrían automatizar o delegar.',
    },

    // ── 🤝 Ventas · Mateo
    {
        id: 'propuesta_comercial', departamento: 'ventas', titulo: 'Propuesta comercial', para: 'Una propuesta lista para enviar y el mensaje de WhatsApp para acompañarla.',
        campos: [
            { key: 'cliente', etiqueta: 'Cliente o prospecto', tipo: 'texto', requerido: true },
            { key: 'necesidad', etiqueta: '¿Qué necesita o qué le duele?', tipo: 'parrafo', requerido: true },
            { key: 'presupuesto', etiqueta: 'Presupuesto que mencionó (si lo hizo)', tipo: 'texto' },
        ],
        herramientas: ['list_pipeline', 'list_quotes', 'list_clients'],
        encargo: 'Redacta una propuesta comercial: diagnóstico en sus palabras, solución, entregables y plazos, inversión (con los precios del cerebro; si no están, deja [completar: precio]), por qué JAM Tech y siguiente paso. Después, un mensaje corto de WhatsApp para enviarla.',
        siguiente: ['seguimiento_leads'],
    },
    {
        id: 'seguimiento_leads', departamento: 'ventas', titulo: 'Seguimiento de leads', para: 'Mensajes de seguimiento listos para cada lead y cotización sin respuesta.',
        campos: [{ key: 'enfoque', etiqueta: '¿A quién o con qué enfoque?', tipo: 'parrafo', ayuda: 'Vacío = todos los leads y cotizaciones pendientes.' }],
        herramientas: ['list_pipeline', 'list_quotes', 'leads_web'],
        encargo: 'Para cada lead o cotización pendiente (máximo 8, empezando por los que más valen o más tiempo llevan), escribe una secuencia corta de WhatsApp: día 1, día 3 y día 7, cada mensaje distinto y con una pregunta fácil de responder. Indica a quién va y por qué ahora.',
        siguiente: ['guion_llamada'],
    },
    {
        id: 'guion_llamada', departamento: 'ventas', titulo: 'Guion de llamada de ventas', para: 'Preguntas de diagnóstico, respuestas a objeciones y cierre.',
        campos: [
            { key: 'servicio', etiqueta: '¿Qué servicio vendes en la llamada?', tipo: 'texto', requerido: true },
            { key: 'objeciones', etiqueta: 'Objeciones que más escuchas', tipo: 'parrafo' },
        ],
        herramientas: [],
        encargo: 'Escribe un guion de llamada de 20 minutos: apertura, 6 a 8 preguntas de diagnóstico, cómo presentar la solución con el diferencial del cerebro, respuesta a cada objeción y un cierre con siguiente paso concreto.',
        siguiente: ['propuesta_comercial'],
    },

    // ── 💸 Finanzas · Valeria
    {
        id: 'plan_meta_mes', departamento: 'finanzas', titulo: 'Plan para llegar a la meta del mes', para: 'La brecha con la meta y de dónde puede salir cada dólar.',
        campos: [{ key: 'meta', etiqueta: 'Meta del mes en USD', tipo: 'numero', ayuda: 'Vacío = la meta de Ajustes.' }],
        herramientas: ['get_briefing', 'get_revenue_summary', 'get_pending_logs', 'list_invoices', 'list_pipeline', 'list_quotes'],
        encargo: 'Calcula cuánto falta para la meta del mes (facturado hasta hoy frente a la meta) y arma el camino: trabajo sin facturar, fijos por cargar, cotizaciones que se pueden cerrar y cobros pendientes, con monto y probabilidad. Termina con las 3 acciones de esta semana que más acercan a la meta.',
        siguiente: ['plan_cobranza'],
    },
    {
        id: 'plan_cobranza', departamento: 'finanzas', titulo: 'Plan de cobranza', para: 'Recordatorios de cobro escalonados para cada factura pendiente.',
        campos: [{ key: 'tono', etiqueta: '¿Algún cliente delicado o tono especial?', tipo: 'parrafo' }],
        herramientas: ['list_invoices', 'get_briefing', 'get_revenue_summary'],
        encargo: 'Lista las facturas enviadas sin pagar ordenadas por antigüedad y monto. Para cada una escribe el recordatorio que toca según los días de atraso (amable, firme o llamada), listo para WhatsApp o correo. Cierra con el total por cobrar y cuánto se podría recuperar este mes.',
        siguiente: ['plan_meta_mes'],
    },
    {
        id: 'revision_precios', departamento: 'finanzas', titulo: 'Revisar mis precios', para: 'Precio sugerido, paquetes y cómo comunicar el cambio.',
        campos: [
            { key: 'servicio', etiqueta: '¿Qué servicio?', tipo: 'texto', requerido: true },
            { key: 'precio', etiqueta: 'Precio actual', tipo: 'texto', requerido: true },
            { key: 'horas', etiqueta: 'Horas que te toma al mes o por entrega', tipo: 'numero' },
        ],
        herramientas: ['get_revenue_summary', 'list_invoices'],
        web: true,
        encargo: 'Evalúa el precio: costo por hora real, margen, referencia de mercado en Venezuela y Latinoamérica (busca en la web y cita la fuente, sin nombrar competidores de JAM Tech como recomendación), y propone un precio o tres paquetes (básico, recomendado, completo). Incluye cómo comunicar el cambio a los clientes actuales.',
    },

    // ── 📣 Marketing · Camila
    {
        id: 'plan_contenido_mes', departamento: 'marketing', titulo: 'Plan de contenido del mes', para: 'Calendario de 4 semanas con pilares, ideas, ganchos y llamadas a la acción.',
        campos: [
            { key: 'canales', etiqueta: 'Canales', tipo: 'texto', requerido: true, ayuda: 'Ej.: Instagram, LinkedIn y el boletín.' },
            { key: 'objetivo', etiqueta: '¿Qué quieres lograr este mes con el contenido?', tipo: 'parrafo', requerido: true },
            { key: 'frecuencia', etiqueta: 'Publicaciones por semana', tipo: 'numero' },
        ],
        herramientas: ['brevo_resumen', 'brevo_campanas', 'leads_web'],
        encargo: 'Arma el plan de contenido de 4 semanas: 3 pilares de contenido ligados al cliente ideal, y por semana las piezas con canal, formato, gancho (la primera frase), idea central y llamada a la acción. Incluye 2 piezas que lleven a los imanes de clientes de la web y la fecha del boletín.',
        siguiente: ['campana_correo'],
    },
    {
        id: 'campana_correo', departamento: 'marketing', titulo: 'Campaña de correo', para: 'Secuencia de 3 a 5 correos con asunto, preheader y texto.',
        campos: [
            { key: 'que', etiqueta: '¿Qué promocionas?', tipo: 'texto', requerido: true },
            { key: 'oferta', etiqueta: 'Oferta o incentivo', tipo: 'texto' },
            { key: 'fecha', etiqueta: 'Fecha de inicio', tipo: 'fecha' },
        ],
        herramientas: ['brevo_resumen', 'brevo_campanas'],
        encargo: 'Escribe una secuencia de correos para Brevo (de 3 a 5): para cada uno, día de envío, asunto (y una alternativa para prueba A/B), preheader, texto completo y botón. La secuencia va de despertar interés a cerrar. Indica a qué lista enviarla según los datos de Brevo.',
        siguiente: ['plan_contenido_mes'],
    },
    {
        id: 'iman_clientes', departamento: 'marketing', titulo: 'Imán de clientes', para: '3 ideas de regalo para captar leads y la página de la mejor.',
        campos: [
            { key: 'para_quien', etiqueta: '¿A qué cliente quieres atraer?', tipo: 'texto', requerido: true },
            { key: 'problema', etiqueta: '¿Qué problema le resuelve el regalo?', tipo: 'parrafo' },
        ],
        herramientas: ['leads_web', 'brevo_resumen'],
        encargo: 'Propón 3 ideas de imán de clientes (guía, plantilla, diagnóstico, minicurso…) con su promesa en una frase. Desarrolla la mejor: índice del contenido, textos de la página de captura (titular, beneficios, formulario, botón) y el primer correo de bienvenida.',
        siguiente: ['campana_correo'],
    },

    // ── 🔎 SEO · Nicolás
    {
        id: 'plan_seo_90', departamento: 'seo', titulo: 'Plan SEO de 90 días', para: 'Diagnóstico de un cliente y su plan mes a mes.',
        campos: [{ key: 'cliente', etiqueta: 'Cliente SEO (nombre o dominio)', tipo: 'texto', requerido: true }],
        herramientas: ['seo_cartera', 'seo_cliente'],
        encargo: 'Busca al cliente en seo_cartera y abre su ficha con seo_cliente. Escribe su diagnóstico con cifras (clics, consultas y páginas que suben o bajan, alertas, recomendaciones abiertas) y un plan de 90 días: mes 1, 2 y 3, cada uno con 3 a 5 acciones, quién las hace y cómo se mide.',
        siguiente: ['mensaje_reporte'],
    },
    {
        id: 'mensaje_reporte', departamento: 'seo', titulo: 'Mensaje del reporte mensual', para: 'WhatsApp y correo con los 3 datos que el cliente entiende.',
        campos: [{ key: 'cliente', etiqueta: 'Cliente SEO (nombre o dominio)', tipo: 'texto', requerido: true }],
        herramientas: ['seo_cartera', 'seo_cliente'],
        encargo: 'Con la ficha del cliente (seo_cliente), escribe un mensaje de WhatsApp y un correo para enviarle su reporte del mes: 2 o 3 datos que entienda un dueño de negocio, qué hicimos, qué sigue, y el enlace público del reporte si existe. Sin jerga.',
    },
    {
        id: 'propuesta_seo', departamento: 'seo', titulo: 'Propuesta SEO para un prospecto', para: 'Diagnóstico rápido de su web y propuesta de servicio.',
        campos: [
            { key: 'dominio', etiqueta: 'Web del prospecto', tipo: 'texto', requerido: true },
            { key: 'negocio', etiqueta: '¿A qué se dedica y en qué ciudad?', tipo: 'texto', requerido: true },
        ],
        herramientas: [],
        web: true,
        encargo: 'Investiga la web del prospecto y su mercado (busca en la web; cita lo que encuentres). Escribe un diagnóstico rápido (qué tiene bien, qué le falta, oportunidades de búsqueda locales) y una propuesta de servicio SEO con entregables, plazos e inversión del cerebro (si no está, [completar: precio]). Sin prometer posiciones concretas.',
        siguiente: ['plan_seo_90'],
    },

    // ── 🧭 Dirección · Ramón
    {
        id: 'analizar_idea', departamento: 'direccion', titulo: 'Analizar una idea de negocio', para: 'Demanda, margen, tiempo, riesgo y una recomendación clara.',
        campos: [
            { key: 'idea', etiqueta: 'La idea', tipo: 'parrafo', requerido: true },
            { key: 'inversion', etiqueta: 'Dinero y tiempo que podrías dedicarle', tipo: 'texto' },
        ],
        herramientas: ['panorama_empresa', 'objetivos_listar'],
        web: true,
        encargo: 'Evalúa la idea con los datos de la empresa y del mercado (busca en la web y cita fuentes): demanda, precio y margen posibles, tiempo que le quita a José, riesgo, y cómo encaja con las metas. Termina con una recomendación clara (hacer, probar en pequeño o no hacer) y, si es probar, el experimento de 2 semanas.',
    },
    {
        id: 'diagnostico_trimestre', departamento: 'direccion', titulo: 'Diagnóstico del trimestre', para: 'Cómo va la empresa, qué funcionó, qué no y las 3 prioridades que siguen.',
        campos: [{ key: 'foco', etiqueta: '¿Algo que te preocupe especialmente?', tipo: 'parrafo' }],
        herramientas: ['panorama_empresa', 'consejos_direccion', 'objetivos_listar', 'seo_cartera', 'brevo_resumen', 'list_pipeline'],
        encargo: 'Haz el diagnóstico de los últimos 3 meses: ingresos y su tendencia, concentración por cliente, recurrencia, pipeline, marketing y SEO, avance de objetivos. Qué funcionó, qué no, y las 3 prioridades del próximo trimestre con su objetivo medible.',
    },
    {
        id: 'decision', departamento: 'direccion', titulo: 'Ayúdame a decidir', para: 'Opciones comparadas y una recomendación con su porqué.',
        campos: [
            { key: 'decision', etiqueta: '¿Qué tienes que decidir?', tipo: 'parrafo', requerido: true },
            { key: 'opciones', etiqueta: 'Opciones que ves', tipo: 'parrafo' },
            { key: 'preocupa', etiqueta: '¿Qué te preocupa?', tipo: 'parrafo' },
        ],
        herramientas: ['panorama_empresa'],
        encargo: 'Compara las opciones (añade una si falta una obvia): para cada una, lo que gana, lo que cuesta, el riesgo y qué tendría que ser cierto para que funcione. Termina con tu recomendación, por qué, y el primer paso de mañana.',
    },
]

export const TAREA = new Map(TAREAS.map((t) => [t.id, t]))
export const tareasDe = (dep: Departamento) => TAREAS.filter((t) => t.departamento === dep)

/** Título del entregable: el de la tarea y, si hay, el primer dato obligatorio («Propuesta comercial · Dream Bike»). */
export function tituloEntregable(t: TareaGuiada, valores: Record<string, string>): string {
    const primero = t.campos.find((c) => c.requerido && valores[c.key]?.trim())
    const extra = primero ? valores[primero.key].trim().replace(/\s+/g, ' ') : ''
    const corto = extra.length > 60 ? `${extra.slice(0, 57)}…` : extra
    return corto && primero!.tipo !== 'parrafo' ? `${t.titulo} · ${corto}` : t.titulo
}
