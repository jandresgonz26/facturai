import { toast } from 'sonner'
import { generateInvoiceDoc } from './invoice-generator'
import { generateInvoicePdf } from './invoice-pdf-generator'
import { getInvoiceWithItems } from './actions/invoices'

export type InvoiceFormat = 'pdf' | 'docx'

interface FileType {
    description: string
    accept: Record<string, string[]>
}

const FILE_TYPES: Record<InvoiceFormat, FileType> = {
    pdf: { description: 'Documento PDF', accept: { 'application/pdf': ['.pdf'] } },
    docx: {
        description: 'Documento Word',
        accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] },
    },
}

/** Guarda un blob usando el selector nativo si existe; si no, descarga directa. */
export async function saveBlobToFile(blob: Blob, fileName: string, fileType: FileType): Promise<'saved' | 'cancelled'> {
    if ('showSaveFilePicker' in window) {
        try {
            const picker = (window as unknown as { showSaveFilePicker: (o: unknown) => Promise<{ createWritable: () => Promise<{ write: (b: Blob) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker
            const handle = await picker({ suggestedName: fileName, types: [fileType] })
            const writable = await handle.createWritable()
            await writable.write(blob)
            await writable.close()
            return 'saved'
        } catch (e) {
            if ((e as { name?: string })?.name === 'AbortError') return 'cancelled'
        }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
        URL.revokeObjectURL(url)
        document.body.removeChild(a)
    }, 200)
    return 'saved'
}

function base64ToBlob(base64: string, type: string): Blob {
    const bytes = atob(base64)
    const arr = new Uint8Array(bytes.length)
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
    return new Blob([arr], { type })
}

/** Genera y descarga una factura existente en el formato indicado. */
export async function downloadInvoice(invoiceId: string, format: InvoiceFormat): Promise<void> {
    const toastId = toast.loading(format === 'pdf' ? 'Generando PDF...' : 'Generando DOCX...')
    try {
        const { invoice, items, client } = await getInvoiceWithItems(invoiceId)
        let blob: Blob
        let fileName: string
        if (format === 'pdf') {
            ;({ blob, fileName } = await generateInvoicePdf(invoice, items, client))
        } else {
            const { base64, fileName: name } = await generateInvoiceDoc(invoice, items, client)
            blob = base64ToBlob(base64, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            fileName = name
        }
        const result = await saveBlobToFile(blob, fileName, FILE_TYPES[format])
        toast.dismiss(toastId)
        if (result === 'saved') toast.success('Factura guardada')
    } catch (e) {
        console.error(e)
        toast.dismiss(toastId)
        toast.error(e instanceof Error ? e.message : 'Error al generar la factura')
    }
}
