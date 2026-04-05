'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Client, Log } from '@/types'
import { CheckCircle, Sparkles, RefreshCw } from 'lucide-react'
import { getEurToUsdRate } from '@/lib/currency'

import { InvoiceModal } from '@/components/features/InvoiceModal'

export default function MonthEndPage() {
    const [clients, setClients] = useState<Client[]>([])
    const [selectedClientId, setSelectedClientId] = useState<string>('all')
    const [pendingLogs, setPendingLogs] = useState<Log[]>([])
    const [loading, setLoading] = useState(false)
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
    const [hasRecurringServices, setHasRecurringServices] = useState(false)

    useEffect(() => {
        fetchClients()
    }, [])

    useEffect(() => {
        fetchPendingLogs()
        checkRecurringServices()
    }, [selectedClientId])

    const checkRecurringServices = async () => {
        if (selectedClientId === 'all') {
            setHasRecurringServices(false)
            return
        }

        const { count, error } = await supabase
            .from('recurring_services')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', selectedClientId)
            .eq('is_active', true)

        if (error) {
            console.error('Error checking recurring services:', error)
            setHasRecurringServices(false)
        } else {
            setHasRecurringServices((count || 0) > 0)
        }
    }

    const fetchClients = async () => {
        const { data } = await supabase
            .from('clients')
            .select('*')
            .order('name')
        // Only show standard clients in month-end (hour_bag sub-clients are invoiced via their parent)
        const standardClients = (data || []).filter(c => c.billing_modality !== 'hour_bag')
        setClients(standardClients)
    }

    const fetchPendingLogs = async () => {
        setLoading(true)
        let query = supabase
            .from('logs')
            .select('*, clients(name, billing_modality), service_categories(name)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false })

        if (selectedClientId !== 'all') {
            query = query.eq('client_id', selectedClientId)
        }

        const { data, error } = await query
        if (error) {
            console.error(error)
            toast.error('Error al obtener ítems pendientes')
        } else {
            const allLogs = (data as any[]) || []
            // Filtrar registros según modalidad:
            // - Ocultar 'pending' de clientes hour_bag, ya que se facturan al llegar a 10h y empaquetarse
            const billableLogs = allLogs.filter(log => {
                const clientModality = log.clients?.billing_modality
                return clientModality !== 'hour_bag'
            })
            setPendingLogs(billableLogs)
        }
        setLoading(false)
    }


    const handleGenerateInvoice = () => {
        if (selectedClientId === 'all') {
            toast.error('Por favor selecciona un cliente específico para generar factura')
            return
        }
        if (pendingLogs.length === 0) return

        setIsInvoiceModalOpen(true)
    }

    const handleLoadRecurring = async () => {
        setLoading(true)
        try {
            // 1. Fetch all active recurring services
            const { data: services, error: sError } = await supabase
                .from('recurring_services')
                .select('*')
                .eq('is_active', true)

            if (sError) throw sError
            if (!services || services.length === 0) {
                toast.info('No hay servicios fijos configurados')
                setLoading(false)
                return
            }

            // 2. Get current month range
            const now = new Date()
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

            // 3. Prepare logs to insert (Removed duplicate check as requested)
            const currentRate = await getEurToUsdRate()

            const logsToInsert = services.map(service => {
                const finalValue = service.currency === 'EUR' && service.original_amount
                    ? parseFloat((service.original_amount * currentRate).toFixed(2))
                    : service.amount

                return {
                    client_id: service.client_id,
                    description: service.description,
                    value: finalValue,
                    original_amount: service.original_amount || service.amount,
                    currency: service.currency || 'USD',
                    category_id: service.category_id,
                    status: 'pending'
                }
            })

            if (logsToInsert.length === 0) {
                toast.info('No hay servicios para cargar')
            } else {
                const { error: iError } = await supabase.from('logs').insert(logsToInsert)
                if (iError) throw iError
                toast.success(`${logsToInsert.length} servicios fijos cargados correctamente`)
                fetchPendingLogs()
            }
        } catch (error) {
            console.error('Error loading recurring services:', error)
            toast.error('Error al cargar servicios fijos')
        }
        setLoading(false)
    }

    const handleRecalculateRates = async () => {
        setLoading(true)
        try {
            const currentRate = await getEurToUsdRate()
            const logsToUpdate = pendingLogs.filter(log => log.currency === 'EUR' && log.original_amount)

            if (logsToUpdate.length === 0) {
                toast.info('No hay ítems en EUR para actualizar')
                setLoading(false)
                return
            }

            // Update each log with the new value based on current rate
            const updates = logsToUpdate.map(log => {
                const newValue = parseFloat((log.original_amount! * currentRate).toFixed(2))
                return supabase
                    .from('logs')
                    .update({ value: newValue })
                    .eq('id', log.id)
            })

            await Promise.all(updates)
            toast.success(`${logsToUpdate.length} ítems actualizados con la tasa actual (${currentRate.toFixed(4)})`)
            fetchPendingLogs()
        } catch (error) {
            console.error('Error recalculating rates:', error)
            toast.error('Error al recalcular tasas')
        }
        setLoading(false)
    }

    const totalValue = pendingLogs.reduce((sum, log) => sum + (log.value || 0), 0)
    const selectedClient = clients.find(c => c.id === selectedClientId) || null

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Cierre de Mes</h1>

            <div className="flex items-center gap-4 mb-6">
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Filtrar por Cliente" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los Clientes</SelectItem>
                        {clients.map((client) => (
                            <SelectItem key={client.id} value={client.id}>
                                {client.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid gap-4 md:grid-cols-2 mb-8">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Ítems Pendientes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{pendingLogs.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Valor Total
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-600">
                            {totalValue > 0 ? totalValue.toFixed(2) : '-'}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handleRecalculateRates}
                        disabled={loading || pendingLogs.length === 0 || selectedClient?.preferred_input_currency !== 'EUR'}
                        className="border-blue-500 text-blue-600 hover:bg-blue-50"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar Tasas
                    </Button>
                    <Button
                        variant="outline"
                        onClick={handleLoadRecurring}
                        disabled={loading || !hasRecurringServices}
                        className="border-purple-500 text-purple-600 hover:bg-purple-50"
                    >
                        <Sparkles className="w-4 h-4 mr-2" />
                        Cargar Servicios Fijos
                    </Button>
                </div>
                <Button
                    onClick={handleGenerateInvoice}
                    disabled={pendingLogs.length === 0 || loading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Generar Factura
                </Button>
            </div>

            <div className="space-y-2">
                {pendingLogs.map((log) => (
                    <div key={log.id} className="p-3 border rounded-lg bg-card flex justify-between items-center text-sm">
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold">
                                    {(log.clients as any)?.name}
                                </span>
                                {log.currency && log.currency !== 'USD' && (
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                        {log.currency}
                                    </span>
                                )}
                            </div>
                            <span className="text-muted-foreground">{log.description}</span>
                        </div>
                        <div className="font-mono flex flex-col items-end">
                            <div className="flex items-center gap-1.5">
                                {log.currency === 'EUR' && log.original_amount && (
                                    <span className="text-[10px] text-muted-foreground">
                                        ({log.original_amount.toFixed(2)} €)
                                    </span>
                                )}
                                <span className="font-bold text-emerald-600">
                                    ${log.value ? log.value.toFixed(2) : '0.00'}
                                </span>
                                {log.hours && (
                                    <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 px-1 py-0.5 rounded font-mono">
                                        {log.hours}h
                                    </span>
                                )}
                            </div>
                            {log.service_categories && (
                                <span className="text-[10px] text-purple-600 font-sans">
                                    {log.service_categories.name}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
                {pendingLogs.length === 0 && !loading && (
                    <div className="text-center py-8 text-muted-foreground">
                        No se encontraron ítems pendientes.
                    </div>
                )}
            </div>

            <InvoiceModal
                open={isInvoiceModalOpen}
                onOpenChange={setIsInvoiceModalOpen}
                client={selectedClient}
                items={pendingLogs}
                onSuccess={fetchPendingLogs}
            />
        </div>
    )
}
