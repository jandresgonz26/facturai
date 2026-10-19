/** Estados de una propuesta (compartido por el servidor y la interfaz, sin dependencias de servidor). */
export type EstadoPropuesta = 'draft' | 'sent' | 'viewed' | 'changes_requested' | 'accepted' | 'rejected'

export const ESTADOS: { id: EstadoPropuesta; label: string; tono: string }[] = [
    { id: 'draft', label: 'Borrador', tono: 'bg-slate-100 text-slate-700' },
    { id: 'sent', label: 'Enviada', tono: 'bg-sky-100 text-sky-800' },
    { id: 'viewed', label: 'Vista', tono: 'bg-indigo-100 text-indigo-800' },
    { id: 'changes_requested', label: 'Cambios pedidos', tono: 'bg-amber-100 text-amber-800' },
    { id: 'accepted', label: 'Aceptada', tono: 'bg-emerald-100 text-emerald-800' },
    { id: 'rejected', label: 'Rechazada', tono: 'bg-rose-100 text-rose-800' },
]
export const estadoDe = (s: EstadoPropuesta) => ESTADOS.find((e) => e.id === s) ?? ESTADOS[0]
