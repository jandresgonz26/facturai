'use client'

import { Suspense, useState } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BRAND } from '@/lib/brand'

function LoginForm() {
    const router = useRouter()
    const params = useSearchParams()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [show, setShow] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [working, setWorking] = useState(false)

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setWorking(true)
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) {
            // El mensaje de Supabase viene en inglés y no distingue causas a
            // propósito (para no revelar si el correo existe); aquí tampoco.
            setError('Correo o contraseña incorrectos.')
            setWorking(false)
            return
        }
        const next = params.get('next')
        router.replace(next && next.startsWith('/') ? next : '/')
        router.refresh()
    }

    const field =
        'w-full rounded-xl border border-input bg-card pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/30 transition'

    return (
        <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Correo
                </label>
                <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        autoFocus
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={field}
                        placeholder="tu@correo.com"
                    />
                </div>
            </div>
            <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Contraseña
                </label>
                <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        id="password"
                        type={show ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={field}
                        placeholder="••••••••"
                    />
                    <button
                        type="button"
                        onClick={() => setShow((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    >
                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {error}
                </p>
            )}

            <button
                type="submit"
                disabled={working}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-brand-blue py-2.5 text-sm font-semibold text-white shadow-[0_10px_22px_-10px_rgba(16,104,152,0.9)] transition hover:brightness-110 disabled:opacity-60"
            >
                <LogIn className="h-4 w-4" />
                {working ? 'Entrando…' : 'Entrar'}
            </button>
        </form>
    )
}

/**
 * Inicio de sesión. No hay registro: la cuenta la crea el administrador
 * (scripts/create-user.mjs) y desde Ajustes se cambia la contraseña.
 */
export default function LoginPage() {
    return (
        <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-background">
            {/* Panel de marca */}
            <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,#0B3552_0%,#106898_60%,#1F92A8_100%)] p-12 text-white">
                <span className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-cyan/25 blur-3xl" aria-hidden />
                <span className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-green/25 blur-3xl" aria-hidden />
                <Image src={BRAND.logoOnDark} alt={BRAND.company} width={1064} height={274} priority className="relative h-10 w-auto self-start" />
                <div className="relative">
                    <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight">
                        Facturación, clientes y tareas,
                        <br />
                        en un solo sitio.
                    </h1>
                    <p className="mt-4 max-w-md text-white/75">
                        Panel interno de {BRAND.company}. Solo para el equipo.
                    </p>
                </div>
                <p className="relative text-xs text-white/50">{BRAND.legalName}</p>
            </div>

            {/* Formulario */}
            <div className="flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-sm">
                    <Image src={BRAND.logo} alt={BRAND.company} width={1064} height={274} priority className="mb-8 h-9 w-auto lg:hidden" />
                    <h2 className="font-display text-2xl font-semibold tracking-tight">Hola de nuevo</h2>
                    <p className="mt-1 mb-8 text-sm text-muted-foreground">Entra con tu correo y contraseña.</p>
                    <Suspense>
                        <LoginForm />
                    </Suspense>
                </div>
            </div>
        </div>
    )
}
