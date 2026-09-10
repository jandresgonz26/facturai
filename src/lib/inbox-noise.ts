/**
 * Reglas para separar el correo automático del que escribe una persona.
 *
 * Los patrones salen de la bandeja real del usuario, no de suposiciones:
 * avisos de WordPress de las webs que administra, alertas de seguridad,
 * notificaciones de organismos, encuestas de tickets y autorespuestas de
 * formularios de contacto.
 *
 * Criterio: ante la duda, NO marcar como ruido. Es mucho peor esconder el
 * correo de un cliente que dejar pasar una notificación.
 */

/** Parte local del remitente que delata un emisor automático. */
const NOISE_LOCAL_PARTS = [
    'noreply',
    'no-reply',
    'no_reply',
    'donotreply',
    'do-not-reply',
    'notification',
    'notifications',
    'notificacion',
    'notificaciones',
    'wordpress',
    'mailer',
    'mailer-daemon',
    'postmaster',
    'bounce',
    'bounces',
    'alerts',
    'alert',
    'newsletter',
    'noticias',
    'automated',
    'automatic',
]

/** Dominios que solo mandan avisos de plataforma. */
const NOISE_DOMAINS = ['facebookmail.com', 'notify.wellsfargo.com', 'em1.cloudflare.com', 'news.domestika.org', 'notifications.hubspot.com']

/** Asuntos que son claramente máquina hablando, aunque el remitente parezca humano. */
const NOISE_SUBJECTS: { pattern: RegExp; reason: string }[] = [
    { pattern: /^re:?\s*recibimos tu (consulta|mensaje|solicitud)/i, reason: 'autorespuesta de formulario' },
    { pattern: /^recibimos tu (consulta|mensaje|solicitud)/i, reason: 'autorespuesta de formulario' },
    { pattern: /gracias por (contactarnos|escribirnos|tu mensaje)/i, reason: 'autorespuesta de formulario' },
    { pattern: /restablecer (la )?contrase(ñ|n)a|password reset/i, reason: 'restablecimiento de contraseña' },
    { pattern: /backup (error )?report|informe de copia/i, reason: 'informe automático de respaldo' },
    { pattern: /error de inicio de sesi(ó|o)n|failed login/i, reason: 'alerta de inicio de sesión' },
    { pattern: /\[ticket id:|ticket #\d+/i, reason: 'sistema de tickets' },
    { pattern: /su opini(ó|o)n es muy importante|encuesta de satisfacci(ó|o)n/i, reason: 'encuesta automática' },
    // Solo informes que genera una plataforma. Un "informe de gestión" puede ser
    // el entregable de una persona, y esconderlo sería peor que dejarlo pasar.
    { pattern: /^informe de (instagram|facebook|google ads|analytics)/i, reason: 'informe automático de plataforma' },
    { pattern: /activar la protecci(ó|o)n avanzada/i, reason: 'aviso de seguridad de plataforma' },
    { pattern: /notificaci(ó|o)n tributaria/i, reason: 'notificación automática de organismo' },
    { pattern: /pago registrado del recibo/i, reason: 'comprobante automático' },
    { pattern: /informe de la exploraci(ó|o)n|scan report/i, reason: 'informe automático' },
]

export interface NoiseVerdict {
    isNoise: boolean
    reason: string | null
}

/**
 * Decide si un correo es ruido. Si el remitente coincide con un cliente
 * conocido se es más exigente: solo se marca por asunto inequívocamente
 * automático, nunca por su dirección.
 */
export function classifyNoise(
    fromEmail: string,
    subject: string,
    opts: { isKnownClient?: boolean; mutedSenders?: Set<string> } = {}
): NoiseVerdict {
    const email = fromEmail.toLowerCase().trim()
    const [local = '', domain = ''] = email.split('@')

    if (opts.mutedSenders?.has(email)) {
        return { isNoise: true, reason: 'silenciado por ti' }
    }

    // El asunto manda: aplica incluso a clientes conocidos.
    for (const { pattern, reason } of NOISE_SUBJECTS) {
        if (pattern.test(subject)) return { isNoise: true, reason }
    }

    // A un cliente conocido no se le esconde por su dirección.
    if (opts.isKnownClient) return { isNoise: false, reason: null }

    if (NOISE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
        return { isNoise: true, reason: 'dominio de notificaciones' }
    }
    if (NOISE_LOCAL_PARTS.some((p) => local === p || local.startsWith(`${p}.`) || local.startsWith(`${p}-`) || local.startsWith(`${p}+`))) {
        return { isNoise: true, reason: 'remitente automático' }
    }

    return { isNoise: false, reason: null }
}
