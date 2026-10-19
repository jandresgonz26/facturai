'use client'
/**
 * Un proyecto del control interno: a la izquierda lo que cobras al cliente (cuotas, abonos), a la derecha
 * lo que pagas a cada programador (acuerdos con su propuesta, pagos), y arriba los saldos y el margen.
 */
import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FileText, Paperclip, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { dinero, type CuentaProveedor, type CuotaCalculada } from '@/lib/control/calculo'
import type { ControlCompleto } from '@/lib/control/datos'
import { actualizarAcuerdoAccion, actualizarControlAccion, agregarAcuerdoAccion, agregarCuotaAccion, agregarMovimientoAccion, borrarControlAccion, borrarFilaAccion } from '../acciones'

const campo = 'h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30'
const hoy = () => new Date().toISOString().slice(0, 10)
const fecha = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

const ESTADO_CUOTA: Record<CuotaCalculada['estado'], { label: string; tono: string }> = {
    pagada: { label: 'Pagada', tono: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
    parcial: { label: 'Parcial', tono: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
    vencida: { label: 'Vencida', tono: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' },
    pendiente: { label: 'Pendiente', tono: 'bg-muted text-muted-foreground' },
}

type Accion = () => Promise<{ ok: boolean; mensaje: string }>

export function PanelControl({ datos }: { datos: ControlCompleto }) {
    const router = useRouter()
    const [pendiente, start] = useTransition()
    const { proyecto: p, resumen: r } = datos
    const m = (n: number) => dinero(n, p.moneda)

    const correr = (fn: Accion, despues?: () => void) =>
        start(async () => {
            const res = await fn()
            if (!res.ok) return void toast.error(res.mensaje)
            toast.success(res.mensaje)
            despues?.()
            router.refresh()
        })
    const borrar = (tipo: 'cuota' | 'acuerdo' | 'movimiento', id: string, que: string) => {
        if (confirm(`¿Borrar ${que}?`)) correr(() => borrarFilaAccion(p.id, tipo, id))
    }

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <div className="flex flex-wrap items-center gap-3">
                <Link href="/control" className="mr-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Control de proyectos</Link>
                {p.proposals && p.propuesta_id && <Link href={`/propuestas/${p.propuesta_id}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><FileText className="size-4" /> Propuesta {p.proposals.number}</Link>}
                <Button variant="outline" size="sm" disabled={pendiente} onClick={() => correr(() => actualizarControlAccion(p.id, { estado: p.estado === 'activo' ? 'cerrado' : 'activo' }))}>{p.estado === 'activo' ? 'Cerrar proyecto' : 'Reabrir'}</Button>
                <Button variant="ghost" size="icon-sm" aria-label="Borrar proyecto" onClick={() => { if (confirm('¿Borrar este proyecto del control con todas sus cuotas, acuerdos y pagos? No se puede deshacer.')) start(async () => { const x = await borrarControlAccion(p.id); if (!x.ok) return void toast.error(x.mensaje); router.push('/control') }) }}><Trash2 /></Button>
            </div>

            <header>
                <div className="text-sm text-muted-foreground">{p.clients?.name ?? 'Sin cliente'}{p.estado === 'cerrado' ? ' · Cerrado' : ''}</div>
                <h1 className="font-display text-2xl font-bold">{p.nombre}</h1>
                {p.notas && <p className="mt-1 max-w-prose text-sm whitespace-pre-line text-muted-foreground">{p.notas}</p>}
            </header>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumen">
                <Tile titulo="Te falta cobrar" valor={m(r.porCobrar)} detalle={`${m(r.cobrado)} cobrados de ${m(r.totalCobrar)}${r.aFavor > 0 ? ` · ${m(r.aFavor)} a favor del cliente` : ''}`} />
                <Tile titulo="Te falta pagar" valor={m(r.porPagar)} detalle={`${m(r.pagado)} pagados de ${m(r.totalPagar)}${r.porConfirmar > 0 ? ` · ${m(r.porConfirmar)} por confirmar` : ''}`} />
                <Tile titulo="Margen previsto" valor={m(r.margenPrevisto)} detalle={r.totalCobrar > 0 ? `${Math.round((r.margenPrevisto / r.totalCobrar) * 100)} % de lo que cobras` : 'Sin plan de cobro'} tono="verde" />
                <Tile titulo="En caja hoy" valor={m(r.margenHoy)} detalle="Cobrado menos pagado" tono={r.margenHoy < 0 ? 'rojo' : undefined} />
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* ── Cliente ── */}
                <section className="space-y-4 rounded-2xl border bg-card p-4">
                    <div>
                        <h2 className="font-semibold">Lo que cobras al cliente</h2>
                        {r.proximaCuota && <p className="text-sm text-muted-foreground">Próxima: {r.proximaCuota.concepto} · faltan {m(r.proximaCuota.falta)}{r.proximaCuota.vence ? ` · vence ${fecha(r.proximaCuota.vence)}` : ''}</p>}
                    </div>
                    <ol className="divide-y rounded-lg border">
                        {r.cuotas.map((c, i) => (
                            <li key={c.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                                <span className="mt-0.5 w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{c.extra ? '+' : i + 1}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-medium">{c.concepto}</div>
                                    {c.detalle && <div className="text-xs text-muted-foreground">{c.detalle}</div>}
                                    <div className="text-xs text-muted-foreground">
                                        {c.estado === 'pagada' ? (c.pagadaEl ? `Completada el ${fecha(c.pagadaEl)}` : 'Completada') : c.estado === 'parcial' ? `Abonado ${m(c.aplicado)} · faltan ${m(c.falta)}` : c.vence ? `Vence ${fecha(c.vence)}` : ''}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-medium tabular-nums">{m(c.monto)}</div>
                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ESTADO_CUOTA[c.estado].tono}`}>{ESTADO_CUOTA[c.estado].label}</span>
                                </div>
                                <Button variant="ghost" size="icon-xs" aria-label={`Borrar ${c.concepto}`} onClick={() => borrar('cuota', c.id, `«${c.concepto}»`)}><Trash2 /></Button>
                            </li>
                        ))}
                        {r.cuotas.length === 0 && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Aún no hay plan de cuotas.</li>}
                    </ol>
                    <FormCuota pendiente={pendiente} onGuardar={(c, limpiar) => correr(() => agregarCuotaAccion(p.id, c), limpiar)} />

                    <div className="space-y-2 border-t pt-4">
                        <h3 className="text-sm font-semibold">Abonos recibidos</h3>
                        <ul className="space-y-1">
                            {r.abonos.map((a) => (
                                <li key={a.id} className="flex items-center gap-2 text-sm">
                                    <span className="w-28 shrink-0 text-muted-foreground">{fecha(a.fecha)}</span>
                                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{[a.metodo, a.nota].filter(Boolean).join(' · ')}</span>
                                    <span className="font-medium tabular-nums">{m(a.monto)}</span>
                                    <Button variant="ghost" size="icon-xs" aria-label="Borrar abono" onClick={() => borrar('movimiento', a.id, `el abono de ${m(a.monto)}`)}><Trash2 /></Button>
                                </li>
                            ))}
                            {r.abonos.length === 0 && <li className="text-sm text-muted-foreground">Ninguno todavía.</li>}
                        </ul>
                        <FormPago id="abono" texto="Registrar abono del cliente" pendiente={pendiente} onGuardar={(x, limpiar) => correr(() => agregarMovimientoAccion(p.id, { lado: 'cliente', ...x }), limpiar)} />
                    </div>
                </section>

                {/* ── Programadores ── */}
                <section className="space-y-4">
                    {r.proveedores.map((pr) => (
                        <Proveedor key={pr.proveedor} pr={pr} m={m} proyectoId={p.id} pendiente={pendiente} correr={correr} borrar={borrar} />
                    ))}
                    <FormAcuerdo nombres={r.proveedores.map((x) => x.proveedor)} pendiente={pendiente} onGuardar={(a, limpiar) => correr(() => agregarAcuerdoAccion(p.id, a), limpiar)} />
                </section>
            </div>
        </div>
    )
}

function Tile({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle: string; tono?: 'verde' | 'rojo' }) {
    return (
        <div className="rounded-xl border bg-card p-4">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titulo}</div>
            <div className={`mt-1 font-display text-2xl font-semibold tabular-nums ${tono === 'verde' ? 'text-emerald-700 dark:text-emerald-400' : tono === 'rojo' ? 'text-rose-700 dark:text-rose-400' : ''}`}>{valor}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{detalle}</div>
        </div>
    )
}

function Proveedor({ pr, m, proyectoId, pendiente, correr, borrar }: { pr: CuentaProveedor; m: (n: number) => string; proyectoId: string; pendiente: boolean; correr: (fn: Accion, despues?: () => void) => void; borrar: (t: 'acuerdo' | 'movimiento', id: string, que: string) => void }) {
    const [subiendo, setSubiendo] = useState<string | null>(null)
    const archivo = useRef<HTMLInputElement>(null)
    const destino = useRef<string | null>(null)
    const router = useRouter()

    async function subir(file: File) {
        const id = destino.current
        if (!id) return
        setSubiendo(id)
        const fd = new FormData()
        fd.append('file', file)
        fd.append('acuerdo', id)
        fd.append('proyecto', proyectoId)
        const res = await fetch('/api/control/archivo', { method: 'POST', body: fd })
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; mensaje?: string }
        setSubiendo(null)
        if (!res.ok || !j.ok) return void toast.error(j.mensaje || 'No se pudo subir.')
        toast.success('Propuesta guardada.')
        router.refresh()
    }

    return (
        <div className="space-y-3 rounded-2xl border bg-card p-4">
            <input ref={archivo} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subir(f) }} />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold">{pr.proveedor}</h2>
                <div className="text-sm tabular-nums">
                    {pr.falta > 0 ? <>Le falta cobrar <span className="font-semibold">{m(pr.falta)}</span></> : pr.falta < 0 ? <span className="text-amber-700 dark:text-amber-400">Le pagaste {m(-pr.falta)} de más</span> : <span className="text-emerald-700 dark:text-emerald-400">Al día</span>}
                </div>
            </div>
            <p className="text-xs text-muted-foreground">
                Acordado {m(pr.acordado)} · pagado {m(pr.pagado)}
                {pr.porConfirmar > 0 && <> · <span className="text-amber-700 dark:text-amber-400">{m(pr.porConfirmar)} por confirmar</span></>}
                {pr.alRitmo > 0 && <> · al ritmo de lo que ya cobraste le corresponden <span className="font-medium text-foreground">{m(pr.alRitmo)}</span> ahora</>}
            </p>
            <ul className="divide-y rounded-lg border">
                {pr.acuerdos.map((a) => (
                    <li key={a.id} className="px-3 py-2.5 text-sm">
                        <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                                <div className="font-medium">{a.concepto}</div>
                                <div className="text-xs text-muted-foreground">Acordado el {fecha(a.fecha)}</div>
                            </div>
                            <div className="text-right">
                                <div className="font-medium tabular-nums">{m(a.monto)}</div>
                                <button type="button" disabled={pendiente} onClick={() => correr(() => actualizarAcuerdoAccion(proyectoId, a.id, { estado: a.estado === 'acordado' ? 'por_confirmar' : 'acordado' }))} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.estado === 'acordado' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`} title="Cambiar estado">
                                    {a.estado === 'acordado' ? 'Acordado' : 'Por confirmar'}
                                </button>
                            </div>
                            <Button variant="ghost" size="icon-xs" aria-label={`Borrar ${a.concepto}`} onClick={() => borrar('acuerdo', a.id, `el acuerdo «${a.concepto}»`)}><Trash2 /></Button>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                            {a.archivo_path ? (
                                <a href={`/api/control/archivo/${a.id}`} target="_blank" rel="noopener" className="flex items-center gap-1 font-medium text-sky-700 hover:underline dark:text-sky-400"><FileText className="size-3.5" /> {a.archivo_nombre || 'Ver propuesta'}</a>
                            ) : null}
                            <button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-foreground" disabled={subiendo === a.id} onClick={() => { destino.current = a.id; archivo.current?.click() }}>
                                <Paperclip className="size-3.5" /> {subiendo === a.id ? 'Subiendo…' : a.archivo_path ? 'Cambiar archivo' : 'Adjuntar su propuesta (PDF o captura)'}
                            </button>
                        </div>
                        {a.detalle && (
                            <details className="mt-1.5">
                                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Lo que incluye</summary>
                                <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">{a.detalle}</p>
                            </details>
                        )}
                    </li>
                ))}
            </ul>
            <div className="space-y-1">
                <h3 className="text-sm font-semibold">Pagos que le hiciste</h3>
                <ul className="space-y-1">
                    {pr.pagos.map((x) => (
                        <li key={x.id} className="flex items-center gap-2 text-sm">
                            <span className="w-28 shrink-0 text-muted-foreground">{fecha(x.fecha)}</span>
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">{[x.metodo, x.nota].filter(Boolean).join(' · ')}</span>
                            <span className="font-medium tabular-nums">{m(x.monto)}</span>
                            <Button variant="ghost" size="icon-xs" aria-label="Borrar pago" onClick={() => borrar('movimiento', x.id, `el pago de ${m(x.monto)}`)}><Trash2 /></Button>
                        </li>
                    ))}
                    {pr.pagos.length === 0 && <li className="text-sm text-muted-foreground">Ninguno todavía.</li>}
                </ul>
            </div>
            <FormPago id={`pago-${pr.proveedor}`} texto={`Registrar pago a ${pr.proveedor.split(' ')[0]}`} sugerido={pr.alRitmo} pendiente={pendiente} onGuardar={(x, limpiar) => correr(() => agregarMovimientoAccion(proyectoId, { lado: 'proveedor', proveedor: pr.proveedor, ...x }), limpiar)} />
        </div>
    )
}

function Desplegable({ texto, children }: { texto: string; children: (cerrar: () => void) => React.ReactNode }) {
    const [abierto, setAbierto] = useState(false)
    if (!abierto) return <Button type="button" variant="outline" size="sm" onClick={() => setAbierto(true)}><Plus /> {texto}</Button>
    return <div className="rounded-lg border bg-muted/30 p-3">{children(() => setAbierto(false))}</div>
}

function FormPago({ id, texto, sugerido, pendiente, onGuardar }: { id: string; texto: string; sugerido?: number; pendiente: boolean; onGuardar: (x: { fecha: string; monto: string; metodo: string; nota: string }, limpiar: () => void) => void }) {
    const [f, setF] = useState({ fecha: hoy(), monto: '', metodo: '', nota: '' })
    const idf = id.replace(/\W+/g, '-')
    return (
        <Desplegable texto={texto}>
            {(cerrar) => (
                <form className="grid gap-2 sm:grid-cols-[9rem_7rem_1fr]" onSubmit={(e) => { e.preventDefault(); onGuardar(f, () => { setF({ fecha: hoy(), monto: '', metodo: '', nota: '' }); cerrar() }) }}>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Fecha</span><input id={`${idf}-fecha`} type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} className={campo} /></label>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Monto</span><input id={`${idf}-monto`} inputMode="decimal" required value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} placeholder={sugerido ? String(sugerido) : '0'} className={`${campo} tabular-nums`} /></label>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Método</span><input id={`${idf}-metodo`} value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value })} placeholder="USDT, transferencia, Zelle…" className={campo} /></label>
                    <label className="space-y-1 sm:col-span-3"><span className="text-xs text-muted-foreground">Nota (opcional)</span><input id={`${idf}-nota`} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} className={campo} /></label>
                    <div className="flex gap-2 sm:col-span-3">
                        <Button type="submit" size="sm" disabled={pendiente || !f.monto}>Guardar</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={cerrar}>Cancelar</Button>
                    </div>
                </form>
            )}
        </Desplegable>
    )
}

function FormCuota({ pendiente, onGuardar }: { pendiente: boolean; onGuardar: (c: { concepto: string; monto: string; vence: string | null; detalle: string; extra: boolean }, limpiar: () => void) => void }) {
    const vacio = { concepto: '', monto: '', vence: '', detalle: '', extra: false }
    const [f, setF] = useState(vacio)
    return (
        <Desplegable texto="Añadir cuota o cobro suelto">
            {(cerrar) => (
                <form className="grid gap-2 sm:grid-cols-[1fr_7rem_9rem]" onSubmit={(e) => { e.preventDefault(); onGuardar({ ...f, vence: f.vence || null }, () => { setF(vacio); cerrar() }) }}>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Concepto</span><input id="cuota-concepto" required value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} placeholder="Cuota 3 · Al entregar… / Videos extra" className={campo} /></label>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Monto</span><input id="cuota-monto" inputMode="decimal" required value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} className={`${campo} tabular-nums`} /></label>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Vence (opcional)</span><input id="cuota-vence" type="date" value={f.vence} onChange={(e) => setF({ ...f, vence: e.target.value })} className={campo} /></label>
                    <label className="space-y-1 sm:col-span-3"><span className="text-xs text-muted-foreground">Detalle (opcional)</span><input id="cuota-detalle" value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} placeholder="Ej.: Web 200 · SEO 200 · App 260" className={campo} /></label>
                    <label className="flex items-center gap-2 text-sm sm:col-span-3"><input id="cuota-extra" type="checkbox" checked={f.extra} onChange={(e) => setF({ ...f, extra: e.target.checked })} /> Es un cobro suelto (fuera del plan, como mantenimiento o videos)</label>
                    <div className="flex gap-2 sm:col-span-3">
                        <Button type="submit" size="sm" disabled={pendiente}>Guardar</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={cerrar}>Cancelar</Button>
                    </div>
                </form>
            )}
        </Desplegable>
    )
}

function FormAcuerdo({ nombres, pendiente, onGuardar }: { nombres: string[]; pendiente: boolean; onGuardar: (a: { proveedor: string; concepto: string; monto: string; estado: 'acordado' | 'por_confirmar'; fecha: string; detalle: string }, limpiar: () => void) => void }) {
    const vacio = { proveedor: nombres[0] ?? '', concepto: '', monto: '', estado: 'acordado' as const, fecha: hoy(), detalle: '' }
    const [f, setF] = useState<{ proveedor: string; concepto: string; monto: string; estado: 'acordado' | 'por_confirmar'; fecha: string; detalle: string }>(vacio)
    return (
        <Desplegable texto="Nuevo acuerdo con un programador">
            {(cerrar) => (
                <form className="grid gap-2 sm:grid-cols-[1fr_1fr]" onSubmit={(e) => { e.preventDefault(); onGuardar(f, () => { setF(vacio); cerrar() }) }}>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Programador</span><input id="acuerdo-proveedor" list="acuerdo-nombres" required value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} placeholder="Nombre" className={campo} /></label>
                    <datalist id="acuerdo-nombres">{nombres.map((n) => <option key={n} value={n} />)}</datalist>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Qué hará</span><input id="acuerdo-concepto" required value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} placeholder="Ej.: Widget de rastreo" className={campo} /></label>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Monto acordado</span><input id="acuerdo-monto" inputMode="decimal" required value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} className={`${campo} tabular-nums`} /></label>
                    <label className="space-y-1"><span className="text-xs text-muted-foreground">Estado</span>
                        <select id="acuerdo-estado" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as 'acordado' | 'por_confirmar' })} className={campo}>
                            <option value="acordado">Acordado</option>
                            <option value="por_confirmar">Por confirmar (en discusión)</option>
                        </select>
                    </label>
                    <label className="space-y-1 sm:col-span-2"><span className="text-xs text-muted-foreground">Su propuesta o lo que hablaron (opcional; luego puedes adjuntar el PDF)</span><textarea id="acuerdo-detalle" rows={3} value={f.detalle} onChange={(e) => setF({ ...f, detalle: e.target.value })} placeholder="Pega aquí el mensaje de WhatsApp o el alcance" className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30" /></label>
                    <div className="flex gap-2 sm:col-span-2">
                        <Button type="submit" size="sm" disabled={pendiente}>Guardar acuerdo</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={cerrar}>Cancelar</Button>
                    </div>
                </form>
            )}
        </Desplegable>
    )
}
