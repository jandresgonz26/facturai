import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Invoice, Log, Client } from '@/types'
import { getCompanySettings } from './settings'
import { loadHeaderImage } from './pdf-assets'

export const generateInvoicePdf = async (
    invoice: Invoice,
    items: Log[],
    client: Client
): Promise<{ blob: Blob; fileName: string }> => {
    const settings = await getCompanySettings()
    const companyName = settings?.company_name || 'JAMTech C.A.'
    const companyRif = settings?.rif || 'J-40505911-0'
    const companyPhone = settings?.phone || '+58(424)922-5108'
    const companyEmail = settings?.email || 'info@jamtech.cloud'

    const formatDate = (dateString: string) => {
        if (!dateString) return ''
        const [year, month, day] = dateString.split('-')
        return `${day}/${month}/${year}`
    }

    const formattedDate = formatDate(invoice.issue_date)

    const doc = new jsPDF('p', 'mm', 'a4')
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 15

    // ── Header Image ── (funciona en navegador y en servidor)
    let headerHeight = 0
    const header = await loadHeaderImage()
    if (header) {
        headerHeight = (pageWidth * header.height) / header.width
        doc.addImage(header.dataUrl, 'PNG', 0, 0, pageWidth, headerHeight)
    }

    // Start content below the header with spacing matching the DOCX
    let y = headerHeight + 12

    // ── FACTURA Title ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(32)
    doc.setTextColor(47, 84, 150) // Corporate Blue
    doc.text('FACTURA', margin, y)

    // ── Invoice Number & Date (right-aligned) ──
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(0, 0, 0)
    doc.text(`Factura No.: ${invoice.invoice_number}`, pageWidth - margin, y - 8, { align: 'right' })
    doc.text(`Fecha: ${formattedDate}`, pageWidth - margin, y - 3, { align: 'right' })
    doc.text(`Pagar antes de: ${invoice.due_date ? invoice.due_date.split('-').reverse().join('/') : ''}`, pageWidth - margin, y + 2, { align: 'right' })

    y += 10

    // ── Status ──
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('STATUS: ', margin, y)
    const statusWidth = doc.getTextWidth('STATUS: ')
    if (invoice.status === 'paid') {
        doc.setTextColor(0, 128, 0)
        doc.text('PAGADA', margin + statusWidth, y)
    } else {
        doc.setTextColor(255, 0, 0)
        doc.text('POR PAGAR', margin + statusWidth, y)
    }
    doc.setTextColor(0, 0, 0)

    if (invoice.status === 'paid' && invoice.paid_at) {
        y += 5
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.text(
            `Fecha de pago: ${new Date(invoice.paid_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
            margin,
            y
        )
    }

    y += 10

    // ── Client Info ──
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Para:', margin, y)
    y += 5
    doc.text(client.name, margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    if (client.contact_name) {
        doc.text(client.contact_name, margin, y)
        y += 5
    }
    if (client.tax_id) {
        doc.text(client.tax_id, margin, y)
        y += 5
    }
    if (client.billing_address) {
        doc.text(client.billing_address, margin, y)
        y += 5
    }
    if (client.city || client.postal_code) {
        doc.text(
            `${client.city || ''}${client.city && client.postal_code ? ', ' : ''}${client.postal_code || ''}`,
            margin,
            y
        )
        y += 5
    }

    y += 5

    // ── Items Table ──
    const tableBody = items.map((item, index) => [
        (index + 1).toString(),
        item.service_categories?.name || 'Servicio Profesional',
        item.description,
        (item.value || 0).toFixed(2),
        '1',
        (item.value || 0).toFixed(2),
    ])

    autoTable(doc, {
        startY: y,
        head: [['No.', 'PRODUCTO / SERVICIO', 'DESCRIPCIÓN', 'P. UNIT.', 'CANT', 'IMPORTE']],
        body: tableBody,
        margin: { left: margin, right: margin },
        styles: {
            font: 'helvetica',
            fontSize: 9,
            cellPadding: 3,
            lineColor: [0, 0, 0],
            lineWidth: 0.1,
        },
        headStyles: {
            fillColor: [240, 240, 240], // F0F0F0
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle',
        },
        columnStyles: {
            0: { halign: 'center', cellWidth: 18 }, // 10%
            1: { cellWidth: 54 }, // 30%
            2: { cellWidth: 54 }, // 30%
            3: { halign: 'right', cellWidth: 18 }, // 10%
            4: { halign: 'center', cellWidth: 18 }, // 10%
            5: { halign: 'right', cellWidth: 18 }, // 10%
        },
        theme: 'grid',
    })

    // Get Y position after table
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

    // ── Totals ──
    const totalsX = pageWidth - margin - 25 // Align perfectly with the IMPORTE column
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Subtotal', totalsX, y, { align: 'right' })
    doc.text(invoice.total_amount.toFixed(2), pageWidth - margin, y, { align: 'right' })

    y += 5
    doc.setFontSize(10)
    doc.text('Total', totalsX, y, { align: 'right' })
    doc.text(`$${invoice.total_amount.toFixed(2)}`, pageWidth - margin, y, { align: 'right' })

    // ── Condiciones de pago (por cliente) ──
    if (client.payment_terms) {
        y += 10
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.text('Condiciones de pago:', margin, y)
        y += 4.5
        doc.setFont('helvetica', 'normal')
        const termsLines = doc.splitTextToSize(client.payment_terms, pageWidth - margin * 2)
        doc.text(termsLines, margin, y)
        y += termsLines.length * 4.5
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
    const clientName = client.name.replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `Factura_${invoice.invoice_number}_${clientName}_${formattedDate.replace(/\//g, '-')}.pdf`

    return { blob: pdfBlob, fileName }
}
