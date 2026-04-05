'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Client } from '@/types'
import { Trash2, Edit2, Plus, Settings2 } from 'lucide-react'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { RecurringServicesManager } from '@/components/features/RecurringServicesManager'

export default function ClientsPage() {
    const [clients, setClients] = useState<Client[]>([])
    const [newClient, setNewClient] = useState({
        name: '',
        currency: 'USD' as 'USD' | 'EUR',
        tax_id: '',
        contact_name: '',
        billing_address: '',
        postal_code: '',
        city: '',
        email: '',
        billing_modality: 'standard' as 'standard' | 'hour_bag',
        parent_client_id: '' as string,
        hour_bag_price: '' as string
    })
    const [loading, setLoading] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editClient, setEditClient] = useState({
        name: '',
        currency: 'USD' as 'USD' | 'EUR',
        tax_id: '',
        contact_name: '',
        billing_address: '',
        postal_code: '',
        city: '',
        email: '',
        billing_modality: 'standard' as 'standard' | 'hour_bag',
        parent_client_id: '' as string,
        hour_bag_price: '' as string
    })
    const [selectedClientForServices, setSelectedClientForServices] = useState<Client | null>(null)

    useEffect(() => {
        fetchClients()
    }, [])

    const fetchClients = async () => {
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .order('name')

        if (error) {
            console.error('Error fetching clients:', error)
        } else {
            setClients(data || [])
        }
    }

    const handleAddClient = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newClient.name.trim()) return

        setLoading(true)
        const { error } = await supabase.from('clients').insert({
            name: newClient.name.trim(),
            preferred_input_currency: newClient.currency,
            tax_id: newClient.tax_id.trim() || null,
            contact_name: newClient.contact_name.trim() || null,
            billing_address: newClient.billing_address.trim() || null,
            postal_code: newClient.postal_code.trim() || null,
            city: newClient.city.trim() || null,
            email: newClient.email.trim() || null,
            billing_modality: newClient.billing_modality,
            parent_client_id: newClient.parent_client_id || null,
            hour_bag_price: newClient.billing_modality === 'hour_bag' && newClient.hour_bag_price ? parseFloat(newClient.hour_bag_price) : null
        })

        if (error) {
            toast.error('Error al agregar cliente')
        } else {
            toast.success('Cliente agregado')
            setNewClient({
                name: '',
                currency: 'USD',
                tax_id: '',
                contact_name: '',
                billing_address: '',
                postal_code: '',
                city: '',
                email: '',
                billing_modality: 'standard',
                parent_client_id: '',
                hour_bag_price: ''
            })
            fetchClients()
        }
        setLoading(false)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro? Esto eliminará todos los registros de este cliente.')) return

        const { error } = await supabase.from('clients').delete().eq('id', id)
        if (error) {
            toast.error('Error al eliminar cliente')
        } else {
            toast.success('Cliente eliminado')
            fetchClients()
        }
    }

    const startEdit = (client: Client) => {
        setEditingId(client.id)
        setEditClient({
            name: client.name,
            currency: client.preferred_input_currency,
            tax_id: client.tax_id || '',
            contact_name: client.contact_name || '',
            billing_address: client.billing_address || '',
            postal_code: client.postal_code || '',
            city: client.city || '',
            email: client.email || '',
            billing_modality: client.billing_modality || 'standard',
            parent_client_id: client.parent_client_id || '',
            hour_bag_price: client.hour_bag_price ? String(client.hour_bag_price) : ''
        })
    }

    const saveEdit = async () => {
        if (!editClient.name.trim() || !editingId) return

        const { error } = await supabase
            .from('clients')
            .update({
                name: editClient.name.trim(),
                preferred_input_currency: editClient.currency,
                tax_id: editClient.tax_id.trim() || null,
                contact_name: editClient.contact_name.trim() || null,
                billing_address: editClient.billing_address.trim() || null,
                postal_code: editClient.postal_code.trim() || null,
                city: editClient.city.trim() || null,
                email: editClient.email.trim() || null,
                billing_modality: editClient.billing_modality,
                parent_client_id: editClient.parent_client_id || null,
                hour_bag_price: editClient.billing_modality === 'hour_bag' && editClient.hour_bag_price ? parseFloat(editClient.hour_bag_price) : null
            })
            .eq('id', editingId)

        if (error) {
            toast.error('Error al actualizar cliente')
        } else {
            toast.success('Cliente actualizado')
            setEditingId(null)
            fetchClients()
        }
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Gestión de Clientes</h1>

            <Card className="mb-8">
                <CardHeader>
                    <CardTitle className="text-lg">Agregar Nuevo Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleAddClient} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Nombre Comercial / Empresa</label>
                                <Input
                                    placeholder="Ej: Acme Corp"
                                    value={newClient.name}
                                    onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Moneda Preferida</label>
                                <Select
                                    value={newClient.currency}
                                    onValueChange={(v: 'USD' | 'EUR') => setNewClient({ ...newClient, currency: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Moneda" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="USD">USD</SelectItem>
                                        <SelectItem value="EUR">EUR</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">ID Fiscal (CIF/RIF/NIT)</label>
                                <Input
                                    placeholder="Ej: J-12345678-9"
                                    value={newClient.tax_id}
                                    onChange={(e) => setNewClient({ ...newClient, tax_id: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Correo Electrónico</label>
                                <Input
                                    type="email"
                                    placeholder="Ej: cliente@correo.com"
                                    value={newClient.email}
                                    onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Nombre de Contacto / Razón Social</label>
                                <Input
                                    placeholder="Ej: Juan Pérez"
                                    value={newClient.contact_name}
                                    onChange={(e) => setNewClient({ ...newClient, contact_name: e.target.value })}
                                />
                            </div>
                            <div className="md:col-span-2 space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Dirección de Facturación</label>
                                <Input
                                    placeholder="Calle, número, oficina..."
                                    value={newClient.billing_address}
                                    onChange={(e) => setNewClient({ ...newClient, billing_address: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Código Postal</label>
                                <Input
                                    placeholder="Ej: 1010"
                                    value={newClient.postal_code}
                                    onChange={(e) => setNewClient({ ...newClient, postal_code: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Ciudad</label>
                                <Input
                                    placeholder="Ej: Caracas"
                                    value={newClient.city}
                                    onChange={(e) => setNewClient({ ...newClient, city: e.target.value })}
                                />
                            </div>
                        </div>

                        {/* Sub-client / Hour Bag Section */}
                        <div className="border-t pt-4 mt-2">
                            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Modalidad de Facturación</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Modalidad</label>
                                    <Select
                                        value={newClient.billing_modality}
                                        onValueChange={(v: 'standard' | 'hour_bag') => setNewClient({ ...newClient, billing_modality: v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Modalidad" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="standard">Estándar</SelectItem>
                                            <SelectItem value="hour_bag">Bolsa de 10 Horas</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Cliente Padre (Facturar a)</label>
                                    <Select
                                        value={newClient.parent_client_id || 'none'}
                                        onValueChange={(v) => setNewClient({ ...newClient, parent_client_id: v === 'none' ? '' : v })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Ninguno" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Ninguno (directo)</SelectItem>
                                            {clients.map((c) => (
                                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {newClient.billing_modality === 'hour_bag' && (
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-muted-foreground">Precio Bolsa (€)</label>
                                        <Input
                                            type="number"
                                            step="0.01"
                                            placeholder="Ej: 120.00"
                                            value={newClient.hour_bag_price}
                                            onChange={(e) => setNewClient({ ...newClient, hour_bag_price: e.target.value })}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>

                        <Button type="submit" disabled={loading} className="w-full">
                            <Plus className="w-4 h-4 mr-2" />
                            Agregar Cliente
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <div className="space-y-3">
                {clients.map((client) => (
                    <div
                        key={client.id}
                        className="p-4 bg-card border rounded-lg shadow-sm"
                    >
                        {editingId === client.id ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Input
                                        value={editClient.name}
                                        onChange={(e) => setEditClient({ ...editClient, name: e.target.value })}
                                        placeholder="Nombre"
                                        className="h-9"
                                    />
                                    <Select
                                        value={editClient.currency}
                                        onValueChange={(v: 'USD' | 'EUR') => setEditClient({ ...editClient, currency: v })}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="USD">USD</SelectItem>
                                            <SelectItem value="EUR">EUR</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={editClient.tax_id}
                                        onChange={(e) => setEditClient({ ...editClient, tax_id: e.target.value })}
                                        placeholder="ID Fiscal"
                                        className="h-9"
                                    />
                                    <Input
                                        value={editClient.contact_name}
                                        onChange={(e) => setEditClient({ ...editClient, contact_name: e.target.value })}
                                        placeholder="Contacto"
                                        className="h-9"
                                    />
                                    <Input
                                        value={editClient.email}
                                        onChange={(e) => setEditClient({ ...editClient, email: e.target.value })}
                                        placeholder="Email"
                                        className="h-9"
                                    />
                                    <Input
                                        value={editClient.billing_address}
                                        onChange={(e) => setEditClient({ ...editClient, billing_address: e.target.value })}
                                        placeholder="Dirección"
                                        className="h-9 md:col-span-2"
                                    />
                                    <Input
                                        value={editClient.postal_code}
                                        onChange={(e) => setEditClient({ ...editClient, postal_code: e.target.value })}
                                        placeholder="CP"
                                        className="h-9"
                                    />
                                    <Input
                                        value={editClient.city}
                                        onChange={(e) => setEditClient({ ...editClient, city: e.target.value })}
                                        placeholder="Ciudad"
                                        className="h-9"
                                    />
                                    <Input
                                        value={editClient.hour_bag_price}
                                        onChange={(e) => setEditClient({ ...editClient, hour_bag_price: e.target.value })}
                                        placeholder="Precio Bolsa (€)"
                                        className="h-9"
                                        type="number"
                                        step="0.01"
                                        disabled={editClient.billing_modality !== 'hour_bag'}
                                    />
                                    <Select
                                        value={editClient.billing_modality}
                                        onValueChange={(v: 'standard' | 'hour_bag') => setEditClient({ ...editClient, billing_modality: v })}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Modalidad" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="standard">Estándar</SelectItem>
                                            <SelectItem value="hour_bag">Bolsa de 10 Horas</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Select
                                        value={editClient.parent_client_id || 'none'}
                                        onValueChange={(v) => setEditClient({ ...editClient, parent_client_id: v === 'none' ? '' : v })}
                                    >
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Cliente Padre" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Ninguno (directo)</SelectItem>
                                            {clients.filter(c => c.id !== editingId).map((c) => (
                                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <Button size="sm" onClick={saveEdit}>Guardar Cambios</Button>
                                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-lg">{client.name}</span>
                                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                                            {client.preferred_input_currency}
                                        </span>
                                        {client.billing_modality === 'hour_bag' && (
                                            <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1.5 py-0.5 rounded font-semibold">
                                                ⏱ Bolsa 10h{client.hour_bag_price ? ` • €${client.hour_bag_price}` : ''}
                                            </span>
                                        )}
                                        {client.parent_client_id && (
                                            <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded font-semibold">
                                                ↗ {clients.find(c => c.id === client.parent_client_id)?.name || 'Padre'}
                                            </span>
                                        )}
                                    </div>
                                    {client.contact_name && (
                                        <span className="text-sm text-muted-foreground font-medium">
                                            {client.contact_name} {client.tax_id && `(${client.tax_id})`}
                                        </span>
                                    )}
                                    {client.email && (
                                        <span className="text-xs text-primary font-medium">
                                            {client.email}
                                        </span>
                                    )}
                                    {(client.billing_address || client.city) && (
                                        <span className="text-xs text-muted-foreground">
                                            {client.billing_address}{client.city && `, ${client.city}`}{client.postal_code && ` (${client.postal_code})`}
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-1">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => setSelectedClientForServices(client)}
                                        title="Servicios Fijos"
                                        className="h-8 w-8"
                                    >
                                        <Settings2 className="w-4 h-4 text-primary" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => startEdit(client)}
                                        disabled={!!editingId}
                                        className="h-8 w-8"
                                    >
                                        <Edit2 className="w-4 h-4 text-muted-foreground" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => handleDelete(client.id)}
                                        disabled={!!editingId}
                                        className="h-8 w-8"
                                    >
                                        <Trash2 className="w-4 h-4 text-destructive" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}

                {selectedClientForServices && (
                    <RecurringServicesManager
                        client={selectedClientForServices}
                        onClose={() => setSelectedClientForServices(null)}
                    />
                )}
                {clients.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                        No se encontraron clientes.
                    </div>
                )}
            </div>
        </div>
    )
}
