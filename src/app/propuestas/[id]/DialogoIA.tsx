'use client'
/** «Redactar con IA»: borrador completo desde las notas de José, o reescribir el trozo seleccionado. */
import { useState, useTransition } from 'react'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { BorradorIA } from '@/lib/propuestas/ia'
import { redactarAccion, reescribirAccion } from '../acciones'

const ATAJOS = ['Más corto', 'Más formal', 'Más cercano', 'Más claro y directo', 'Conviértelo en una lista']

export function DialogoIA({ abierto, onCerrar, modo, clientId, titulo, seleccion, onBorrador, onReescrito }: {
    abierto: boolean
    onCerrar: () => void
    modo: 'redactar' | 'reescribir'
    clientId: string
    titulo: string
    seleccion: string
    onBorrador: (b: BorradorIA) => void
    onReescrito: (md: string) => void
}) {
    const [notas, setNotas] = useState('')
    const [instruccion, setInstruccion] = useState('')
    const [pendiente, start] = useTransition()

    const redactar = () =>
        start(async () => {
            const r = await redactarAccion({ clientId, titulo, notas })
            if (!r.ok) return void toast.error(r.mensaje)
            onBorrador(r.data!)
            toast.success(r.mensaje, { duration: 9000 })
            onCerrar()
        })
    const reescribirlo = (txt: string) =>
        start(async () => {
            const r = await reescribirAccion(seleccion, txt)
            if (!r.ok) return void toast.error(r.mensaje)
            onReescrito(r.data!)
            onCerrar()
        })

    return (
        <Dialog open={abierto} onOpenChange={(o) => !o && !pendiente && onCerrar()}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Sparkles className="size-5 text-[#48C0C0]" /> {modo === 'redactar' ? 'Redactar con IA' : 'Reescribir lo seleccionado'}</DialogTitle>
                    <DialogDescription>
                        {modo === 'redactar'
                            ? 'Pega lo que sabes: qué hablaron, qué necesita, precios que le diste, incluso la conversación de WhatsApp. La IA arma la propuesta con la plantilla de JAM Tech, tus servicios y tu voz de marca, y propone la tabla de precios. Reemplaza el contenido actual.'
                            : 'Di cómo quieres el texto. Se conservan los datos y cifras; solo cambia la forma.'}
                    </DialogDescription>
                </DialogHeader>
                {modo === 'redactar' ? (
                    <form id="form-ia" onSubmit={(e) => { e.preventDefault(); redactar() }}>
                        <label htmlFor="ia-notas" className="sr-only">Notas</label>
                        <textarea id="ia-notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={12} autoFocus placeholder={'Ej.: Clínica dental en Puerto Ordaz, 2 sedes. Quieren web nueva (la actual es de 2019 y no sale en Google), agendar citas en línea y aparecer en Google Maps. Presupuesto aprox. $1.500. Les ofrecí mantenimiento mensual de $60. Quieren estar en línea antes de diciembre.'} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
                        <p className="mt-1.5 text-xs text-muted-foreground">Si falta un precio, lo deja «a convenir» y te dice qué falta. No inventa cifras.</p>
                    </form>
                ) : (
                    <form id="form-ia" onSubmit={(e) => { e.preventDefault(); reescribirlo(instruccion) }} className="space-y-3">
                        <div className="max-h-40 overflow-y-auto rounded-md border bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">{seleccion}</div>
                        <div className="flex flex-wrap gap-1.5">
                            {ATAJOS.map((a) => <Button key={a} type="button" size="xs" variant="outline" disabled={pendiente} onClick={() => reescribirlo(a)}>{a}</Button>)}
                        </div>
                        <label htmlFor="ia-instruccion" className="sr-only">Instrucción</label>
                        <input id="ia-instruccion" value={instruccion} onChange={(e) => setInstruccion(e.target.value)} placeholder="O escribe tu instrucción: «menciona que el soporte es por WhatsApp»" className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" />
                    </form>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onCerrar} disabled={pendiente}>Cancelar</Button>
                    <Button type="submit" form="form-ia" disabled={pendiente || (modo === 'redactar' ? notas.trim().length < 15 : false)}>
                        {pendiente ? (modo === 'redactar' ? 'Redactando… (puede tardar un minuto)' : 'Reescribiendo…') : modo === 'redactar' ? 'Redactar propuesta' : 'Reescribir'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
