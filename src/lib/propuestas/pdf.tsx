/**
 * PDF de la propuesta, generado en el servidor con @react-pdf/renderer (sin navegador headless):
 * portada de marca, páginas con cabecera y pie de JAM Tech Corp, el contenido del editor y la tabla
 * de inversión. Si la propuesta está aceptada, sale lo que el cliente aceptó (opción y extras).
 */
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { Document, Font, Image, Link, Page, StyleSheet, Svg, Defs, LinearGradient, RadialGradient, Stop, Rect, Circle, Text, View, renderToBuffer } from '@react-pdf/renderer'
import type { ReactNode } from 'react'
import { agrupar, bloquesVisibles, celdaInline, COLOR_FONDO, COLOR_TEXTO, esTabla, inlineDe, type Bloque, type Inline } from './bloques'
import { calcular, detalleCantidad, dinero, frecuencia, opcionPorId, precioLinea, textoDescuento, tieneContenido, type ItemPrecio, type Moneda, type Pricing } from './precios'

const C = { navy: '#0B3552', blue: '#106898', cyan: '#48C0C0', green: '#68B840', ink: '#24323d', muted: '#5b6b78', soft: '#7a8a96', line: '#e3ebf0', mist: '#f4f7f9', greenInk: '#3f8f2a' }

let registradas = false
function registrarFuentes() {
    if (registradas) return
    const dir = path.join(process.cwd(), 'src/lib/propuestas/fuentes')
    const f = (n: string) => path.join(dir, n)
    Font.register({
        family: 'Inter',
        fonts: [
            { src: f('Inter-Regular.ttf'), fontWeight: 400 },
            { src: f('Inter-Medium.ttf'), fontWeight: 500 },
            { src: f('Inter-SemiBold.ttf'), fontWeight: 600 },
            { src: f('Inter-SemiBold.ttf'), fontWeight: 700 },
            { src: f('Inter-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
            { src: f('Inter-Italic.ttf'), fontWeight: 500, fontStyle: 'italic' },
            { src: f('Inter-Italic.ttf'), fontWeight: 600, fontStyle: 'italic' },
            { src: f('Inter-Italic.ttf'), fontWeight: 700, fontStyle: 'italic' },
        ],
    })
    Font.register({ family: 'Outfit', fonts: [400, 500, 600, 700].map((w) => ({ src: f('Outfit-SemiBold.ttf'), fontWeight: w })) })
    // Sin guiones de corte en inglés dentro de palabras en español.
    Font.registerHyphenationCallback((w) => [w])
    registradas = true
}

const logo = (blanco: boolean) => readFileSync(path.join(process.cwd(), 'public/brand', blanco ? 'jamtech-logo-white.png' : 'jamtech-logo.png'))

const s = StyleSheet.create({
    page: { fontFamily: 'Inter', fontSize: 10.5, color: C.ink, paddingTop: 70, paddingBottom: 64, paddingHorizontal: 56, lineHeight: 1.6 },
    header: { position: 'absolute', top: 26, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 0.6, borderBottomColor: C.line, paddingBottom: 8 },
    footer: { position: 'absolute', bottom: 26, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between', fontSize: 8, color: C.soft },
    h1: { fontFamily: 'Outfit', fontSize: 19, color: C.navy, marginTop: 20, marginBottom: 4, lineHeight: 1.25 },
    h2row: { flexDirection: 'row', alignItems: 'stretch', marginTop: 20, marginBottom: 4 },
    h2: { fontFamily: 'Outfit', fontSize: 15, color: C.navy, lineHeight: 1.3 },
    h3: { fontFamily: 'Outfit', fontSize: 12, color: C.blue, marginTop: 12, marginBottom: 2 },
    p: { marginTop: 6 },
    li: { flexDirection: 'row', marginTop: 4 },
    quote: { marginTop: 10, borderLeftWidth: 2.5, borderLeftColor: C.cyan, backgroundColor: '#f3f8fa', paddingVertical: 7, paddingHorizontal: 12, color: C.navy },
    small: { fontSize: 8.5, color: C.soft },
})

const hrefSeguro = (h: string) => (/^(https?:|mailto:|tel:)/i.test(h.trim()) ? h.trim() : undefined)

function TextoPdf({ inline }: { inline: Inline[] }): ReactNode {
    return inline.map((x, i) => {
        if (x.type === 'link') {
            const href = hrefSeguro(x.href)
            const t = x.content.map((c) => c.text).join('')
            return href ? <Link key={i} src={href} style={{ color: C.blue, textDecoration: 'underline' }}>{t}</Link> : <Text key={i}>{t}</Text>
        }
        const st = x.styles ?? {}
        return (
            <Text
                key={i}
                style={{
                    fontWeight: st.bold ? 600 : undefined,
                    fontStyle: st.italic ? 'italic' : undefined,
                    textDecoration: st.underline ? 'underline' : st.strike ? 'line-through' : undefined,
                    color: st.textColor && st.textColor !== 'default' ? COLOR_TEXTO[st.textColor] : st.bold ? C.navy : undefined,
                    backgroundColor: st.backgroundColor && st.backgroundColor !== 'default' ? COLOR_FONDO[st.backgroundColor] : st.code ? '#eef3f7' : undefined,
                }}
            >
                {x.text}
            </Text>
        )
    })
}

function Barra() {
    return (
        <Svg width={3} height={16} style={{ marginRight: 8, marginTop: 2 }}>
            <Defs>
                <LinearGradient id="b" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={C.cyan} />
                    <Stop offset="1" stopColor={C.green} />
                </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={3} height={16} rx={1.5} fill="url(#b)" />
        </Svg>
    )
}

function BloquePdf({ b, inversion }: { b: Bloque; inversion: () => ReactNode }) {
    const color = b.props?.textColor && b.props.textColor !== 'default' ? COLOR_TEXTO[b.props.textColor as string] : undefined
    const align = (['center', 'right', 'justify'].includes(String(b.props?.textAlignment)) ? b.props.textAlignment : undefined) as 'center' | 'right' | 'justify' | undefined
    switch (b.type) {
        case 'heading': {
            const n = Number(b.props?.level ?? 2)
            if (n <= 1) return <Text style={[s.h1, { color, textAlign: align }]} minPresenceAhead={60}><TextoPdf inline={inlineDe(b)} /></Text>
            if (n === 2)
                return (
                    <View style={s.h2row} minPresenceAhead={60} wrap={false}>
                        <Barra />
                        <Text style={[s.h2, { color }]}><TextoPdf inline={inlineDe(b)} /></Text>
                    </View>
                )
            return <Text style={[s.h3, { color, textAlign: align }]} minPresenceAhead={40}><TextoPdf inline={inlineDe(b)} /></Text>
        }
        case 'paragraph': {
            const inl = inlineDe(b)
            if (!inl.length) return <View style={{ height: 6 }} />
            return (
                <View>
                    <Text style={[s.p, { color, textAlign: align }]}><TextoPdf inline={inl} /></Text>
                    {b.children.length > 0 && <View style={{ paddingLeft: 14 }}><BloquesPdf bloques={b.children} inversion={inversion} /></View>}
                </View>
            )
        }
        case 'quote':
            return <Text style={s.quote}><TextoPdf inline={inlineDe(b)} /></Text>
        case 'divider':
            return <View style={{ marginVertical: 14, height: 0.8, backgroundColor: C.line }} />
        case 'image': {
            const url = String(b.props?.url ?? '')
            if (!/^https?:\/\/.+\.(png|jpe?g)(\?.*)?$/i.test(url)) return null
            const caption = String(b.props?.caption ?? '')
            const ancho = Math.min(Number(b.props?.previewWidth) || 483, 483)
            return (
                <View style={{ marginTop: 10, alignItems: b.props?.textAlignment === 'center' ? 'center' : 'flex-start' }} wrap={false}>
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no admite alt */}
                    <Image src={url} style={{ width: ancho, borderRadius: 6 }} />
                    {caption ? <Text style={[s.small, { marginTop: 4 }]}>{caption}</Text> : null}
                </View>
            )
        }
        case 'table': {
            if (!esTabla(b.content)) return null
            const t = b.content
            const cab = (t.headerRows ?? 0) > 0
            return (
                <View style={{ marginTop: 10, borderWidth: 0.6, borderColor: C.line, borderRadius: 6 }}>
                    {t.rows.map((r, ri) => (
                        <View key={ri} style={{ flexDirection: 'row', backgroundColor: ri === 0 && cab ? C.navy : ri % 2 ? '#f7fafc' : '#ffffff', borderBottomWidth: ri === t.rows.length - 1 ? 0 : 0.6, borderBottomColor: C.line }} wrap={false}>
                            {r.cells.map((c, ci) => (
                                <View key={ci} style={{ flex: 1, paddingVertical: 5, paddingHorizontal: 7 }}>
                                    <Text style={{ fontSize: 9.5, color: ri === 0 && cab ? '#ffffff' : C.ink, fontWeight: ri === 0 && cab ? 600 : 400 }}><TextoPdf inline={celdaInline(c)} /></Text>
                                </View>
                            ))}
                        </View>
                    ))}
                </View>
            )
        }
        case 'inversion':
            return <>{inversion()}</>
        default: {
            const inl = inlineDe(b)
            return inl.length ? <Text style={s.p}><TextoPdf inline={inl} /></Text> : null
        }
    }
}

function BloquesPdf({ bloques, inversion }: { bloques: Bloque[]; inversion: () => ReactNode }) {
    return (
        <>
            {agrupar(bloques).map((g, i) => {
                if ('bloque' in g) return <BloquePdf key={i} b={g.bloque} inversion={inversion} />
                return (
                    <View key={i} style={{ marginTop: 4 }}>
                        {g.items.map((b, j) => (
                            <View key={j}>
                                <View style={s.li} wrap={false}>
                                    {g.lista === 'check' ? (
                                        <View style={{ width: 16, paddingTop: 3 }}>
                                            <View style={{ width: 8, height: 8, borderRadius: 2, borderWidth: 0.8, borderColor: b.props?.checked ? C.green : '#9fb3c1', backgroundColor: b.props?.checked ? C.green : '#ffffff' }} />
                                        </View>
                                    ) : (
                                        <Text style={{ width: 16, color: g.lista === 'numbered' ? C.blue : C.cyan, fontWeight: 600 }}>{g.lista === 'numbered' ? `${j + 1}.` : '•'}</Text>
                                    )}
                                    <Text style={{ flex: 1 }}><TextoPdf inline={inlineDe(b)} /></Text>
                                </View>
                                {b.children.length > 0 && <View style={{ paddingLeft: 16 }}><BloquesPdf bloques={b.children} inversion={inversion} /></View>}
                            </View>
                        ))}
                    </View>
                )
            })}
        </>
    )
}

// ─── Inversión ───────────────────────────────────────────────────────────────

function LineaPdf({ item, moneda, extra }: { item: ItemPrecio; moneda: Moneda; extra?: boolean }) {
    const det = detalleCantidad(item, moneda)
    const desc = !!item.descuento && !item.incluido && !item.a_convenir
    return (
        <View style={{ flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, borderBottomWidth: 0.6, borderBottomColor: C.line }} wrap={false}>
            <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={{ fontWeight: 600, color: C.navy }}>{item.servicio || 'Servicio'}</Text>
                {item.descripcion ? <Text style={{ fontSize: 9, color: C.muted, lineHeight: 1.45 }}>{item.descripcion}</Text> : null}
                {det ? <Text style={{ fontSize: 8.5, color: C.soft }}>{det}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
                {desc && item.tachado ? <Text style={{ fontSize: 8.5, color: '#93a3ae', textDecoration: 'line-through' }}>{dinero(item.cantidad * item.precio, moneda)}</Text> : null}
                <Text style={{ fontWeight: 600, color: item.incluido ? C.greenInk : item.a_convenir ? C.soft : C.navy }}>{extra && !item.incluido && !item.a_convenir ? '+' : ''}{precioLinea(item, moneda)}</Text>
                {desc ? <Text style={{ fontSize: 8, color: C.greenInk }}>−{textoDescuento(item.descuento!, moneda)}</Text> : null}
            </View>
        </View>
    )
}

function Caja({ titulo, children, tono }: { titulo: string; children: ReactNode; tono?: 'verde' | 'azul' }) {
    return (
        <View style={{ marginTop: 10, borderWidth: 0.6, borderColor: tono === 'verde' ? '#b9d3c2' : C.line, borderStyle: tono === 'verde' ? 'dashed' : 'solid', borderRadius: 8 }}>
            <Text style={{ fontSize: 7.5, fontWeight: 600, letterSpacing: 0.8, color: tono === 'verde' ? C.greenInk : C.blue, backgroundColor: tono === 'verde' ? '#f6faf4' : '#f6fafb', paddingVertical: 5, paddingHorizontal: 10, textTransform: 'uppercase', borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>{titulo}</Text>
            {children}
        </View>
    )
}

function Totales({ p, moneda, opcionId, extras }: { p: Pricing; moneda: Moneda; opcionId: string; extras: string[] }) {
    const t = calcular(p, opcionId, extras)
    const fila = (l: string, v: string, fuerte = false) => (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
            <Text style={{ color: fuerte ? '#ffffff' : '#cfe3ee', fontSize: fuerte ? 10.5 : 9.5 }}>{l}</Text>
            <Text style={{ color: fuerte ? '#ffffff' : '#cfe3ee', fontSize: fuerte ? 10.5 : 9.5 }}>{v}</Text>
        </View>
    )
    return (
        <View style={{ flexDirection: 'row', marginTop: 10, gap: 10 }} wrap={false}>
            {(t.unico.subtotal > 0 || t.recurrentes.length === 0) && (
                <View style={{ flex: 1, backgroundColor: C.navy, borderRadius: 8, padding: 12 }}>
                    <Text style={{ fontSize: 7.5, fontWeight: 600, letterSpacing: 0.8, color: '#9fd6e0', textTransform: 'uppercase' }}>Pago único</Text>
                    {(t.unico.descuento > 0 || t.unico.impuesto > 0) && fila('Subtotal', dinero(t.unico.subtotal, moneda))}
                    {t.unico.descuento > 0 && fila(p.descuento?.motivo || 'Descuento', `−${dinero(t.unico.descuento, moneda)}`)}
                    {t.unico.impuesto > 0 && fila(`${p.impuesto?.nombre} (${p.impuesto?.pct} %)`, dinero(t.unico.impuesto, moneda))}
                    <Text style={{ fontFamily: 'Outfit', fontSize: 20, lineHeight: 1.2, color: '#ffffff', marginTop: 4 }}>{dinero(t.unico.total, moneda)}</Text>
                    {t.cuotas.length > 0 && (
                        <View style={{ marginTop: 10, borderTopWidth: 0.6, borderTopColor: '#3a5c75', paddingTop: 6 }}>
                            <Text style={{ fontSize: 7.5, fontWeight: 600, letterSpacing: 0.8, color: '#9fd6e0', textTransform: 'uppercase' }}>Forma de pago</Text>
                            {t.cuotas.map((c) => <View key={c.cuota.id}>{fila(`${c.cuota.concepto || 'Cuota'} (${c.cuota.pct} %)`, dinero(c.monto, moneda), true)}</View>)}
                        </View>
                    )}
                </View>
            )}
            {t.recurrentes.length > 0 && (
                <View style={{ flex: 1, backgroundColor: '#f2fafb', borderWidth: 1, borderColor: '#a9dede', borderRadius: 8, padding: 12 }}>
                    <Text style={{ fontSize: 7.5, fontWeight: 600, letterSpacing: 0.8, color: C.blue, textTransform: 'uppercase' }}>Recurrente</Text>
                    {t.recurrentes.map((r) => (
                        <View key={r.frecuencia} style={{ marginTop: 4 }}>
                            {r.bloque.descuento > 0 && <Text style={{ fontSize: 9, color: C.greenInk }}>{p.descuento?.motivo || 'Descuento'}: −{dinero(r.bloque.descuento, moneda)}</Text>}
                            {r.bloque.impuesto > 0 && <Text style={{ fontSize: 9, color: C.muted }}>{p.impuesto?.nombre} ({p.impuesto?.pct} %): {dinero(r.bloque.impuesto, moneda)}</Text>}
                            <Text style={{ fontFamily: 'Outfit', fontSize: 17, lineHeight: 1.2, color: C.navy }}>
                                {dinero(r.bloque.total, moneda)}
                                <Text style={{ fontSize: 10, color: C.blue }}>{frecuencia(r.frecuencia).sufijo}</Text>
                            </Text>
                        </View>
                    ))}
                </View>
            )}
        </View>
    )
}

function InversionPdf({ p, moneda, aceptada }: { p: Pricing; moneda: Moneda; aceptada: { opcionId: string; extras: string[] } | null }) {
    const varias = p.opciones.length > 1
    const visibles = (items: ItemPrecio[]) => items.filter((i) => i.servicio.trim() || i.precio > 0 || i.incluido || i.a_convenir)
    const titulo = (
        <View style={s.h2row} minPresenceAhead={120} wrap={false}>
            <Barra />
            <Text style={s.h2}>{p.titulo || 'Inversión'}</Text>
        </View>
    )
    if (aceptada || !varias) {
        const o = opcionPorId(p, aceptada?.opcionId)
        const extras = aceptada ? p.extras.filter((e) => aceptada.extras.includes(e.id)) : p.extras
        return (
            <View>
                {titulo}
                <Caja titulo={varias && o ? `Opción ${o.nombre || 'elegida'}${aceptada ? ' (aceptada)' : ''}` : 'Detalle'}>
                    {visibles(o?.items ?? []).map((i) => <LineaPdf key={i.id} item={i} moneda={moneda} />)}
                </Caja>
                {extras.length > 0 && (
                    <Caja titulo={aceptada ? 'Extras añadidos' : 'Opcionales que puedes añadir'} tono="verde">
                        {extras.map((e) => <LineaPdf key={e.id} item={e} moneda={moneda} extra />)}
                    </Caja>
                )}
                <Totales p={p} moneda={moneda} opcionId={o?.id ?? ''} extras={aceptada?.extras ?? []} />
                {p.nota ? <Text style={[s.small, { marginTop: 8 }]}>{p.nota}</Text> : null}
            </View>
        )
    }
    // Sin aceptar y con varias opciones: cada opción con su detalle y sus totales.
    return (
        <View>
            {titulo}
            <Text style={{ color: C.muted, marginTop: 2 }}>Te presentamos {p.opciones.length} opciones. Elige la que mejor te encaje al aceptar la propuesta desde el enlace.</Text>
            {p.opciones.map((o) => (
                <View key={o.id} style={{ marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }} minPresenceAhead={80}>
                        <Text style={{ fontFamily: 'Outfit', fontSize: 13, color: C.navy }}>{o.nombre || 'Opción'}</Text>
                        {o.recomendada ? (
                            <View style={{ marginLeft: 8, backgroundColor: C.green, paddingTop: 2.5, paddingBottom: 2, paddingHorizontal: 6, borderRadius: 8 }}>
                                <Text style={{ fontSize: 6.5, lineHeight: 1, fontWeight: 600, letterSpacing: 0.6, color: '#ffffff', textTransform: 'uppercase' }}>Recomendada</Text>
                            </View>
                        ) : null}
                    </View>
                    {o.descripcion ? <Text style={{ color: C.muted, fontSize: 9.5 }}>{o.descripcion}</Text> : null}
                    <Caja titulo="Incluye">{visibles(o.items).map((i) => <LineaPdf key={i.id} item={i} moneda={moneda} />)}</Caja>
                    <Totales p={p} moneda={moneda} opcionId={o.id} extras={[]} />
                </View>
            ))}
            {p.extras.length > 0 && (
                <Caja titulo="Opcionales que puedes añadir" tono="verde">
                    {p.extras.map((e) => <LineaPdf key={e.id} item={e} moneda={moneda} extra />)}
                </Caja>
            )}
            {p.nota ? <Text style={[s.small, { marginTop: 8 }]}>{p.nota}</Text> : null}
        </View>
    )
}

// ─── Documento ───────────────────────────────────────────────────────────────

export type DatosPdf = {
    numero: string
    titulo: string
    cliente: string
    fecha: string
    validaHasta: string | null
    moneda: Moneda
    content: Bloque[]
    pricing: Pricing
    aceptada: { opcionId: string; extras: string[]; nombre: string; fecha: string } | null
}

const fmt = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Caracas' })

function Portada({ d }: { d: DatosPdf }) {
    return (
        <Page size="A4" style={{ backgroundColor: C.navy, color: '#ffffff', fontFamily: 'Inter', padding: 0 }}>
            <Svg width={595} height={841} style={{ position: 'absolute', top: 0, left: 0 }}>
                <Defs>
                    <RadialGradient id="c1" cx="0.5" cy="0.5" r="0.5">
                        <Stop offset="0" stopColor={C.cyan} stopOpacity={0.55} />
                        <Stop offset="1" stopColor={C.cyan} stopOpacity={0} />
                    </RadialGradient>
                    <RadialGradient id="c2" cx="0.5" cy="0.5" r="0.5">
                        <Stop offset="0" stopColor={C.green} stopOpacity={0.35} />
                        <Stop offset="1" stopColor={C.green} stopOpacity={0} />
                    </RadialGradient>
                    <LinearGradient id="linea" x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0" stopColor={C.blue} />
                        <Stop offset="0.5" stopColor={C.cyan} />
                        <Stop offset="1" stopColor={C.green} />
                    </LinearGradient>
                </Defs>
                <Circle cx={540} cy={70} r={260} fill="url(#c1)" />
                <Circle cx={400} cy={840} r={240} fill="url(#c2)" />
                <Rect x={0} y={835} width={595} height={6} fill="url(#linea)" />
            </Svg>
            {/* Todo en posición absoluta: la portada nunca se parte en dos páginas. */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 56, paddingTop: 56 }}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no admite alt */}
                <Image src={logo(true)} style={{ width: 140 }} />
                <View style={{ marginTop: 'auto', marginBottom: 70 }}>
                    <Text style={{ fontSize: 9, fontWeight: 600, letterSpacing: 2, color: '#9fd6e0', textTransform: 'uppercase' }}>Propuesta · {d.numero}</Text>
                    <Text style={{ fontFamily: 'Outfit', fontSize: 34, lineHeight: 1.12, marginTop: 10, maxWidth: 440 }}>{d.titulo}</Text>
                    {d.cliente ? <Text style={{ fontSize: 13, marginTop: 14, color: '#d6e4ec' }}>Preparada para <Text style={{ fontWeight: 600, color: '#ffffff' }}>{d.cliente}</Text></Text> : null}
                    <View style={{ flexDirection: 'row', marginTop: 34, paddingTop: 12, borderTopWidth: 0.6, borderTopColor: '#3a5c75', gap: 34 }}>
                        {[
                            ['Fecha', fmt(d.fecha)],
                            ...(d.validaHasta ? [['Válida hasta', fmt(d.validaHasta)]] : []),
                            ['Preparada por', 'José González · JAM Tech'],
                        ].map(([k, v]) => (
                            <View key={k}>
                                <Text style={{ fontSize: 8.5, color: '#93adbf' }}>{k}</Text>
                                <Text style={{ fontSize: 10, fontWeight: 500, marginTop: 2 }}>{v}</Text>
                            </View>
                        ))}
                    </View>
                    {d.aceptada ? <Text style={{ marginTop: 18, fontSize: 10, color: '#bfe5ae' }}>Aceptada por {d.aceptada.nombre} el {fmt(d.aceptada.fecha)}</Text> : null}
                </View>
            </View>
        </Page>
    )
}

function Documento({ d }: { d: DatosPdf }) {
    const conPrecios = tieneContenido(d.pricing)
    const inversion = () => (conPrecios ? <InversionPdf p={d.pricing} moneda={d.moneda} aceptada={d.aceptada} /> : null)
    const visibles = bloquesVisibles(d.content)
    const tieneInversion = JSON.stringify(visibles).includes('"type":"inversion"')
    return (
        <Document title={`${d.numero} · ${d.titulo}`} author="JAM Tech Corp" creator="JAM Tech" producer="JAM Tech" language="es">
            <Portada d={d} />
            <Page size="A4" style={s.page}>
                <View style={s.header} fixed>
                    {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no admite alt */}
                    <Image src={logo(false)} style={{ width: 74 }} />
                    <Text style={{ fontSize: 8, color: C.soft, maxWidth: 300, textAlign: 'right' }}>{d.numero} · {d.titulo}</Text>
                </View>
                <BloquesPdf bloques={visibles} inversion={inversion} />
                {!tieneInversion && inversion()}
                <View style={s.footer} fixed>
                    <Text>JAM Tech Corp · jamtech.cloud · info@jamtech.cloud</Text>
                    <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber - 1} de ${totalPages - 1}`} />
                </View>
            </Page>
        </Document>
    )
}

export async function generarPdf(d: DatosPdf): Promise<Buffer> {
    registrarFuentes()
    return renderToBuffer(<Documento d={d} />)
}

/** Nombre de archivo legible: «PRO-0003 Rediseño web - Perfect Trainer.pdf». */
export function nombrePdf(d: Pick<DatosPdf, 'numero' | 'titulo' | 'cliente'>): string {
    const limpio = `${d.numero} ${d.titulo}${d.cliente ? ` - ${d.cliente}` : ''}`.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
    return `${limpio}.pdf`
}
