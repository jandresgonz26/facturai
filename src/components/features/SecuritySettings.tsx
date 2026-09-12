'use client'

import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Cuenta con la que se entra y cambio de contraseña. */
export function SecuritySettings() {
    const [email, setEmail] = useState<string | null>(null)
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let active = true
        supabase.auth.getUser().then(({ data }) => {
            if (active) setEmail(data.user?.email ?? null)
        })
        return () => {
            active = false
        }
    }, [])

    const changePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (password.length < 8) {
            toast.error('La contraseña debe tener al menos 8 caracteres')
            return
        }
        if (password !== confirm) {
            toast.error('Las dos contraseñas no coinciden')
            return
        }
        setSaving(true)
        const { error } = await supabase.auth.updateUser({ password })
        setSaving(false)
        if (error) {
            toast.error(`No se pudo cambiar la contraseña: ${error.message}`)
            return
        }
        setPassword('')
        setConfirm('')
        toast.success('Contraseña actualizada')
    }

    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-brand-blue dark:text-brand-cyan" />
                    Seguridad
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
                <div className="text-sm">
                    <p className="text-muted-foreground">Sesión iniciada como</p>
                    <p className="font-medium">{email ?? '…'}</p>
                </div>
                <form onSubmit={changePassword} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                    <div className="space-y-1">
                        <Label htmlFor="new-password">Nueva contraseña</Label>
                        <Input
                            id="new-password"
                            type="password"
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Mínimo 8 caracteres"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="confirm-password">Repetir contraseña</Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <Button type="submit" disabled={saving || !password} className="bg-brand-blue hover:brightness-110 text-white">
                            <KeyRound className="w-4 h-4" />
                            {saving ? 'Guardando…' : 'Cambiar contraseña'}
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
