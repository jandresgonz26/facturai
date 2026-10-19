/** Respuesta HTTP con el PDF: descarga con nombre legible (o en línea, para verlo en el navegador). */
export function respuestaPdf({ bytes, nombre }: { bytes: Buffer; nombre: string }, enLinea = false): Response {
    const ascii = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_')
    return new Response(new Uint8Array(bytes), {
        headers: {
            'content-type': 'application/pdf',
            'content-disposition': `${enLinea ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
            'cache-control': 'private, no-store',
        },
    })
}
