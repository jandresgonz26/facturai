'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { crearPropuestaAccion } from './acciones'

const ETAPA: Record<string, string> = { lead: 'Lead', quoted: 'Cotizado', active: 'Cliente', inactive: 'Inactivo' }

/** Nueva propuesta: para un cliente o lead de la ficha (o uno nuevo, que se crea como lead). */
export function NuevaPropuesta({ clientes, clienteInicial }: { clientes: { id: string; name: string; stage: string }[]; clienteInicial?: string }) {
    const router = useRouter()
    const [abierto, setAbierto] = useState(false)
    const [clientId, setClientId] = useState(clienteInicial && clientes.some((c) => c.id === clienteInicial) ? clienteInicial : '')
    const [nuevo, setNuevo] = useState('')
    const [titulo, setTitulo] = useState('')
    const [pendiente, start] = useTransition()

    const crear = () =>
        start(async () => {
            const r = await crearPropuestaAccion({ client_id: clientId === '__nuevo' ? undefined : clientId || undefined, nuevo_cliente: clientId === '__nuevo' ? nuevo : undefined, title: titulo })
            if (!r.ok) return void toast.error(r.mensaje)
            setAbierto(false)
            router.push(`/propuestas/${r.data!.id}`)
        })

    return (
        <>
            <Button onClick={() => setAbierto(true)}>
                <Plus /> Nueva propuesta
            </Button>
            <Dialog open={abierto} onOpenChange={setAbierto}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Nueva propuesta</DialogTitle>
                        <DialogDescription>Se abre con la plantilla de JAM Tech. Luego la escribes tú o la redactas con IA a partir de tus notas.</DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); crear() }}>
                        <div className="space-y-1.5">
                            <Label htmlFor="np-cliente">Para</Label>
                            <select id="np-cliente" value={clientId} onChange={(e) => setClientId(e.target.value)} required className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                                <option value="" disabled>Elige un cliente o lead…</option>
                                <option value="__nuevo">+ Alguien nuevo (se crea como lead)</option>
                                {clientes.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name} · {ETAPA[c.stage] ?? c.stage}</option>
                                ))}
                            </select>
                        </div>
                        {clientId === '__nuevo' && (
                            <div className="space-y-1.5">
                                <Label htmlFor="np-nuevo">Nombre del cliente o empresa</Label>
                                <Input id="np-nuevo" value={nuevo} onChange={(e) => setNuevo(e.target.value)} required minLength={2} placeholder="Ej.: Clínica Dental Sonrisa" />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="np-titulo">Título</Label>
                            <Input id="np-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required minLength={3} maxLength={200} placeholder="Ej.: Nueva web y SEO local" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
                            <Button type="submit" disabled={pendiente || !clientId || titulo.trim().length < 3}>{pendiente ? 'Creando…' : 'Crear y abrir'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
