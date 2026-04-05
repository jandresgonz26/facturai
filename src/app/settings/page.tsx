'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { CompanySettings } from '@/types'
import { getCompanySettings, updateCompanySettings, uploadLogo } from '@/lib/settings'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import Image from 'next/image'
import { ServiceCategoryManager } from '@/components/features/ServiceCategoryManager'

export default function SettingsPage() {
    const [settings, setSettings] = useState<CompanySettings | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)

    const [companyName, setCompanyName] = useState('')
    const [rif, setRif] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [logoUrl, setLogoUrl] = useState<string | null>(null)
    const [eurUsdRate, setEurUsdRate] = useState<string>('')

    useEffect(() => {
        loadSettings()
    }, [])

    const loadSettings = async () => {
        setLoading(true)
        const data = await getCompanySettings()
        if (data) {
            setSettings(data)
            setCompanyName(data.company_name)
            setRif(data.rif)
            setPhone(data.phone)
            setEmail(data.email)
            setLogoUrl(data.logo_url)
            setEurUsdRate(data.eur_usd_rate?.toString() || '')
        }
        setLoading(false)
    }

    const handleSave = async () => {
        setSaving(true)
        const success = await updateCompanySettings({
            company_name: companyName,
            rif,
            phone,
            email,
            logo_url: logoUrl,
            eur_usd_rate: eurUsdRate ? parseFloat(eurUsdRate) : null
        })

        if (success) {
            toast.success('Configuración guardada')
            loadSettings()
        } else {
            toast.error('Error al guardar configuración')
        }
        setSaving(false)
    }

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Solo se permiten imágenes')
            return
        }

        // Validate file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
            toast.error('La imagen debe ser menor a 2MB')
            return
        }

        setUploading(true)
        const url = await uploadLogo(file)

        if (url) {
            setLogoUrl(url)
            toast.success('Logo subido. Guarda para aplicar cambios.')
        } else {
            toast.error('Error al subir logo')
        }
        setUploading(false)
    }

    if (loading) {
        return (
            <div className="max-w-2xl mx-auto">
                <div className="text-center py-10 text-muted-foreground">Cargando configuración...</div>
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Configuración</h1>

            <Card>
                <CardHeader>
                    <CardTitle>Información de la Empresa</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Logo Upload */}
                    <div className="space-y-2">
                        <Label htmlFor="logo">Logo</Label>
                        {logoUrl && (
                            <div className="mb-2 p-4 border rounded-lg bg-muted/50 flex items-center justify-center">
                                <img
                                    src={logoUrl}
                                    alt="Company Logo"
                                    className="max-h-32 object-contain"
                                />
                            </div>
                        )}
                        <Input
                            id="logo"
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            disabled={uploading}
                        />
                        <p className="text-xs text-muted-foreground">
                            Sube una imagen PNG, JPG o SVG (máx. 2MB). Recomendado: 150x50px.
                        </p>
                    </div>

                    {/* Company Name */}
                    <div className="space-y-2">
                        <Label htmlFor="companyName">Nombre de la Empresa</Label>
                        <Input
                            id="companyName"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                        />
                    </div>

                    {/* RIF */}
                    <div className="space-y-2">
                        <Label htmlFor="rif">RIF</Label>
                        <Input
                            id="rif"
                            value={rif}
                            onChange={(e) => setRif(e.target.value)}
                        />
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                        <Label htmlFor="phone">Teléfono</Label>
                        <Input
                            id="phone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                        <Label htmlFor="email">Correo Electrónico</Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    {/* Manual Exchange Rate */}
                    <div className="space-y-2 pt-4 border-t">
                        <Label htmlFor="eurUsdRate" className="text-purple-600 font-semibold">
                            Tasa de Cambio Manual (EUR {"->"} USD)
                        </Label>
                        <Input
                            id="eurUsdRate"
                            type="number"
                            step="0.00001"
                            placeholder="Ej: 1.20475 (Dejar vacío para usar tasa automática)"
                            value={eurUsdRate}
                            onChange={(e) => setEurUsdRate(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Si se define, esta tasa se usará en lugar de la automática. Útil para coincidir con Google.
                        </p>
                    </div>

                    {/* Save Button */}
                    <div className="flex justify-end pt-4">
                        <Button onClick={handleSave} disabled={saving || uploading}>
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Categorías de Servicios</CardTitle>
                </CardHeader>
                <CardContent>
                    <ServiceCategoryManager />
                </CardContent>
            </Card>
        </div>
    )
}
