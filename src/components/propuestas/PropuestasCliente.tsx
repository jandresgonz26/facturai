'use client'
/** Propuestas de un cliente en su ficha: el hilo de todo lo que se le ha propuesto, con su estado. */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileSignature, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { estadoDe, type EstadoPropuesta } from '@/lib/propuestas/tipos'

type Fila = { id: string; number: string; title: string; status: EstadoPropuesta; updated_at: string }

export function PropuestasCliente({ clientId }: { clientId: string }) {
    const [filas, setFilas] = useState<Fila[] | null>(null)
    useEffect(() => {
        let activo = true
        supabase
            .from('proposals')
            .select('id, number, title, status, updated_at')
            .eq('client_id', clientId)
            .order('updated_at', { ascending: false })
            .limit(20)
            .then(({ data }) => activo && setFilas((data ?? []) as Fila[]))
        return () => {
            activo = false
        }
    }, [clientId])

    return (
        <section className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium"><FileSignature className="h-4 w-4 text-sky-600" /> Propuestas</span>
                <Link href={`/propuestas?cliente=${clientId}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Plus className="h-3.5 w-3.5" /> Nueva o ver todas</Link>
            </div>
            {filas === null ? (
                <p className="text-xs text-muted-foreground">Cargando…</p>
            ) : filas.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aún no se le ha enviado ninguna propuesta.</p>
            ) : (
                <ul className="divide-y">
                    {filas.map((f) => {
                        const e = estadoDe(f.status)
                        return (
                            <li key={f.id}>
                                <Link href={`/propuestas/${f.id}`} className="flex items-center gap-2 py-1.5 text-sm hover:underline">
                                    <span className="font-mono text-xs text-muted-foreground">{f.number}</span>
                                    <span className="min-w-0 flex-1 truncate">{f.title}</span>
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${e.tono}`}>{e.label}</span>
                                </Link>
                            </li>
                        )
                    })}
                </ul>
            )}
        </section>
    )
}
