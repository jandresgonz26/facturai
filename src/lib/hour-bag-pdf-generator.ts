import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getCompanySettings } from './settings'

export interface HourBagLog {
    id: string
    description: string
    hours: number
    created_at: string
    service_categories?: { name: string } | null
}

export interface HourBagPdfData {
    clientName: string
    parentClientName: string
    bagPrice: number
    currency: string
    totalHours: number
    packagedAt?: string // ISO date string
    logs: HourBagLog[]
}

export const generateHourBagPdf = async (data: HourBagPdfData): Promise<{ blob: Blob; fileName: string }> => {
    const settings = await getCompanySettings()
    const companyName = settings?.company_name || 'JAMTech C.A.'
    const companyRif = settings?.rif || 'J-40505911-0'
    const companyPhone = settings?.phone || '+58(424)922-5108'
    const companyEmail = settings?.email || 'hello@jamtechcorp.com'

    const formatDate = (dateString: string) => {
        if (!dateString) return ''
        const d = new Date(dateString)
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 15

    let y = 20

    // ── Title ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(28)
    doc.setTextColor(88, 28, 135) // Purple-800
    doc.text('BOLSA DE HORAS', margin, y)

    // ── Sub-client & date (right side) ──
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    const rightDate = data.packagedAt
        ? formatDate(data.packagedAt)
        : formatDate(new Date().toISOString())
    doc.text(rightDate, pageWidth - margin, y - 8, { align: 'right' })
    doc.text(data.parentClientName, pageWidth - margin, y - 3, { align: 'right' })

    y += 12

    // ── Divider ──
    doc.setDrawColor(139, 92, 246) // Purple-500
    doc.setLineWidth(0.8)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    // ── Client info block ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(107, 33, 168) // Purple-700
    doc.text('CLIENTE (Sub-cuenta)', margin, y)

    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(0, 0, 0)
    doc.text(data.clientName, margin, y)

    y += 10

    // ── Summary chips ──
    // Hours chip
    doc.setFillColor(237, 233, 254) // Purple-100
    doc.setDrawColor(167, 139, 250) // Purple-400
    doc.setLineWidth(0.3)
    doc.roundedRect(margin, y, 55, 14, 3, 3, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(107, 33, 168)
    doc.text('HORAS ACUMULADAS', margin + 4, y + 5)
    doc.setFontSize(13)
    doc.setTextColor(88, 28, 135)
    doc.text(`${data.totalHours.toFixed(1)}h / 10h`, margin + 4, y + 12)


    y += 22

    // ── Divider ──
    doc.setDrawColor(229, 231, 235) // Gray-200
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    // ── Section label ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(107, 33, 168)
    doc.text('DETALLE DE TAREAS', margin, y)
    y += 5

    // ── Tasks Table ──
    const tableBody = data.logs.map((log, index) => [
        (index + 1).toString(),
        formatDate(log.created_at),
        log.service_categories?.name || '—',
        log.description,
        `${log.hours}h`,
    ])

    autoTable(doc, {
        startY: y,
        head: [['#', 'FECHA', 'CATEGORÍA', 'DESCRIPCIÓN DE LA TAREA', 'HORAS']],
        body: tableBody,
        margin: { left: margin, right: margin },
        styles: {
            font: 'helvetica',
            fontSize: 9,
            cellPadding: 3.5,
            lineColor: [209, 213, 219],
            lineWidth: 0.2,
        },
        headStyles: {
            fillColor: [109, 40, 217], // Purple-700
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
        },
        alternateRowStyles: {
            fillColor: [250, 245, 255], // Purple-50
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { halign: 'center', cellWidth: 24 },
            2: { cellWidth: 36 },
            3: { cellWidth: 85 },
            4: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
        },
        theme: 'grid',
    })

    y = (doc as any).lastAutoTable.finalY + 6

    // ── Total hours row ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(88, 28, 135)
    doc.text(`Total acumulado: ${data.totalHours.toFixed(1)} horas`, pageWidth - margin, y, { align: 'right' })

    y += 8


    y += 22


    const pdfBlob = doc.output('blob')
    const safeName = data.clientName.replace(/[^a-zA-Z0-9]/g, '_')
    const dateStr = (data.packagedAt || new Date().toISOString()).slice(0, 10)
    const fileName = `BolsaHoras_${safeName}_${dateStr}.pdf`

    return { blob: pdfBlob, fileName }
}
