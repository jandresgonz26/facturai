'use client'

/**
 * Menú que se abre al tocar a un departamento en la oficina: preguntas rápidas
 * para ese equipo y un campo para preguntar otra cosa. Las preguntas que
 * terminan en "…" no se envían: se dejan escritas en el chat para completarlas.
 */
import { useState } from 'react'
import { ArrowRight, PencilLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { DEPARTAMENTOS, type Departamento } from '@/lib/agent/shared'

const PREGUNTAS: Record<Departamento, string[]> = {
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
}

interface Props {
    dep: Departamento | null
    onClose: () => void
    /** `enviar` false deja el texto escrito en el chat sin mandarlo. */
    onPreguntar: (texto: string, enviar: boolean) => void
}

export function MenuDepartamento({ dep, onClose, onPreguntar }: Props) {
    const [otra, setOtra] = useState('')
    const cerrar = () => { setOtra(''); onClose() }
    const info = dep ? DEPARTAMENTOS[dep] : null

    const elegir = (pregunta: string) => {
        const abierta = pregunta.endsWith('…')
        const texto = `${info!.nombre}: ${abierta ? pregunta.slice(0, -1) : pregunta}`
        onPreguntar(texto, !abierta)
        cerrar()
    }
    const enviarOtra = () => {
        const t = otra.trim()
        if (!t) return
        onPreguntar(`${info!.nombre}: ${t}`, true)
        cerrar()
    }

    return (
        <Dialog open={!!dep} onOpenChange={(o) => { if (!o) cerrar() }}>
            <DialogContent className="sm:max-w-md">
                {info && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><span className="text-xl">{info.emoji}</span> {info.nombre}</DialogTitle>
                            <DialogDescription>{info.descripcion}. Elige una pregunta o escribe la tuya.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-1.5">
                            {PREGUNTAS[dep!].map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => elegir(p)}
                                    className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                                >
                                    <span>{p}</span>
                                    {p.endsWith('…') ? <PencilLine className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ArrowRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                                </button>
                            ))}
                        </div>
                        <div className="grid gap-2 pt-1">
                            <Textarea
                                id={`otra-pregunta-${dep}`}
                                value={otra}
                                onChange={(e) => setOtra(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarOtra() } }}
                                placeholder={`Pregúntale otra cosa a ${info.nombre}…`}
                                rows={2}
                            />
                            <Button onClick={enviarOtra} disabled={!otra.trim()} className="justify-self-end">Preguntar <ArrowRight /></Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
