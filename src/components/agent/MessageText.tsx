'use client'

import { Fragment } from 'react'

function renderInline(text: string, key: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
            <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>
        ) : (
            <Fragment key={`${key}-${i}`}>{p}</Fragment>
        )
    )
}

/** Renderizado ligero de markdown: negritas, listas y párrafos. */
export function MessageText({ text }: { text: string }) {
    const lines = text.split('\n')
    const blocks: React.ReactNode[] = []
    let list: { ordered: boolean; items: string[] } | null = null

    const flush = () => {
        if (!list) return
        const Tag = list.ordered ? 'ol' : 'ul'
        blocks.push(
            <Tag key={`l-${blocks.length}`} className={`${list.ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-0.5`}>
                {list.items.map((it, i) => (
                    <li key={i}>{renderInline(it, `li-${blocks.length}-${i}`)}</li>
                ))}
            </Tag>
        )
        list = null
    }

    lines.forEach((raw, idx) => {
        const line = raw.replace(/\s+$/, '')
        const bullet = line.match(/^\s*[-•*]\s+(.*)$/)
        const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)
        if (bullet || numbered) {
            const ordered = !!numbered
            const content = (bullet ?? numbered)![1]
            if (!list || list.ordered !== ordered) {
                flush()
                list = { ordered, items: [] }
            }
            list.items.push(content)
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
