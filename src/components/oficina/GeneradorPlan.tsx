'use client'

/** Generador de planes: José dice qué quiere lograr y Ramón arma los pasos con el agente correcto en cada uno. */
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LoaderCircle, Route } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { generarPlanAccion } from '@/app/oficina/procesos-acciones'

const EJEMPLOS = ['Lanzar Wapalink en diciembre con 50 clientes de pago', 'Llegar a $6.000 de facturación al mes', 'Conseguir 3 clientes nuevos de SEO este trimestre']

export function GeneradorPlan({ compacto = false }: { compacto?: boolean }) {
    const router = useRouter()
    const [meta, setMeta] = useState('')
    const [fecha, setFecha] = useState('')
    const [contexto, setContexto] = useState('')
    const [trabajando, start] = useTransition()
    const [segundos, setSegundos] = useState(0)

    useEffect(() => {
        if (!trabajando) return
        const t0 = Date.now()
        const id = setInterval(() => setSegundos(Math.round((Date.now() - t0) / 1000)), 1000)
        return () => { clearInterval(id); setSegundos(0) }
    }, [trabajando])

    const generar = () => start(async () => {
        const r = await generarPlanAccion(meta, fecha || null, contexto || null)
        if (r.ok && r.data) { toast.success(r.mensaje); router.push(`/oficina/planes/${r.data.id}`) } else toast.error(r.mensaje)
    })

    return (
        <section id="nuevo-plan" className="rounded-2xl border bg-card p-4" aria-labelledby="titulo-generador">
            <h2 id="titulo-generador" className="flex items-center gap-2 font-semibold"><Route className="h-4 w-4" /> Nuevo plan guiado</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Dile a Ramón qué quieres lograr: arma los pasos, se los asigna a cada agente y la Oficina te guía hasta terminar.</p>
            {trabajando ? (
                <div className="grid place-items-center gap-2 py-8 text-center" role="status" aria-live="polite">
                    <LoaderCircle className="h-7 w-7 animate-spin text-[#D4A72C]" />
                    <p className="font-medium">Ramón está armando el plan…</p>
                    <p className="text-sm text-muted-foreground">Revisa tus cifras, tus objetivos y el cerebro de la empresa{segundos ? ` · ${segundos} s` : ''}.</p>
                </div>
            ) : (
                <form className="mt-3 grid gap-2" onSubmit={(e) => { e.preventDefault(); if (meta.trim().length >= 8) generar() }}>
                    <label htmlFor="plan-meta" className="sr-only">¿Qué quieres lograr?</label>
                    <Textarea id="plan-meta" rows={2} value={meta} onChange={(e) => setMeta(e.target.value)} placeholder="¿Qué quieres lograr? Ej.: lanzar Wapalink en diciembre con 50 clientes de pago" />
                    {!meta && (
                        <div className="flex flex-wrap gap-1.5">
                            {EJEMPLOS.map((x) => <button key={x} type="button" onClick={() => setMeta(x)} className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground">{x}</button>)}
                        </div>
                    )}
                    <div className={`grid gap-2 ${compacto ? '' : 'sm:grid-cols-[180px_1fr]'}`}>
                        <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="plan-fecha">Fecha límite
                            <Input id="plan-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                        </label>
                        <label className="grid gap-1 text-xs text-muted-foreground" htmlFor="plan-contexto">Contexto (opcional)
                            <Input id="plan-contexto" value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Lo que ya tienes, lo que no quieres hacer, presupuesto…" />
                        </label>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit" disabled={meta.trim().length < 8}>Armar el plan</Button>
                    </div>
                </form>
            )}
        </section>
    )
}
