'use client'

import { Repeat } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import type { TaskRecurrenceFreq } from '@/types'

export type RecurrenceFormValue = {
    freq: TaskRecurrenceFreq | ''
    interval: string
    days: number[]
}

const FREQ_OPTIONS: { id: TaskRecurrenceFreq | ''; label: string }[] = [
    { id: '', label: 'Nunca' },
    { id: 'daily', label: 'Diario' },
    { id: 'weekly', label: 'Semanal' },
    { id: 'monthly', label: 'Mensual' },
]

// Índice = getDay()/getUTCDay() (0 = domingo), para que coincida sin traducir.
const WEEKDAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

/** "Repetir": frecuencia, cada cuántas unidades, y en semanal, qué días. */
export function RecurrenceField({ value, onChange }: { value: RecurrenceFormValue; onChange: (next: RecurrenceFormValue) => void }) {
    const { freq, interval, days } = value
    const unit = freq === 'daily' ? (Number(interval) === 1 ? 'día' : 'días') : freq === 'monthly' ? (Number(interval) === 1 ? 'mes' : 'meses') : Number(interval) === 1 ? 'semana' : 'semanas'

    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5" /> Repetir (opcional)
            </Label>
            <div className="flex flex-wrap gap-1.5">
                {FREQ_OPTIONS.map((o) => {
                    const active = freq === o.id
                    return (
                        <button
                            key={o.id || 'none'}
                            type="button"
                            onClick={() => onChange({ ...value, freq: o.id })}
                            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                active
                                    ? 'bg-teal-600 border-teal-600 text-white'
                                    : 'border-gray-300 dark:border-gray-600 text-muted-foreground hover:border-teal-400'
                            }`}
                        >
                            {o.label}
                        </button>
                    )
                })}
            </div>

            {freq !== '' && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs text-muted-foreground">cada</span>
                    <Input
                        type="number"
                        min="1"
                        max="365"
                        value={interval}
                        onChange={(e) => onChange({ ...value, interval: e.target.value })}
                        className="w-16 h-8 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">{unit}</span>
                </div>
            )}

            {freq === 'weekly' && (
                <div className="flex flex-wrap gap-1 pt-1">
                    {WEEKDAY_LABELS.map((label, dow) => {
                        const active = days.includes(dow)
                        return (
                            <button
                                key={dow}
                                type="button"
                                title={['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dow]}
                                onClick={() => onChange({ ...value, days: active ? days.filter((d) => d !== dow) : [...days, dow].sort() })}
                                className={`h-7 w-7 rounded-full text-[11px] font-semibold border transition-colors ${
                                    active
                                        ? 'bg-teal-600 border-teal-600 text-white'
                                        : 'border-gray-300 dark:border-gray-600 text-muted-foreground hover:border-teal-400'
                                }`}
                            >
                                {label}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
