import { supabase } from './supabase'
import { CompanySettings } from '@/types'

export const getCompanySettings = async (): Promise<CompanySettings | null> => {
    const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .single()

    if (error) {
        console.error('Error fetching company settings:', error)
        return null
    }

    return data
}

export const updateCompanySettings = async (settings: Partial<CompanySettings>): Promise<boolean> => {
    // Get the first (and only) settings record
    const { data: existing } = await supabase
        .from('company_settings')
        .select('id')
        .single()

    if (!existing) return false

    const payload: Record<string, unknown> = { ...settings, updated_at: new Date().toISOString() }
    let { error } = await supabase.from('company_settings').update(payload).eq('id', existing.id)

    // Si aún no se ejecutó schema_update_dashboard.sql, la columna monthly_goal no existe.
    if (error && 'monthly_goal' in payload && (error.code === '42703' || /monthly_goal/.test(error.message))) {
        delete payload.monthly_goal
        ;({ error } = await supabase.from('company_settings').update(payload).eq('id', existing.id))
    }

    if (error) {
        console.error('Error updating company settings:', JSON.stringify(error, null, 2))
        return false
    }

    return true
}

export const uploadLogo = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `logo-${Date.now()}.${fileExt}`
    const filePath = `${fileName}`

    const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
        })

    if (uploadError) {
        console.error('Error uploading logo:', uploadError)
        return null
    }

    const { data } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath)

    return data.publicUrl
}
