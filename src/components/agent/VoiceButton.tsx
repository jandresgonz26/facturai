'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { LoaderCircle, Mic, Square } from 'lucide-react'

type VoiceState = 'idle' | 'recording' | 'transcribing'

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

function pickMime(): string | undefined {
    if (typeof MediaRecorder === 'undefined') return undefined
    return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
}

function extFor(mime: string): string {
    if (mime.includes('mp4')) return 'm4a'
    if (mime.includes('ogg')) return 'ogg'
    return 'webm'
}

interface Props {
    onTranscript: (text: string) => void
    disabled?: boolean
}

/**
 * Botón de micrófono estilo WhatsApp: toca para grabar, toca para detener.
 * El audio se transcribe en el servidor y el texto vuelve editable a la caja.
 */
export function VoiceButton({ onTranscript, disabled }: Props) {
    const [state, setState] = useState<VoiceState>('idle')
    const [seconds, setSeconds] = useState(0)
    const recorderRef = useRef<MediaRecorder | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const clearTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
    }

    const releaseStream = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
    }

    useEffect(() => {
        return () => {
            clearTimer()
            releaseStream()
        }
    }, [])

    const upload = async (blob: Blob, mime: string) => {
        if (blob.size < 1500) {
            toast.info('No se escuchó nada. Mantén el micrófono activo mientras hablas.')
            setState('idle')
            return
        }
        setState('transcribing')
        try {
            const form = new FormData()
            form.append('audio', blob, `voz.${extFor(mime)}`)
            const res = await fetch('/api/transcribe', { method: 'POST', body: form })
            const json = (await res.json()) as { text?: string; error?: string }
            if (!res.ok) throw new Error(json.error || 'No se pudo transcribir')
            if (json.text) onTranscript(json.text)
            else toast.info('No se entendió el audio. Intenta de nuevo.')
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'No se pudo transcribir el audio')
        } finally {
            setState('idle')
        }
    }

    const start = async () => {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
            toast.error('Tu navegador no permite grabar audio.')
            return
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream
            const mime = pickMime()
            const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
            chunksRef.current = []
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }
            recorder.onstop = () => {
                releaseStream()
                const type = recorder.mimeType || mime || 'audio/webm'
                void upload(new Blob(chunksRef.current, { type }), type)
            }
            recorder.start()
            recorderRef.current = recorder
            setSeconds(0)
            setState('recording')
            timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
        } catch (e) {
            console.error(e)
            releaseStream()
            toast.error('No se pudo acceder al micrófono. Revisa los permisos del navegador.')
        }
    }

    const stop = () => {
        clearTimer()
        const rec = recorderRef.current
        recorderRef.current = null
        if (rec && rec.state !== 'inactive') rec.stop()
        else setState('idle')
    }

    if (state === 'transcribing') {
        return (
            <button type="button" disabled className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-muted text-muted-foreground" title="Transcribiendo…">
                <LoaderCircle className="w-4 h-4 animate-spin" />
            </button>
        )
    }

    if (state === 'recording') {
        return (
            <button
                type="button"
                onClick={stop}
                className="h-9 shrink-0 px-3 rounded-full flex items-center gap-2 bg-red-500 text-white hover:bg-red-600 transition-colors"
                title="Detener y transcribir"
            >
                <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                </span>
                <span className="font-mono text-xs tabular-nums">
                    {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
                </span>
                <Square className="w-3.5 h-3.5 fill-current" />
            </button>
        )
    }

    return (
        <button
            type="button"
            onClick={start}
            disabled={disabled}
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-teal-600 hover:bg-teal-500/10 transition-colors disabled:opacity-50"
            title="Hablar (toca para grabar, toca de nuevo para detener)"
        >
            <Mic className="w-5 h-5" />
        </button>
    )
}
