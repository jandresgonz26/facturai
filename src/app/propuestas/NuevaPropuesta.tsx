'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Link2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { crearPropuestaAccion } from './acciones'

const ETAPA: Record<string, string> = { lead: 'Lead', quoted: 'Cotizado', active: 'Cliente', inactive: 'Inactivo' }

/**
 * «Nuevo»: primero pregunta qué hace falta. Una propuesta con enlace (el cliente la abre y la acepta en línea) o una
 * cotización rápida en PDF (para enviar o para dejar registro, también cuando se negocia con un intermediario).
 */
export function NuevaPropuesta({ clientes, clienteInicial }: { clientes: { id: string; name: string; stage: string }[]; clienteInicial?: string }) {
    const router = useRouter()
    const [abierto, setAbierto] = useState(false)
    const [paso, setPaso] = useState<'tipo' | 'enlace'>('tipo')
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
            <Button onClick={() => { setPaso('tipo'); setAbierto(true) }}>
                <Plus /> Nueva
            </Button>
            <Dialog open={abierto} onOpenChange={setAbierto}>
                <DialogContent>
                    {paso === 'tipo' ? (
                        <>
                            <DialogHeader>
                                <DialogTitle>¿Qué necesitas?</DialogTitle>
                                <DialogDescription>Las dos quedan guardadas para que sepas qué le ofreciste a quién.</DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-3">
                                <button type="button" onClick={() => setPaso('enlace')} className="flex items-start gap-3 rounded-xl border p-4 text-left transition hover:border-primary hover:bg-accent/50">
                                    <Link2 className="mt-0.5 size-5 shrink-0 text-primary" />
                                    <span>
                                        <span className="block font-medium">Propuesta con enlace</span>
                                        <span className="block text-sm text-muted-foreground">Un documento completo que el cliente abre, revisa y acepta en línea. Para cuando tratas directo con él.</span>
                                    </span>
                                </button>
                                <button type="button" onClick={() => { setAbierto(false); router.push('/quotes') }} className="flex items-start gap-3 rounded-xl border p-4 text-left transition hover:border-primary hover:bg-accent/50">
                                    <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
                                    <span>
                                        <span className="block font-medium">Cotización rápida (PDF)</span>
                                        <span className="block text-sm text-muted-foreground">Precios en un PDF para enviar o para tu registro, con plantilla de JAM Tech o de Asiri. Nadie la acepta aquí: tú la marcas cuando sepas la respuesta.</span>
                                    </span>
                                </button>
                            </div>
                        </>
                    ) : (
                    <>
                    <DialogHeader>
                        <DialogTitle>Nueva propuesta con enlace</DialogTitle>
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
                            <Button type="button" variant="outline" onClick={() => setPaso('tipo')}>Atrás</Button>
                            <Button type="submit" disabled={pendiente || !clientId || titulo.trim().length < 3}>{pendiente ? 'Creando…' : 'Crear y abrir'}</Button>
                        </DialogFooter>
                    </form>
                    </>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
