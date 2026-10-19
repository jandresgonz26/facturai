'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { crearControlAccion } from './acciones'

export function NuevoControl({ clientes }: { clientes: { id: string; name: string }[] }) {
    const router = useRouter()
    const [abierto, setAbierto] = useState(false)
    const [nombre, setNombre] = useState('')
    const [clientId, setClientId] = useState('')
    const [pendiente, start] = useTransition()

    const crear = () =>
        start(async () => {
            const r = await crearControlAccion({ nombre, client_id: clientId || null })
            if (!r.ok) return void toast.error(r.mensaje)
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
                        <DialogDescription>Luego le pones el plan de cuotas del cliente y los acuerdos con los programadores.</DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); crear() }}>
                        <div className="space-y-1.5">
                            <Label htmlFor="nc-nombre">Nombre</Label>
                            <Input id="nc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required minLength={3} placeholder="Ej.: Total Envíos · Fase 2" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="nc-cliente">Cliente (opcional)</Label>
                            <select id="nc-cliente" value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                                <option value="">Sin cliente</option>
                                {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
                            <Button type="submit" disabled={pendiente || nombre.trim().length < 3}>{pendiente ? 'Creando…' : 'Crear'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
