'use client'
/**
 * Editor tipo Notion (BlockNote) de la propuesta: «/» para insertar títulos, listas, tablas, imágenes y la
 * tabla de inversión de JAM Tech. Solo corre en el navegador (se carga con next/dynamic, ssr: false).
 */
import '@blocknote/mantine/style.css'
import { useEffect } from 'react'
import { BlockNoteSchema, defaultBlockSpecs, type PartialBlock } from '@blocknote/core'
import { es } from '@blocknote/core/locales'
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions'
import { createReactBlockSpec, getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import { toast } from 'sonner'
import { esGuia, type Bloque } from '@/lib/propuestas/bloques'
import { calcular, dinero, frecuencia, opcionPorId, tieneContenido } from '@/lib/propuestas/precios'
import { useInversionCtx } from './contexto'

function ResumenInversion() {
    const ctx = useInversionCtx()
    if (!ctx) return null
    const { pricing: p, moneda } = ctx
    const hay = tieneContenido(p)
    const t = calcular(p, opcionPorId(p)?.id)
    const items = p.opciones.reduce((n, o) => n + o.items.filter((i) => i.servicio.trim() || i.precio > 0).length, 0)
    return (
        <div contentEditable={false} className="my-2 w-full rounded-xl border-2 border-dashed border-[#48C0C0]/60 bg-gradient-to-br from-[#f2fafb] to-[#f4faf0] p-4 dark:from-sky-950/40 dark:to-emerald-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-[0.7rem] font-semibold tracking-[0.12em] text-[#106898] uppercase dark:text-sky-300">Tabla de inversión</div>
                    <div className="font-display text-lg font-semibold">{p.titulo || 'Inversión'}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                        {hay
                            ? [
                                  p.opciones.length > 1 ? `${p.opciones.length} opciones` : `${items} ${items === 1 ? 'ítem' : 'ítems'}`,
                                  p.extras.length ? `${p.extras.length} extras` : '',
                                  t.unico.total > 0 ? `${dinero(t.unico.total, moneda)} pago único` : '',
                                  ...t.recurrentes.map((r) => `${dinero(r.bloque.total, moneda)}${frecuencia(r.frecuencia).sufijo}`),
                                  p.plan_pagos.length ? `${p.plan_pagos.length} cuotas` : '',
                              ]
                                  .filter(Boolean)
                                  .join(' · ')
                            : 'Aún sin precios. Aquí verá el cliente las opciones, extras, totales y forma de pago.'}
                    </div>
                </div>
                {!ctx.soloLectura && (
                    <button type="button" onClick={ctx.abrirPrecios} className="rounded-full bg-[#106898] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0d5a84]">
                        {hay ? 'Editar precios' : 'Poner precios'}
                    </button>
                )}
            </div>
        </div>
    )
}

const Inversion = createReactBlockSpec({ type: 'inversion', propSchema: {}, content: 'none' }, { render: () => <ResumenInversion /> })

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- se quitan los bloques que no van en una propuesta (ni en el PDF)
const { audio, video, file, codeBlock, toggleListItem, ...bloquesBase } = defaultBlockSpecs
export const schema = BlockNoteSchema.create({ blockSpecs: { ...bloquesBase, inversion: Inversion() } })
export type EditorPropuestaBN = typeof schema.BlockNoteEditor

const diccionario = { ...es, placeholders: { ...es.placeholders, default: 'Escribe, o pulsa «/» para insertar un título, lista, tabla, imagen o la tabla de inversión', emptyDocument: 'Empieza a escribir la propuesta…' } }

async function subirImagen(file: File): Promise<string> {
    const fd = new FormData()
    fd.append('file', file)
    const r = await fetch('/api/propuestas/imagen', { method: 'POST', body: fd })
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string }
    if (!r.ok || !j.url) {
        toast.error(j.error || 'No se pudo subir la imagen.')
        throw new Error(j.error || 'upload')
    }
    return j.url
}

export default function EditorBloques({ inicial, onCambio, onListo, tema, soloLectura }: { inicial: Bloque[]; onCambio: (bloques: unknown[]) => void; onListo: (editor: EditorPropuestaBN) => void; tema: 'light' | 'dark'; soloLectura: boolean }) {
    const editor = useCreateBlockNote({
        schema,
        dictionary: diccionario,
        initialContent: inicial.length ? (inicial as unknown as PartialBlock<typeof schema.blockSchema>[]) : undefined,
        uploadFile: subirImagen,
    })

    useEffect(() => onListo(editor), [editor, onListo])

    // Las guías en gris de la plantilla desaparecen al poner el cursor en ellas.
    const alMoverCursor = () => {
        const b = editor.getTextCursorPosition().block as unknown as Bloque
        if (esGuia(b)) editor.updateBlock(b.id, { props: { textColor: 'default' }, content: [] })
    }

    return (
        <BlockNoteView editor={editor} theme={tema} editable={!soloLectura} slashMenu={false} onChange={() => onCambio(editor.document)} onSelectionChange={alMoverCursor} className="propuesta-editor">
            <SuggestionMenuController
                triggerCharacter="/"
                getItems={async (q) =>
                    filterSuggestionItems(
                        [
                            {
                                title: 'Tabla de inversión',
                                subtext: 'Precios, opciones, extras, descuentos y forma de pago',
                                aliases: ['precios', 'inversion', 'presupuesto', 'tabla de precios', 'costos'],
                                group: 'JAM Tech',
                                icon: <span className="text-base font-bold text-[#106898]">$</span>,
                                onItemClick: () => {
                                    if (editor.document.some((b) => b.type === 'inversion')) return void toast.info('La propuesta ya tiene su tabla de inversión: puedes moverla arrastrándola desde el asa ⋮⋮.')
                                    insertOrUpdateBlockForSlashMenu(editor, { type: 'inversion' })
                                },
                            },
                            ...getDefaultReactSlashMenuItems(editor),
                        ],
                        q,
                    )
                }
            />
        </BlockNoteView>
    )
}
