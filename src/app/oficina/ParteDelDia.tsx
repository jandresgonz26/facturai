/** El último parte del día (el mensaje de las 7:30 por Telegram), para tenerlo a mano en la Oficina. Solo lectura. */
import { Sun } from 'lucide-react'
import { MessageText } from '@/components/agent/MessageText'
import { USER_TIMEZONE } from '@/lib/actions/validation'

const dia = (iso: string) => {
    const f = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: USER_TIMEZONE })
    const hoy = f(new Date())
    const ayer = f(new Date(Date.now() - 86_400_000))
    const d = f(new Date(iso))
    if (d === hoy) return 'Hoy'
    if (d === ayer) return 'Ayer'
    return new Date(iso).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'short', timeZone: USER_TIMEZONE })
}

export function ParteDelDia({ texto, creado }: { texto: string; creado: string }) {
    return (
        <section className="rounded-2xl border border-amber-300/60 bg-gradient-to-br from-amber-50 to-card p-4 dark:border-amber-500/30 dark:from-amber-500/10" aria-labelledby="parte-del-dia">
            <div className="flex items-baseline justify-between gap-2">
                <h2 id="parte-del-dia" className="flex items-center gap-2 font-semibold"><Sun className="h-4 w-4 text-amber-500" aria-hidden /> Parte del día</h2>
                <span className="text-xs text-muted-foreground">{dia(creado)} · 📋 Sofía</span>
            </div>
            <div className="mt-2 max-h-64 overflow-y-auto text-sm">
                <MessageText text={texto} />
            </div>
        </section>
    )
}
