'use client'

import { useEffect, useState } from 'react'
import { Pin } from 'lucide-react'
import type { ClientNote } from '@/types'
import { listClientNotes } from '@/lib/actions/crm'
import { useDataChanged } from '@/lib/events'

/**
 * "Lo que hay que saber" de un cliente: sus notas fijadas, en la cabecera
 * de la ficha, visibles desde cualquier pestaña. Es lo que le da sentido a
 * fijar una nota — no hay que ir a buscarla.
 */
export function PinnedNotesStrip({ clientId }: { clientId: string }) {
    const [pinned, setPinned] = useState<ClientNote[]>([])

    const load = () => {
        listClientNotes(clientId)
            .then((n) => setPinned(n.filter((x) => x.pinned && !x.resolved_at)))
            .catch(() => setPinned([]))
    }
    useEffect(() => {
        let active = true
        listClientNotes(clientId)
            .then((n) => active && setPinned(n.filter((x) => x.pinned && !x.resolved_at)))
            .catch(() => active && setPinned([]))
        return () => {
            active = false
        }
    }, [clientId])
    useDataChanged(load)

    if (pinned.length === 0) return null
    return (
        <ul className="mt-3 space-y-1">
            {pinned.map((n) => (
                <li key={n.id} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-100">
                    <Pin className="mt-0.5 h-3 w-3 shrink-0 text-amber-600" />
                    <span className="whitespace-pre-wrap">{n.body}</span>
                </li>
            ))}
        </ul>
    )
}
