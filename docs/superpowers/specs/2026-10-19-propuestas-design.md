# Propuestas comerciales

**Problema:** José escribe propuestas largas (alcance, explicación, precios) fuera de FacturAI, las manda por correo o WhatsApp y pierde el hilo de qué envió a quién.

**Solución:** módulo «Propuestas» en FacturAI. Cada propuesta se escribe en un editor tipo Notion con la plantilla de JAM Tech, se comparte con un enlace y queda ligada a la ficha del cliente con su historial.

## Decisiones (acordadas con José el 19 oct 2026)

| Tema | Decisión |
|---|---|
| Entrega | Enlace web (`/propuesta/<token>`) con botón «Descargar PDF» |
| Edición | Editor tipo Notion (BlockNote 0.55) con plantilla de JAM Tech; las guías en gris se borran al hacer clic |
| Cliente | Lee, elige y acepta con su nombre, o pide cambios con un comentario |
| Precios | Tabla de inversión flexible y conectada con la facturación (ver abajo) |
| IA | «Redactar con IA» desde notas, más «Reescribir selección» |

## Tabla de inversión (`src/lib/propuestas/precios.ts`)

- **Opciones (paquetes):** una o varias, con una «Recomendada». El cliente elige una al aceptar.
- **Ítems:** cantidad × precio con unidad («20 horas × $25»), frecuencia (pago único, mensual, trimestral, semestral o anual), descuento por ítem en % o en monto con precio anterior tachado, «incluido sin costo» y «a convenir».
- **Extras:** opcionales que el cliente marca y que se suman a su total.
- **Ajustes:** descuento general (sobre el pago único, lo recurrente o ambos; un monto fijo se reparte en proporción) e impuesto opcional.
- **Plan de pagos:** reparte el pago único en cuotas. La última cuota absorbe el redondeo para que la suma cuadre al céntimo.
- **Cálculo único:** el mismo cálculo sirve para el editor, la página del cliente, el PDF y la aceptación. El servidor recalcula al aceptar y nunca confía en el navegador.

## Ciclo de vida

| Estado | Qué ocurre |
|---|---|
| `draft` | Borrador. El enlace no funciona todavía. |
| `sent` | Al copiar el enlace o enviarlo por WhatsApp. El lead pasa a «cotizado». |
| `viewed` | El cliente abre el enlace. Llega aviso por Telegram la primera vez o tras más de 3 días; solo cuenta si el navegador ejecuta JavaScript y nunca con la sesión de José. |
| `changes_requested` | El cliente deja un comentario. Llega por Telegram con el texto. |
| `accepted` | Se congela la copia exacta (`accepted_snapshot`) con nombre, opción, extras y totales. El cliente pasa a «activo». |
| `rejected` | Lo marca José a mano. |

Una propuesta aceptada puede **reabrirse**; la aceptación anterior queda en `proposal_events`.

## Facturación

- **Crear la factura:** desde el panel, con cuotas si hay plan de pagos o con el pago único detallado (líneas de descuento e impuesto incluidas). Se crea como borrador.
- **Crear servicios fijos:** convierte lo recurrente en servicios fijos con el descuento y el impuesto ya prorrateados.

## Piezas

| Pieza | Ubicación |
|---|---|
| Datos | `schema_update_propuestas.sql`: tablas `proposals` y `proposal_events`, bucket público `propuestas` (solo PNG y JPG) |
| Lógica | `src/lib/propuestas/`: `datos.ts` (servidor), `precios.ts`, `bloques.ts`, `tipos.ts`, `ia.ts`, `pdf.tsx` (@react-pdf/renderer con fuentes Outfit e Inter incrustadas) |
| Panel | `/propuestas` (lista), `/propuestas/[id]` (editor y panel lateral), `/propuestas/[id]/vista` (vista previa) |
| Público | `/propuesta/[token]` (página y `opengraph-image`) y `/api/propuesta/[token]/{vista,aceptar,cambios,pdf}`. Están en `PUBLIC_PREFIXES` de `proxy.ts` y van sin el armazón de la app. |
| Ficha del cliente | `PropuestasCliente`, dentro de `ClientActivityPanel` |

## Fuera de esta versión

- Plantillas guardadas aparte (duplicar una propuesta cumple esa función).
- Firma dibujada.
- Herramienta de agente para pedir propuestas desde Telegram.
