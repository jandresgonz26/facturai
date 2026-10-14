import Link from 'next/link'
import { leerCerebro } from '@/lib/agent/cerebro'
import { proyectoActivo } from '@/lib/agent/proyecto-activo'
import { EditorCerebro } from './EditorCerebro'

export const dynamic = 'force-dynamic'

/** Cerebro de la empresa (o del proyecto activo): lo que todos los agentes saben, por secciones guiadas. */
export default async function PaginaCerebro() {
    const { id, proyecto } = await proyectoActivo()
    const cerebro = await leerCerebro(id).catch(() => ({}))
    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <Link href="/oficina" className="text-sm text-muted-foreground hover:text-foreground">← Oficina</Link>
            <header>
                <h1 className="text-2xl font-bold">🧠 Cerebro {proyecto ? `de ${proyecto.nombre}` : 'de la empresa'}</h1>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                    {proyecto
                        ? `Lo propio de ${proyecto.nombre}: los agentes lo usan junto con el cerebro de JAM Tech cuando trabajan en este proyecto, y manda cuando hablen de lo mismo. Cambia de proyecto en la Oficina.`
                        : 'Lo que tus agentes saben de JAM Tech. Lo usan en cada conversación, informe, tarea guiada y plan: cuanto más completo, menos genérico es lo que te entregan.'}
                </p>
            </header>
            <EditorCerebro key={id ?? 'jamtech'} inicial={cerebro} proyecto={proyecto?.nombre ?? null} />
        </div>
    )
}
