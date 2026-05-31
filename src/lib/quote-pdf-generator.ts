import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Quote } from '@/types'
import { getCompanySettings } from './settings'

export const generateQuotePdf = async (
    quote: Quote
): Promise<{ blob: Blob; fileName: string }> => {
    const settings = await getCompanySettings()
    // The company name is the one typed in the quote (fallback to settings)
    const companyName = quote.company_name || settings?.company_name || 'JAMTech C.A.'
    const companyRif = settings?.rif || 'J-40505911-0'
    const companyPhone = settings?.phone || '+58(424)922-5108'
    const companyEmail = settings?.email || 'hello@jamtechcorp.com'

    const isHours = quote.quote_type === 'hours'
    const currencySymbol = quote.currency === 'EUR' ? '€' : '$'

    const formatDate = (dateString: string) => {
        if (!dateString) return ''
        const [year, month, day] = dateString.split('-')
        return `${day}/${month}/${year}`
    }

    const formattedDate = formatDate(quote.issue_date)

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
            // Get real image dimensions to preserve aspect ratio
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

    // Start content below the header
    let y = headerHeight + 12

    // ── COTIZACIÓN Title ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(32)
    doc.setTextColor(47, 84, 150) // Corporate Blue
    doc.text('COTIZACIÓN', margin, y)

    // ── Quote Number & Date (right-aligned) ──
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    doc.text(`Cotización No.: ${quote.quote_number}`, pageWidth - margin, y - 8, { align: 'right' })
    doc.text(`Fecha: ${formattedDate}`, pageWidth - margin, y - 3, { align: 'right' })

    y += 12

    // ── Client Info ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Para:', margin, y)
    y += 5
    doc.text(quote.client_name, margin, y)

    y += 10

    // ── Items Table ──
    const baseStyles = {
        font: 'helvetica',
        fontSize: 9,
        cellPadding: 3,
        lineColor: [0, 0, 0] as [number, number, number],
        lineWidth: 0.1,
    }
    const headStyles = {
        fillColor: [240, 240, 240] as [number, number, number], // F0F0F0
        textColor: [0, 0, 0] as [number, number, number],
        fontStyle: 'bold' as const,
        halign: 'center' as const,
        valign: 'middle' as const,
    }

    if (isHours) {
        // Hours-only quote: No prices, just hours per task
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
            styles: baseStyles,
            headStyles,
            columnStyles: {
                0: { halign: 'center', cellWidth: 18 },
                1: { cellWidth: 60 },
                2: { cellWidth: 72 },
                3: { halign: 'center', cellWidth: 30 },
            },
            theme: 'grid',
        })

        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

        // ── Total Hours ──
        const totalsX = pageWidth - margin - 30
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text('Total horas', totalsX, y, { align: 'right' })
        doc.text(`${quote.total_hours} h`, pageWidth - margin, y, { align: 'right' })
    } else {
        // Amount quote: prices and money total
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
            styles: baseStyles,
            headStyles,
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

        // ── Totals ──
        const totalsX = pageWidth - margin - 25 // Align with the IMPORTE column
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

    // ── Generate ──
    const pdfBlob = doc.output('blob')
    const clientName = (quote.client_name || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `Cotizacion_${quote.quote_number}_${clientName}_${formattedDate.replace(/\//g, '-')}.pdf`

    return { blob: pdfBlob, fileName }
}
