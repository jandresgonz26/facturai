import type { Departamento } from '@/lib/agent/shared'

/** Preguntas rápidas de cada agente (las que terminan en «…» se dejan escritas para completarlas). */
export const PREGUNTAS: Record<Departamento, string[]> = {
    operaciones: [
        '¿Qué toca hoy y qué tengo arrastrado?',
        'Arma mi plan del día',
        '¿Por dónde empiezo ahora?',
        '¿Qué correos esperan respuesta?',
        '¿Qué recordatorios tengo pendientes?',
        'Anota una tarea: …',
    ],
    ventas: [
        '¿A quién debo hacer seguimiento esta semana?',
        '¿Qué cotizaciones siguen sin respuesta?',
        '¿Qué leads llegaron por la web?',
        '¿Qué ha pasado con el cliente …',
        'Redáctame un mensaje de seguimiento para …',
        'Cotízale a …',
    ],
    finanzas: [
        '¿Quién me debe y cuánto?',
        '¿Cuánto facturé y cobré este mes?',
        '¿Qué falta por facturar?',
        '¿Qué servicios fijos faltan por cargar?',
        'Prepárame el recordatorio de cobro para …',
        'Factúrale el mes a …',
    ],
    marketing: [
        '¿Cómo van las listas y cuándo toca el próximo boletín?',
        '¿Cómo fue el último boletín?',
        'Redacta la próxima edición del boletín',
        '¿Qué leads llegaron por la web esta semana?',
        'Dame tres ideas de tema para el boletín sobre …',
    ],
    seo: [
        '¿Cómo va el SEO de mis clientes este mes?',
        '¿Qué cliente bajó y por qué?',
        '¿Qué reportes del mes faltan por enviar?',
        '¿Hay alertas urgentes en algún sitio?',
        'Dame el enlace del reporte de …',
        'Resúmeme el SEO de … para mandárselo por WhatsApp',
    ],
    direccion: [
        '¿Cómo va la empresa este mes?',
        '¿Qué oportunidades ves para ganar más dinero?',
        '¿Qué riesgos o fallos tiene hoy la empresa?',
        '¿Dependo demasiado de algún cliente?',
        '¿Qué debería dejar de hacer?',
        '¿Qué pasó con tus consejos anteriores?',
        'Analiza esta idea de negocio: …',
    ],
}
