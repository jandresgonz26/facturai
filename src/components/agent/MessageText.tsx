'use client'

import { Fragment } from 'react'

function renderInline(text: string, key: string) {
    const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g)
    return parts.map((p, i) => {
        const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(p)
        if (link) return <a key={`${key}-${i}`} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{link[1]}</a>
        return p.startsWith('**') && p.endsWith('**') ? <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong> : <Fragment key={`${key}-${i}`}>{p}</Fragment>
    })
}

/** Renderizado ligero de markdown: negritas, enlaces, listas (con sub-viñetas), citas y párrafos. */
export function MessageText({ text }: { text: string }) {
    const lines = text.split('\n')
    const blocks: React.ReactNode[] = []
    let list: { ordered: boolean; items: { text: string; sub: boolean }[] } | null = null
    let quote: string[] = []

    const flushQuote = () => {
        if (!quote.length) return
        blocks.push(<blockquote key={`q-${blocks.length}`} className="border-l-2 border-current/30 pl-3 italic opacity-90">{quote.map((q, i) => <p key={i}>{renderInline(q, `q-${blocks.length}-${i}`)}</p>)}</blockquote>)
        quote = []
    }

    const flush = () => {
        flushQuote()
        if (!list) return
        const Tag = list.ordered ? 'ol' : 'ul'
        blocks.push(
            <Tag key={`l-${blocks.length}`} className={`${list.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-0.5`}>
                {list.items.map((it, i) => (
                    <li key={i} className={it.sub ? 'ml-4 list-[circle]' : ''}>{renderInline(it.text, `li-${blocks.length}-${i}`)}</li>
                ))}
            </Tag>
        )
        list = null
    }

    lines.forEach((raw, idx) => {
        const line = raw.replace(/\s+$/, '')
        const q = line.match(/^\s*>\s?(.*)$/)
        if (q) {
            if (list) flush() // una cita cierra la lista abierta (la cita en curso sigue acumulándose)
            quote.push(q[1])
            return
        }
        flushQuote()
        const bullet = line.match(/^\s*[-•*]\s+(.*)$/)
        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
        if (bullet || numbered) {
            const ordered = !!numbered
            const content = (bullet ?? numbered)![1]
            if (!list || list.ordered !== ordered) {
                flush()
                list = { ordered, items: [] }
            }
            list.items.push({ text: content, sub: !numbered && /^(\s{2,}|\t)/.test(line) })
            return
        }
        flush()
        if (line.trim() === '') return
        const heading = line.match(/^#{1,3}\s+(.*)$/)
        if (heading) {
            blocks.push(
                <p key={`h-${idx}`} className="font-semibold">
                    {renderInline(heading[1], `h-${idx}`)}
                </p>
            )
            return
        }
        blocks.push(<p key={`p-${idx}`}>{renderInline(line, `p-${idx}`)}</p>)
    })
    flush()

    return <div className="space-y-2 text-sm leading-relaxed [&_p]:whitespace-pre-wrap">{blocks}</div>
}
