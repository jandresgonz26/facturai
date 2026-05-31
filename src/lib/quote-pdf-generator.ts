import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Quote, CompanySettings } from '@/types'
import { getCompanySettings } from './settings'

const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const [year, month, day] = dateString.split('-')
    return `${day}/${month}/${year}`
}

const buildFileName = (quote: Quote, formattedDate: string) => {
    const clientName = (quote.client_name || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_')
    const titlePart = (quote.doc_title || 'Cotizacion')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // strip accents
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
    return `${titlePart}_${quote.quote_number}_${clientName}_${formattedDate.replace(/\//g, '-')}.pdf`
}

// ─────────────────────────────────────────────────────────────
//  JAMTech template (header image + corporate blue, like invoices)
// ─────────────────────────────────────────────────────────────
const renderJamtechTemplate = async (quote: Quote, settings: CompanySettings | null) => {
    const companyName = quote.company_name || settings?.company_name || 'JAMTech C.A.'
    const companyRif = settings?.rif || 'J-40505911-0'
    const companyPhone = settings?.phone || '+58(424)922-5108'
    const companyEmail = settings?.email || 'hello@jamtechcorp.com'

    const isHours = quote.quote_type === 'hours'
    const currencySymbol = quote.currency === 'EUR' ? '€' : '$'
    const formattedDate = formatDate(quote.issue_date)
    const docTitle = (quote.doc_title || 'COTIZACIÓN').toUpperCase()

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 15

    // ── Header Image ──
    let headerHeight = 0
    try {
        const response = await fetch('/invoice-header.png')
        if (response.ok) {
            const blob = await response.blob()
            const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader()
                reader.onloadend = () => resolve(reader.result as string)
                reader.readAsDataURL(blob)
            })
            const imgDims = await new Promise<{ w: number; h: number }>((resolve) => {
                const img = new Image()
                img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
                img.src = dataUrl
            })
            headerHeight = (pageWidth * imgDims.h) / imgDims.w
            doc.addImage(dataUrl, 'PNG', 0, 0, pageWidth, headerHeight)
        }
    } catch (e) {
        console.error('Could not load header image', e)
    }

    let y = headerHeight + 12

    // ── Document Title ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(32)
    doc.setTextColor(47, 84, 150) // Corporate Blue
    doc.text(docTitle, margin, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    doc.text(`No.: ${quote.quote_number}`, pageWidth - margin, y - 8, { align: 'right' })
    doc.text(`Fecha: ${formattedDate}`, pageWidth - margin, y - 3, { align: 'right' })

    y += 12

    // ── Client Info ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Para:', margin, y)
    y += 5
    doc.text(quote.client_name, margin, y)

    y += 10

    if (isHours) {
        const tableBody = (quote.items || []).map((item, index) => [
            (index + 1).toString(),
            item.service || 'Servicio Profesional',
            item.description,
            (item.hours || 0).toString(),
        ])

        autoTable(doc, {
            startY: y,
            head: [['No.', 'PRODUCTO / SERVICIO', 'DESCRIPCIÓN', 'HORAS']],
            body: tableBody,
            margin: { left: margin, right: margin },
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.1 },
            headStyles: {
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                halign: 'center',
                valign: 'middle',
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 18 },
                1: { cellWidth: 60 },
                2: { cellWidth: 72 },
                3: { halign: 'center', cellWidth: 30 },
            },
            theme: 'grid',
        })

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

        const totalsX = pageWidth - margin - 30
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text('Total horas', totalsX, y, { align: 'right' })
        doc.text(`${quote.total_hours} h`, pageWidth - margin, y, { align: 'right' })
    } else {
        const tableBody = (quote.items || []).map((item, index) => {
            const qty = item.quantity || 1
            const unit = item.unit_price || 0
            return [
                (index + 1).toString(),
                item.service || 'Servicio Profesional',
                item.description,
                unit.toFixed(2),
                qty.toString(),
                (unit * qty).toFixed(2),
            ]
        })

        autoTable(doc, {
            startY: y,
            head: [['No.', 'PRODUCTO / SERVICIO', 'DESCRIPCIÓN', 'P. UNIT.', 'CANT', 'IMPORTE']],
            body: tableBody,
            margin: { left: margin, right: margin },
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, lineColor: [0, 0, 0], lineWidth: 0.1 },
            headStyles: {
                fillColor: [240, 240, 240],
                textColor: [0, 0, 0],
                fontStyle: 'bold',
                halign: 'center',
                valign: 'middle',
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 18 },
                1: { cellWidth: 54 },
                2: { cellWidth: 54 },
                3: { halign: 'right', cellWidth: 18 },
                4: { halign: 'center', cellWidth: 18 },
                5: { halign: 'right', cellWidth: 18 },
            },
            theme: 'grid',
        })

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

        const totalsX = pageWidth - margin - 25
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text('Subtotal', totalsX, y, { align: 'right' })
        doc.text(quote.total_amount.toFixed(2), pageWidth - margin, y, { align: 'right' })

        y += 5
        doc.setFontSize(10)
        doc.text('Total', totalsX, y, { align: 'right' })
        doc.text(`${currencySymbol}${quote.total_amount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' })
    }

    // ── Footer ──
    y += 20
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(companyName, pageWidth / 2, y, { align: 'center' })
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Rif: ${companyRif}`, pageWidth / 2, y, { align: 'center' })
    y += 4
    doc.text(companyPhone, pageWidth / 2, y, { align: 'center' })
    y += 4
    doc.text(companyEmail, pageWidth / 2, y, { align: 'center' })

    return doc
}

// ─────────────────────────────────────────────────────────────
//  Asiri template (purple, like the hour-bag document)
// ─────────────────────────────────────────────────────────────
const renderAsiriTemplate = (quote: Quote) => {
    const isHours = quote.quote_type === 'hours'
    const currencySymbol = quote.currency === 'EUR' ? '€' : '$'
    const companyName = quote.company_name || 'ASIRI MARKETING SL'
    const docTitle = (quote.doc_title || 'COTIZACIÓN').toUpperCase()

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 15

    let y = 20

    // ── Title ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(28)
    doc.setTextColor(88, 28, 135) // Purple-800
    doc.text(docTitle, margin, y)

    // ── Date & company (right side) ──
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    doc.text(formatDate(quote.issue_date), pageWidth - margin, y - 8, { align: 'right' })
    doc.text(companyName, pageWidth - margin, y - 3, { align: 'right' })

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
    doc.text('CLIENTE', margin, y)

    y += 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(0, 0, 0)
    doc.text(quote.client_name, margin, y)

    y += 10

    // ── Summary chip ──
    doc.setFillColor(237, 233, 254) // Purple-100
    doc.setDrawColor(167, 139, 250) // Purple-400
    doc.setLineWidth(0.3)
    doc.roundedRect(margin, y, 60, 14, 3, 3, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(107, 33, 168)
    if (isHours) {
        doc.text('TOTAL DE HORAS', margin + 4, y + 5)
        doc.setFontSize(13)
        doc.setTextColor(88, 28, 135)
        doc.text(`${quote.total_hours} h`, margin + 4, y + 12)
    } else {
        doc.text('TOTAL', margin + 4, y + 5)
        doc.setFontSize(13)
        doc.setTextColor(88, 28, 135)
        doc.text(`${currencySymbol}${quote.total_amount.toFixed(2)}`, margin + 4, y + 12)
    }

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
    if (isHours) {
        const tableBody = (quote.items || []).map((item, index) => [
            (index + 1).toString(),
            item.service || 'Servicio Profesional',
            item.description,
            `${item.hours || 0}h`,
        ])

        autoTable(doc, {
            startY: y,
            head: [['#', 'PRODUCTO / SERVICIO', 'DESCRIPCIÓN DE LA TAREA', 'HORAS']],
            body: tableBody,
            margin: { left: margin, right: margin },
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 3.5, lineColor: [209, 213, 219], lineWidth: 0.2 },
            headStyles: {
                fillColor: [109, 40, 217], // Purple-700
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
                valign: 'middle',
            },
            alternateRowStyles: { fillColor: [250, 245, 255] }, // Purple-50
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                1: { cellWidth: 45 },
                2: { cellWidth: 100 },
                3: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
            },
            theme: 'grid',
        })

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(88, 28, 135)
        doc.text(`Total acumulado: ${quote.total_hours} horas`, pageWidth - margin, y, { align: 'right' })
    } else {
        const tableBody = (quote.items || []).map((item, index) => {
            const qty = item.quantity || 1
            const unit = item.unit_price || 0
            return [
                (index + 1).toString(),
                item.service || 'Servicio Profesional',
                item.description,
                `${currencySymbol}${unit.toFixed(2)}`,
                qty.toString(),
                `${currencySymbol}${(unit * qty).toFixed(2)}`,
            ]
        })

        autoTable(doc, {
            startY: y,
            head: [['#', 'PRODUCTO / SERVICIO', 'DESCRIPCIÓN DE LA TAREA', 'P. UNIT.', 'CANT', 'IMPORTE']],
            body: tableBody,
            margin: { left: margin, right: margin },
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 3.5, lineColor: [209, 213, 219], lineWidth: 0.2 },
            headStyles: {
                fillColor: [109, 40, 217], // Purple-700
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center',
                valign: 'middle',
            },
            alternateRowStyles: { fillColor: [250, 245, 255] }, // Purple-50
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                1: { cellWidth: 42 },
                2: { cellWidth: 67 },
                3: { halign: 'right', cellWidth: 22 },
                4: { halign: 'center', cellWidth: 16 },
                5: { halign: 'right', cellWidth: 23, fontStyle: 'bold' },
            },
            theme: 'grid',
        })

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(88, 28, 135)
        doc.text(`Total: ${currencySymbol}${quote.total_amount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' })
    }

    return doc
}

export const generateQuotePdf = async (
    quote: Quote
): Promise<{ blob: Blob; fileName: string }> => {
    const settings = await getCompanySettings()
    const formattedDate = formatDate(quote.issue_date)

    const doc =
        quote.template === 'asiri'
            ? renderAsiriTemplate(quote)
            : await renderJamtechTemplate(quote, settings)

    const pdfBlob = doc.output('blob')
    return { blob: pdfBlob, fileName: buildFileName(quote, formattedDate) }
}
