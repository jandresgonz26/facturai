'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LoaderCircle, Mail, Paperclip, TriangleAlert } from 'lucide-react'
import type { EmailKind } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { previewEmail, sendDocumentEmail, type EmailPreview } from '@/lib/actions/email'
import { emitDataChanged } from '@/lib/events'

const TITLES: Record<EmailKind, string> = {
    invoice: 'Enviar factura por correo',
    quote: 'Enviar cotización por correo',
    payment_thanks: 'Enviar agradecimiento de pago',
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const fmt = (iso: string) => iso.split('T')[0].split('-').reverse().join('/')

interface Props {
    kind: EmailKind
    id: string | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSent?: () => void
}

/**
 * Vista previa exacta + envío. Lo que ves es lo que sale: el mismo generador
 * arma la vista previa y el correo. Nunca envía sin que pulses "Enviar".
 */
export function EmailDialog({ kind, id, open, onOpenChange, onSent }: Props) {
    const [preview, setPreview] = useState<EmailPreview | null>(null)
    const [loading, setLoading] = useState(false)
    const [to, setTo] = useState('')
    const [sending, setSending] = useState(false)

    useEffect(() => {
        if (!open || !id) return
        let active = true
        setLoading(true)
        setPreview(null)
        previewEmail(kind, id)
            .then((p) => {
                if (!active) return
                setPreview(p)
                setTo(p.to ?? '')
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : 'No se pudo preparar el correo'))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [open, id, kind])

    const validTo = EMAIL_RE.test(to.trim())
    const blocking = preview?.warnings.filter((w) => w.includes('RESEND_API_KEY') || w.includes('no está marcada como pagada')) ?? []
    const canSend = !!preview && validTo && blocking.length === 0 && !sending

    const send = async () => {
        if (!id || !canSend) return
        setSending(true)
        try {
            const r = await sendDocumentEmail(kind, id, to.trim())
            toast.success(r.redirected ? `Enviado en modo prueba a ${r.to}` : `Correo enviado a ${r.to}`)
            emitDataChanged()
            onSent?.()
            onOpenChange(false)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo enviar el correo')
        } finally {
            setSending(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5 text-teal-600" /> {TITLES[kind]}
                    </DialogTitle>
                    <DialogDescription>Revisa a quién va y qué dice. Es un envío real al cliente y no se puede deshacer.</DialogDescription>
                </DialogHeader>

                {loading || !preview ? (
                    <div className="py-10 flex justify-center text-muted-foreground">
                        <LoaderCircle className="w-5 h-5 animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-3">
                        {preview.warnings.length > 0 && (
                            <ul className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                                {preview.warnings.map((w, i) => (
                                    <li key={i} className="flex gap-1.5">
                                        <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {w}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {preview.already_sent && (
                            <p className="text-xs text-amber-700 dark:text-amber-300">
                                Ya se envió el {fmt(preview.already_sent.sent_at)} a {preview.already_sent.to}. Esto sería un reenvío.
                            </p>
                        )}
                        <div className="space-y-1">
                            <Label htmlFor="email-to">Para</Label>
                            <Input id="email-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="cliente@correo.com" />
                            {!validTo && to && <p className="text-xs text-destructive">Correo inválido</p>}
                        </div>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                            <dt className="text-muted-foreground">De</dt>
                            <dd className="truncate">{preview.from}</dd>
                            <dt className="text-muted-foreground">Asunto</dt>
                            <dd className="font-medium">{preview.subject}</dd>
                            <dt className="text-muted-foreground">Adjunto</dt>
                            <dd className="flex items-center gap-1 font-mono text-xs"><Paperclip className="w-3.5 h-3.5" /> {preview.attachment_name}</dd>
                        </dl>
                        <pre className="whitespace-pre-wrap font-sans text-sm bg-muted/40 rounded-lg p-3 max-h-64 overflow-y-auto">{preview.text}</pre>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancelar</Button>
                    <Button onClick={send} disabled={!canSend} className="bg-teal-600 hover:bg-teal-700 text-white">
                        {sending ? <LoaderCircle className="animate-spin" /> : <Mail />} {preview?.already_sent ? 'Reenviar' : 'Enviar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
