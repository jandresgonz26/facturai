/**
 * Pinta el contenido de una propuesta (bloques del editor) con el diseño de JAM Tech, sin BlockNote:
 * sirve en el servidor y en el navegador. El bloque «inversion» se delega en `inversion` (la tabla
 * interactiva en la página del cliente, un resumen en la vista previa).
 */
import type { CSSProperties, ReactNode } from 'react'
import { agrupar, bloquesVisibles, celdaInline, COLOR_FONDO, COLOR_TEXTO, esTabla, inlineDe, type Bloque, type Inline } from '@/lib/propuestas/bloques'

const hrefSeguro = (h: string) => (/^(https?:|mailto:|tel:)/i.test(h.trim()) ? h.trim() : undefined)

function estilo(s: { textColor?: string; backgroundColor?: string }): CSSProperties | undefined {
    const st: CSSProperties = {}
    if (s.textColor && s.textColor !== 'default') st.color = COLOR_TEXTO[s.textColor]
    if (s.backgroundColor && s.backgroundColor !== 'default') {
        st.backgroundColor = COLOR_FONDO[s.backgroundColor]
        st.borderRadius = 4
        st.padding = '0 3px'
    }
    return Object.keys(st).length ? st : undefined
}

export function Texto({ inline }: { inline: Inline[] }) {
    return (
        <>
            {inline.map((x, i) => {
                if (x.type === 'link') {
                    const href = hrefSeguro(x.href)
                    return (
                        <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-[#106898] underline decoration-[#48C0C0]/60 underline-offset-[3px] hover:decoration-[#106898]">
                            <Texto inline={x.content} />
                        </a>
                    )
                }
                const s = x.styles ?? {}
                let n: ReactNode = x.text
                if (s.code) n = <code className="rounded bg-[#eef3f7] px-1.5 py-0.5 font-mono text-[0.88em] text-[#0B3552]">{n}</code>
                if (s.bold) n = <strong className="font-semibold text-[#0B3552]">{n}</strong>
                if (s.italic) n = <em>{n}</em>
                if (s.underline) n = <u className="underline-offset-2">{n}</u>
                if (s.strike) n = <s>{n}</s>
                const st = estilo(s)
                return st ? <span key={i} style={st}>{n}</span> : <span key={i}>{n}</span>
            })}
        </>
    )
}

const alinear = (b: Bloque) => {
    const a = b.props?.textAlignment
    return a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : a === 'justify' ? 'text-justify' : ''
}

function Hijos({ bloques, inversion }: { bloques: Bloque[]; inversion: () => ReactNode }) {
    if (!bloques.length) return null
    return (
        <div className="mt-2 pl-5">
            <Bloques bloques={bloques} inversion={inversion} />
        </div>
    )
}

function UnBloque({ b, inversion }: { b: Bloque; inversion: () => ReactNode }) {
    const st = estilo({ textColor: b.props?.textColor as string, backgroundColor: b.props?.backgroundColor as string })
    switch (b.type) {
        case 'heading': {
            const nivel = Number(b.props?.level ?? 2)
            const cls = nivel <= 1 ? 'font-display text-[1.9rem] leading-tight font-semibold text-[#0B3552] mt-12' : nivel === 2 ? 'font-display text-[1.45rem] leading-snug font-semibold text-[#0B3552] mt-11 flex items-center gap-3 before:block before:h-[1.1em] before:w-1 before:rounded-full before:bg-gradient-to-b before:from-[#48C0C0] before:to-[#68B840]' : 'font-display text-[1.12rem] font-semibold text-[#106898] mt-7'
            const Tag = (nivel <= 1 ? 'h2' : nivel === 2 ? 'h2' : 'h3') as 'h2' | 'h3'
            return (
                <Tag className={`${cls} ${alinear(b)} text-balance`} style={st}>
                    <Texto inline={inlineDe(b)} />
                </Tag>
            )
        }
        case 'paragraph': {
            const inl = inlineDe(b)
            if (!inl.length) return <div className="h-3" aria-hidden />
            return (
                <div>
                    <p className={`mt-3 leading-[1.75] ${alinear(b)}`} style={st}>
                        <Texto inline={inl} />
                    </p>
                    <Hijos bloques={b.children} inversion={inversion} />
                </div>
            )
        }
        case 'quote':
            return (
                <blockquote className="mt-5 border-l-[3px] border-[#48C0C0] bg-[#f3f8fa] py-3 pr-4 pl-5 text-[1.05rem] leading-relaxed text-[#0B3552] rounded-r-lg" style={st}>
                    <Texto inline={inlineDe(b)} />
                </blockquote>
            )
        case 'divider':
            return <hr className="my-9 border-0 h-px bg-gradient-to-r from-transparent via-[#c9d8e2] to-transparent" />
        case 'image': {
            const url = String(b.props?.url ?? '')
            if (!/^https?:\/\//.test(url)) return null
            const ancho = Number(b.props?.previewWidth) || undefined
            const caption = String(b.props?.caption ?? '')
            return (
                <figure className={`mt-6 ${b.props?.textAlignment === 'center' ? 'mx-auto' : ''}`} style={{ maxWidth: ancho ? Math.min(ancho, 720) : undefined }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- imágenes subidas por José al bucket público */}
                    <img src={url} alt={caption || String(b.props?.name ?? '')} className="w-full rounded-xl border border-[#e3ebf0]" loading="lazy" />
                    {caption && <figcaption className="mt-2 text-center text-sm text-[#5b6b78]">{caption}</figcaption>}
                </figure>
            )
        }
        case 'table': {
            if (!esTabla(b.content)) return null
            const t = b.content
            const cabecera = (t.headerRows ?? 0) > 0
            return (
                <div className="mt-6 overflow-x-auto rounded-xl border border-[#e3ebf0]">
                    <table className="w-full border-collapse text-[0.94rem]">
                        <tbody>
                            {t.rows.map((r, ri) => (
                                <tr key={ri} className={ri === 0 && cabecera ? 'bg-[#0B3552] text-white' : ri % 2 ? 'bg-[#f7fafc]' : 'bg-white'}>
                                    {r.cells.map((c, ci) => {
                                        const Cell = ri === 0 && cabecera ? 'th' : 'td'
                                        const props = Array.isArray(c) ? undefined : c.props
                                        return (
                                            <Cell key={ci} colSpan={props?.colspan} rowSpan={props?.rowspan} className={`border-b border-[#e3ebf0] px-4 py-2.5 text-left align-top ${ri === 0 && cabecera ? 'font-semibold' : ''}`}>
                                                <Texto inline={celdaInline(c)} />
                                            </Cell>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )
        }
        case 'inversion':
            return <>{inversion()}</>
        case 'codeBlock':
            return <pre className="mt-5 overflow-x-auto rounded-xl bg-[#0B3552] p-4 font-mono text-sm text-white">{inlineDe(b).map((x) => (x.type === 'text' ? x.text : '')).join('')}</pre>
        default: {
            const inl = inlineDe(b)
            return inl.length ? (
                <p className="mt-3 leading-[1.75]">
                    <Texto inline={inl} />
                </p>
            ) : null
        }
    }
}

function Item({ b, lista, inversion }: { b: Bloque; lista: 'bullet' | 'numbered' | 'check'; inversion: () => ReactNode }) {
    const st = estilo({ textColor: b.props?.textColor as string, backgroundColor: b.props?.backgroundColor as string })
    return (
        <li className={`leading-[1.7] ${lista === 'check' ? 'flex gap-3 list-none' : 'pl-1.5'}`} style={st}>
            {lista === 'check' && (
                <span className={`mt-[0.32em] inline-flex h-[1.05em] w-[1.05em] shrink-0 items-center justify-center rounded border ${b.props?.checked ? 'border-[#68B840] bg-[#68B840] text-white' : 'border-[#9fb3c1] bg-white'}`} aria-hidden>
                    {b.props?.checked ? <svg viewBox="0 0 12 12" className="h-[0.7em] w-[0.7em]"><path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
                </span>
            )}
            <div className="min-w-0">
                <Texto inline={inlineDe(b)} />
                {b.children.length > 0 && (
                    <div className="mt-1.5">
                        <Bloques bloques={b.children} inversion={inversion} />
                    </div>
                )}
            </div>
        </li>
    )
}

function Bloques({ bloques, inversion }: { bloques: Bloque[]; inversion: () => ReactNode }) {
    return (
        <>
            {agrupar(bloques).map((g, i) => {
                if ('bloque' in g) return <UnBloque key={`b-${g.bloque.id || i}`} b={g.bloque} inversion={inversion} />
                if (g.lista === 'numbered')
                    return (
                        <ol key={`l-${i}`} className="mt-3 list-decimal space-y-1.5 pl-6 marker:font-semibold marker:text-[#106898]">
                            {g.items.map((b, j) => <Item key={b.id || j} b={b} lista="numbered" inversion={inversion} />)}
                        </ol>
                    )
                if (g.lista === 'check')
                    return (
                        <ul key={`l-${i}`} className="mt-3 space-y-1.5">
                            {g.items.map((b, j) => <Item key={b.id || j} b={b} lista="check" inversion={inversion} />)}
                        </ul>
                    )
                return (
                    <ul key={`l-${i}`} className="mt-3 list-disc space-y-1.5 pl-6 marker:text-[#48C0C0]">
                        {g.items.map((b, j) => <Item key={b.id || j} b={b} lista="bullet" inversion={inversion} />)}
                    </ul>
                )
            })}
        </>
    )
}

/** Contenido completo, sin las guías de la plantilla. Si no hay bloque de inversión, la tabla va al final. */
export function ContenidoPropuesta({ bloques, inversion }: { bloques: Bloque[]; inversion: () => ReactNode }) {
    const visibles = bloquesVisibles(bloques)
    const tieneInversion = JSON.stringify(visibles).includes('"type":"inversion"')
    return (
        <div className="text-[1.04rem] text-[#24323d]">
            <Bloques bloques={visibles} inversion={inversion} />
            {!tieneInversion && inversion()}
        </div>
    )
}
