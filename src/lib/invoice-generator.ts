import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, AlignmentType, WidthType, BorderStyle, HeadingLevel, ImageRun, ShadingType, Header } from 'docx'
// file-saver not used — Data URI approach preserves filename in async contexts
import { Invoice, Log, Client } from '@/types'
import { getCompanySettings } from './settings'

export const generateInvoiceDoc = async (invoice: Invoice, items: Log[], client: Client): Promise<{ base64: string; fileName: string }> => {
    // Fetch company settings
    const settings = await getCompanySettings()
    const companyName = settings?.company_name || 'JAMTech C.A.'
    const companyRif = settings?.rif || 'J-40505911-0'
    const companyPhone = settings?.phone || '+58(424)922-5108'
    const companyEmail = settings?.email || 'hello@jamtechcorp.com'

    // Fetch header image (fixed from public folder)
    let headerData: ArrayBuffer | null = null
    try {
        const response = await fetch('/invoice-header.png')
        if (response.ok) {
            headerData = await response.arrayBuffer()
        }
    } catch (e) {
        console.error("Could not load header", e)
    }

    // Format date to DD/MM/YYYY
    const formatDate = (dateString: string) => {
        if (!dateString) return ''
        const [year, month, day] = dateString.split('-')
        return `${day}/${month}/${year}`
    }

    const formattedDate = formatDate(invoice.issue_date)

    const tableHeaderShading = { fill: "F0F0F0", type: ShadingType.CLEAR, color: "auto" }
    const cellMargin = { top: 100, bottom: 100, left: 100, right: 100 }

    const tableRows = [
        new TableRow({
            children: [
                new TableCell({ children: [new Paragraph({ text: "No.", style: "TableHeader" })], width: { size: 10, type: WidthType.PERCENTAGE }, shading: tableHeaderShading, margins: cellMargin }),
                new TableCell({ children: [new Paragraph({ text: "PRODUCTO / SERVICIO", style: "TableHeader" })], width: { size: 30, type: WidthType.PERCENTAGE }, shading: tableHeaderShading, margins: cellMargin }),
                new TableCell({ children: [new Paragraph({ text: "DESCRIPCIÓN", style: "TableHeader" })], width: { size: 30, type: WidthType.PERCENTAGE }, shading: tableHeaderShading, margins: cellMargin }),
                new TableCell({ children: [new Paragraph({ text: "P. UNIT.", style: "TableHeader" })], width: { size: 10, type: WidthType.PERCENTAGE }, shading: tableHeaderShading, margins: cellMargin }),
                new TableCell({ children: [new Paragraph({ text: "CANT", style: "TableHeader" })], width: { size: 10, type: WidthType.PERCENTAGE }, shading: tableHeaderShading, margins: cellMargin }),
                new TableCell({ children: [new Paragraph({ text: "IMPORTE", style: "TableHeader" })], width: { size: 10, type: WidthType.PERCENTAGE }, shading: tableHeaderShading, margins: cellMargin }),
            ],
        }),
        ...items.map((item, index) => (
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ text: (index + 1).toString(), alignment: AlignmentType.CENTER })], margins: cellMargin }),
                    new TableCell({ children: [new Paragraph({ text: item.service_categories?.name || "Servicio Profesional" })], margins: cellMargin }),
                    new TableCell({ children: [new Paragraph({ text: item.description })], margins: cellMargin }),
                    new TableCell({ children: [new Paragraph({ text: (item.value || 0).toFixed(2), alignment: AlignmentType.RIGHT })], margins: cellMargin }),
                    new TableCell({ children: [new Paragraph({ text: "1", alignment: AlignmentType.CENTER })], margins: cellMargin }),
                    new TableCell({ children: [new Paragraph({ text: (item.value || 0).toFixed(2), alignment: AlignmentType.RIGHT })], margins: cellMargin }),
                ],
            })
        )),
    ]

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: {
                        font: "Arial",
                    },
                },
            },
            paragraphStyles: [
                {
                    id: "TableHeader",
                    name: "Table Header",
                    basedOn: "Normal",
                    next: "Normal",
                    run: {
                        bold: true,
                        size: 20, // 10pt
                        font: "Arial",
                    },
                    paragraph: {
                        alignment: AlignmentType.CENTER,
                    },
                },
            ],
        },
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: 720, // 0.5 inch
                            right: 720,
                            bottom: 720,
                            left: 720,
                            header: 0,
                        },
                    },
                },
                headers: {
                    default: new Header({
                        children: [
                            new Paragraph({
                                children: [
                                    headerData ? new ImageRun({
                                        data: new Uint8Array(headerData),
                                        transformation: {
                                            width: 800,
                                            height: 200,
                                        },
                                        floating: {
                                            horizontalPosition: {
                                                offset: 0,
                                            },
                                            verticalPosition: {
                                                offset: 0,
                                            },
                                            wrap: {
                                                type: 3, // Behind text
                                            },
                                        },
                                    } as any) : new TextRun({
                                        text: "",
                                    }),
                                ],
                            }),
                        ],
                    }),
                },
                children: [

                    // Invoice Title and Info
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: {
                            top: { style: BorderStyle.NONE },
                            bottom: { style: BorderStyle.NONE },
                            left: { style: BorderStyle.NONE },
                            right: { style: BorderStyle.NONE },
                            insideVertical: { style: BorderStyle.NONE },
                            insideHorizontal: { style: BorderStyle.NONE },
                        },
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({
                                        children: [
                                            new Paragraph({
                                                children: [
                                                    new TextRun({
                                                        text: "FACTURA",
                                                        bold: true,
                                                        size: 64, // 32pt
                                                        color: "2F5496", // Corporate Blue
                                                    })
                                                ],
                                                spacing: { after: 200 },
                                            }),
                                            new Paragraph({
                                                children: [
                                                    new TextRun({ text: "STATUS: ", bold: true }),
                                                    new TextRun({
                                                        text: invoice.status === 'paid' ? "PAGADA" : "POR PAGAR",
                                                        color: invoice.status === 'paid' ? "008000" : "FF0000",
                                                        bold: true
                                                    }),
                                                ],
                                            }),
                                            invoice.status === 'paid' && invoice.paid_at ? new Paragraph({
                                                children: [
                                                    new TextRun({
                                                        text: `Fecha de pago: ${new Date(invoice.paid_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
                                                        size: 16, // 8pt
                                                    }),
                                                ],
                                            }) : new Paragraph({ text: "" }),
                                        ],
                                    }),
                                    new TableCell({
                                        children: [
                                            new Paragraph({ text: `Factura No.: ${invoice.invoice_number}`, alignment: AlignmentType.RIGHT }),
                                            new Paragraph({ text: `Fecha: ${formattedDate}`, alignment: AlignmentType.RIGHT }),
                                            new Paragraph({ text: "Pagar antes de: ", alignment: AlignmentType.RIGHT }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),

                    new Paragraph({ text: "" }), // Spacer

                    // Client Info
                    new Paragraph({
                        children: [new TextRun({ text: "Para:", bold: true })],
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: client.name, bold: true })],
                    }),
                    client.contact_name ? new Paragraph({ text: client.contact_name }) : new Paragraph({ text: "" }),
                    client.tax_id ? new Paragraph({ text: client.tax_id }) : new Paragraph({ text: "" }),
                    client.billing_address ? new Paragraph({ text: client.billing_address }) : new Paragraph({ text: "" }),
                    (client.city || client.postal_code) ? new Paragraph({
                        text: `${client.city || ''}${client.city && client.postal_code ? ', ' : ''}${client.postal_code || ''}`
                    }) : new Paragraph({ text: "" }),
                    new Paragraph({ text: "", spacing: { after: 400 } }),

                    // Items Table
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: tableRows,
                    }),

                    new Paragraph({ text: "", spacing: { after: 200 } }),

                    // Totals
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: {
                            top: { style: BorderStyle.NONE },
                            bottom: { style: BorderStyle.NONE },
                            left: { style: BorderStyle.NONE },
                            right: { style: BorderStyle.NONE },
                            insideVertical: { style: BorderStyle.NONE },
                            insideHorizontal: { style: BorderStyle.NONE },
                        },
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({ children: [], width: { size: 70, type: WidthType.PERCENTAGE } }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Subtotal", bold: true })], alignment: AlignmentType.RIGHT })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: invoice.total_amount.toFixed(2), bold: true })], alignment: AlignmentType.RIGHT })] }),
                                ]
                            }),
                            new TableRow({
                                children: [
                                    new TableCell({ children: [], width: { size: 70, type: WidthType.PERCENTAGE } }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Total", bold: true })], alignment: AlignmentType.RIGHT })] }),
                                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `$${invoice.total_amount.toFixed(2)}`, bold: true })], alignment: AlignmentType.RIGHT })] }),
                                ]
                            })
                        ]
                    }),

                    new Paragraph({ text: "", spacing: { after: 800 } }),

                    // Footer
                    new Paragraph({
                        children: [
                            new TextRun({ text: companyName, bold: true }),
                        ],
                        alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({
                        text: `Rif: ${companyRif}`,
                        alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({
                        text: companyPhone,
                        alignment: AlignmentType.CENTER,
                    }),
                    new Paragraph({
                        text: companyEmail,
                        alignment: AlignmentType.CENTER,
                    }),
                ],
            },
        ],
    })

    const base64String = await Packer.toBase64String(doc)
    const clientName = client.name.replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `Factura_${invoice.invoice_number}_${clientName}_${formattedDate.replace(/\//g, '-')}.docx`

    return { base64: base64String, fileName }
}
