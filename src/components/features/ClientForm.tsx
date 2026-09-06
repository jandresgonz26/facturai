'use client'

import { useState } from 'react'
import { Client } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ClientInput } from '@/lib/actions/clients'
import { LoaderCircle } from 'lucide-react'

export type ClientFormValues = {
    name: string
    preferred_input_currency: 'USD' | 'EUR'
    billing_modality: 'standard' | 'hour_bag'
    parent_client_id: string
    hour_bag_price: string
    tax_id: string
    contact_name: string
    billing_address: string
    postal_code: string
    city: string
    email: string
}

export function clientToForm(c?: Client | null): ClientFormValues {
    return {
        name: c?.name ?? '',
        preferred_input_currency: c?.preferred_input_currency ?? 'USD',
        billing_modality: c?.billing_modality ?? 'standard',
        parent_client_id: c?.parent_client_id ?? '',
        hour_bag_price: c?.hour_bag_price ? String(c.hour_bag_price) : '',
        tax_id: c?.tax_id ?? '',
        contact_name: c?.contact_name ?? '',
        billing_address: c?.billing_address ?? '',
        postal_code: c?.postal_code ?? '',
        city: c?.city ?? '',
        email: c?.email ?? '',
    }
}

interface Props {
    clients: Client[]
    initial?: Client | null
    submitting?: boolean
    onSubmit: (values: ClientInput) => Promise<void> | void
    onCancel?: () => void
}

/** Formulario único para crear y editar clientes. Solo muestra los campos que aplican. */
export function ClientForm({ clients, initial, submitting, onSubmit, onCancel }: Props) {
    const [v, setV] = useState<ClientFormValues>(() => clientToForm(initial))
    const set = <K extends keyof ClientFormValues>(k: K, val: ClientFormValues[K]) => setV((s) => ({ ...s, [k]: val }))
    const isHourBag = v.billing_modality === 'hour_bag'
    const parentOptions = clients.filter((c) => c.id !== initial?.id && c.billing_modality !== 'hour_bag')

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        await onSubmit({
            name: v.name,
            preferred_input_currency: v.preferred_input_currency,
            billing_modality: v.billing_modality,
            parent_client_id: v.parent_client_id || undefined,
            hour_bag_price: v.hour_bag_price ? Number(v.hour_bag_price) : undefined,
            tax_id: v.tax_id || undefined,
            contact_name: v.contact_name || undefined,
            billing_address: v.billing_address || undefined,
            postal_code: v.postal_code || undefined,
            city: v.city || undefined,
            email: v.email || undefined,
        })
    }

    return (
        <form onSubmit={submit} className="space-y-5">
            <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Identificación</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                        <Label htmlFor="c-name">Nombre comercial / empresa *</Label>
                        <Input id="c-name" placeholder="Ej: Acme Corp" value={v.name} onChange={(e) => set('name', e.target.value)} required />
                    </div>
                    <div className="space-y-1">
                        <Label>Moneda</Label>
                        <Select value={v.preferred_input_currency} onValueChange={(x: 'USD' | 'EUR') => set('preferred_input_currency', x)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="c-tax">ID fiscal (CIF/RIF/NIT)</Label>
                        <Input id="c-tax" placeholder="Ej: J-12345678-9" value={v.tax_id} onChange={(e) => set('tax_id', e.target.value)} />
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Modalidad de facturación</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label>Modalidad</Label>
                        <Select value={v.billing_modality} onValueChange={(x: 'standard' | 'hour_bag') => set('billing_modality', x)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="standard">Estándar (por monto)</SelectItem>
                                <SelectItem value="hour_bag">Bolsa de 10 horas</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label>Cliente padre (a quien se factura)</Label>
                        <Select value={v.parent_client_id || 'none'} onValueChange={(x) => set('parent_client_id', x === 'none' ? '' : x)}>
                            <SelectTrigger><SelectValue placeholder="Ninguno" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">Ninguno (se factura directo)</SelectItem>
                                {parentOptions.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {isHourBag && (
                        <div className="sm:col-span-2 space-y-1">
                            <Label htmlFor="c-bag">Precio de la bolsa de 10 h (€) *</Label>
                            <Input id="c-bag" type="number" step="0.01" min="0" placeholder="Ej: 120.00" value={v.hour_bag_price} onChange={(e) => set('hour_bag_price', e.target.value)} required />
                            <p className="text-xs text-muted-foreground">Las horas se registran sin monto y se facturan al padre al completar 10 h.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Contacto y dirección</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label htmlFor="c-contact">Nombre de contacto / razón social</Label>
                        <Input id="c-contact" placeholder="Ej: Juan Pérez" value={v.contact_name} onChange={(e) => set('contact_name', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="c-email">Correo electrónico</Label>
                        <Input id="c-email" type="email" placeholder="cliente@correo.com" value={v.email} onChange={(e) => set('email', e.target.value)} />
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                        <Label htmlFor="c-addr">Dirección de facturación</Label>
                        <Input id="c-addr" placeholder="Calle, número, oficina..." value={v.billing_address} onChange={(e) => set('billing_address', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="c-cp">Código postal</Label>
                        <Input id="c-cp" placeholder="Ej: 1010" value={v.postal_code} onChange={(e) => set('postal_code', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="c-city">Ciudad</Label>
                        <Input id="c-city" placeholder="Ej: Caracas" value={v.city} onChange={(e) => set('city', e.target.value)} />
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
                {onCancel && (
                    <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancelar</Button>
                )}
                <Button type="submit" disabled={submitting} className="bg-teal-600 hover:bg-teal-700 text-white">
                    {submitting && <LoaderCircle className="animate-spin" />}
                    {initial ? 'Guardar cambios' : 'Crear cliente'}
                </Button>
            </div>
        </form>
    )
}
