import Link from 'next/link'
import { leerCerebro } from '@/lib/agent/cerebro'
import { EditorCerebro } from './EditorCerebro'

export const dynamic = 'force-dynamic'

/** Cerebro de la empresa: lo que todos los agentes saben de JAM Tech, por secciones guiadas. */
export default async function PaginaCerebro() {
    const cerebro = await leerCerebro().catch(() => ({}))
    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <Link href="/oficina" className="text-sm text-muted-foreground hover:text-foreground">← Oficina</Link>
            <header>
                <h1 className="text-2xl font-bold">🧠 Cerebro de la empresa</h1>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">Lo que tus agentes saben de JAM Tech. Lo usan en cada conversación, informe, tarea guiada y plan: cuanto más completo, menos genérico es lo que te entregan.</p>
            </header>
            <EditorCerebro inicial={cerebro} />
        </div>
    )
}
