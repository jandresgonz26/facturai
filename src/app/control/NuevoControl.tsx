'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PropuestaEnlazable } from '@/lib/control/datos'
import { crearControlAccion } from './acciones'

const select = 'h-9 w-full rounded-md border bg-background px-3 text-sm'

export function NuevoControl({ clientes, propuestas }: { clientes: { id: string; name: string }[]; propuestas: PropuestaEnlazable[] }) {
    const router = useRouter()
    const [abierto, setAbierto] = useState(false)
    const [nombre, setNombre] = useState('')
    const [clientId, setClientId] = useState('')
    const [propuestaId, setPropuestaId] = useState('')
    const [pendiente, start] = useTransition()

    const propuesta = propuestas.find((p) => p.id === propuestaId)
    const visibles = clientId ? propuestas.filter((p) => p.client_id === clientId) : propuestas
    // Con propuesta, el nombre puede quedar vacío: se usa su título.
    const nombreValido = nombre.trim().length >= 3 || !!propuesta

    const elegirCliente = (id: string) => {
        setClientId(id)
        if (propuesta && id && propuesta.client_id !== id) setPropuestaId('')
    }
    const elegirPropuesta = (id: string) => {
        setPropuestaId(id)
        const p = propuestas.find((x) => x.id === id)
        if (p) setClientId(p.client_id)
    }

    const crear = () =>
        start(async () => {
            const r = await crearControlAccion({ nombre, client_id: clientId || null, propuesta_id: propuestaId || null })
            if (!r.ok) return void toast.error(r.mensaje)
            if (propuestaId) toast.success(r.mensaje)
            setAbierto(false)
            router.push(`/control/${r.data}`)
        })

    return (
        <>
            <Button onClick={() => setAbierto(true)}><Plus /> Nuevo proyecto</Button>
            <Dialog open={abierto} onOpenChange={setAbierto}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nuevo proyecto en el control</DialogTitle>
                        <DialogDescription>Si sale de una propuesta, elígela: trae el cliente, la moneda y las cuotas. Luego añades los acuerdos con los programadores.</DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); crear() }}>
                        <div className="space-y-1.5">
                            <Label htmlFor="nc-cliente">Cliente (opcional)</Label>
                            <select id="nc-cliente" value={clientId} onChange={(e) => elegirCliente(e.target.value)} className={select}>
                                <option value="">Sin cliente</option>
                                {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="nc-propuesta">Propuesta (opcional)</Label>
                            <select id="nc-propuesta" value={propuestaId} onChange={(e) => elegirPropuesta(e.target.value)} className={select} disabled={visibles.length === 0}>
                                <option value="">{visibles.length ? 'Sin propuesta' : clientId ? 'Este cliente no tiene propuestas' : 'Aún no hay propuestas'}</option>
                                {visibles.map((p) => <option key={p.id} value={p.id}>{p.number} · {p.title}{p.status === 'accepted' ? ' (aceptada)' : ''}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="nc-nombre">Nombre</Label>
                            <Input id="nc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={propuesta ? propuesta.title : 'Ej.: Total Envíos · Fase 2'} />
                            {propuesta && !nombre.trim() && <p className="text-xs text-muted-foreground">Si lo dejas vacío, se llama como la propuesta.</p>}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
                            <Button type="submit" disabled={pendiente || !nombreValido}>{pendiente ? 'Creando…' : 'Crear'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
