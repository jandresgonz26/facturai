/** Portada de la propuesta (página del cliente y vista previa): marca, título, para quién y datos clave. */
const fmt = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Caracas' })

export function Portada({ numero, titulo, cliente, fecha, validaHasta, pdfHref }: { numero: string; titulo: string; cliente: string; fecha: string; validaHasta: string | null; pdfHref?: string }) {
    return (
        <header className="relative overflow-hidden bg-[#0B3552] text-white">
            {/* Arco de la marca: el gesto del logo de JAM Tech, en grande y difuso. */}
            <div aria-hidden className="pointer-events-none absolute -top-40 -right-32 h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(72,192,192,0.55),rgba(72,192,192,0)_65%)]" />
            <div aria-hidden className="pointer-events-none absolute -bottom-48 right-40 h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(104,184,64,0.35),rgba(104,184,64,0)_65%)]" />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-[#106898] via-[#48C0C0] to-[#68B840]" />
            <div className="relative mx-auto max-w-3xl px-4 pt-6 pb-12 sm:px-6 sm:pt-8 sm:pb-16">
                <div className="flex items-center justify-between gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element -- logo estático de la marca */}
                    <img src="/brand/jamtech-logo-white.png" alt="JAM Tech" className="h-8 w-auto sm:h-9" />
                    {pdfHref && (
                        <a href={pdfHref} className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/5 px-4 py-2 text-[0.85rem] font-medium text-white backdrop-blur transition hover:bg-white/15" download>
                            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden><path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 15.5h12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            Descargar PDF
                        </a>
                    )}
                </div>
                <div className="mt-12 text-[0.78rem] font-semibold tracking-[0.18em] text-[#9fd6e0] uppercase sm:mt-16">Propuesta · {numero}</div>
                <h1 className="font-display mt-3 max-w-[22ch] text-[2.2rem] leading-[1.08] font-semibold text-balance sm:text-[3.1rem]">{titulo}</h1>
                {cliente && <p className="mt-4 text-[1.1rem] text-white/80">Preparada para <span className="font-semibold text-white">{cliente}</span></p>}
                <dl className="mt-9 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/15 pt-5 text-[0.9rem] sm:grid-cols-3">
                    <div>
                        <dt className="text-white/55">Fecha</dt>
                        <dd className="mt-0.5 font-medium">{fmt(fecha)}</dd>
                    </div>
                    {validaHasta && (
                        <div>
                            <dt className="text-white/55">Válida hasta</dt>
                            <dd className="mt-0.5 font-medium">{fmt(validaHasta)}</dd>
                        </div>
                    )}
                    <div>
                        <dt className="text-white/55">Preparada por</dt>
                        <dd className="mt-0.5 font-medium">José González · JAM Tech</dd>
                    </div>
                </dl>
            </div>
        </header>
    )
}
