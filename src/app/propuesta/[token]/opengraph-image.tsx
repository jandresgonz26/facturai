import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { ImageResponse } from 'next/og'
import { propuestaPublica } from '@/lib/propuestas/datos'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Propuesta de JAM Tech'

/** La tarjeta que muestran WhatsApp, Telegram o el correo al pegar el enlace: marca, título y para quién. */
export default async function Imagen({ params }: { params: Promise<{ token: string }> }) {
    const p = await propuestaPublica((await params).token)
    const [outfit, inter, logo] = await Promise.all([
        readFile(path.join(process.cwd(), 'src/lib/propuestas/fuentes/Outfit-SemiBold.ttf')),
        readFile(path.join(process.cwd(), 'src/lib/propuestas/fuentes/Inter-Medium.ttf')),
        readFile(path.join(process.cwd(), 'public/brand/jamtech-logo-white.png')),
    ])
    const titulo = p?.title ?? 'Propuesta de JAM Tech'
    return new ImageResponse(
        (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#0B3552', padding: '64px 72px', position: 'relative', fontFamily: 'Inter' }}>
                <div style={{ position: 'absolute', top: -260, right: -200, width: 760, height: 760, borderRadius: 9999, background: 'radial-gradient(circle, rgba(72,192,192,0.55) 0%, rgba(72,192,192,0) 65%)' }} />
                <div style={{ position: 'absolute', bottom: -320, right: 220, width: 640, height: 640, borderRadius: 9999, background: 'radial-gradient(circle, rgba(104,184,64,0.35) 0%, rgba(104,184,64,0) 65%)' }} />
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: 'linear-gradient(90deg, #106898, #48C0C0, #68B840)' }} />
                {/* eslint-disable-next-line jsx-a11y/alt-text -- imagen de next/og */}
                <img src={`data:image/png;base64,${logo.toString('base64')}`} height={64} style={{ height: 64 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ color: '#9fd6e0', fontSize: 26, letterSpacing: 6, textTransform: 'uppercase' }}>{p ? `Propuesta · ${p.number}` : 'Propuesta'}</div>
                    <div style={{ color: '#ffffff', fontFamily: 'Outfit', fontSize: titulo.length > 60 ? 58 : 72, lineHeight: 1.08, marginTop: 18, maxWidth: 1000 }}>{titulo}</div>
                    {p?.clients?.name && <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 32, marginTop: 26 }}>Preparada para {p.clients.name}</div>}
                </div>
            </div>
        ),
        { ...size, fonts: [{ name: 'Outfit', data: outfit, weight: 600 }, { name: 'Inter', data: inter, weight: 500 }] },
    )
}
