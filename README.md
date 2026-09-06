This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# FacturAI

Facturación para JAMTech: registro de actividades, servicios fijos mensuales, bolsas de horas, facturas (PDF/DOCX) y cotizaciones. Incluye un **asistente por chat y voz** que ejecuta los flujos repetitivos.

## Configuración

1. Copia `.env.example` a `.env.local` y rellena las variables. La clave de OpenAI vive solo en el servidor.
2. Ejecuta en el SQL Editor de Supabase los esquemas en orden (`schema.sql` y los `schema_update_*.sql`). Para el asistente es necesario **`schema_update_agent.sql`** (trazabilidad de servicios fijos por periodo y fecha de vencimiento en facturas). La app funciona sin esa migración, pero con ella la carga de fijos es idempotente de forma fiable.
3. `npm install` y `npm run dev`.

Variables de entorno:

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Base de datos |
| `OPENAI_API_KEY` | Asistente y transcripción (solo servidor) |
| `OPENAI_MODEL` | Modelo de chat con llamadas a funciones (por defecto `gpt-5.4-mini`) |
| `OPENAI_TRANSCRIBE_MODEL` | Modelo de transcripción del micrófono (por defecto `gpt-4o-mini-transcribe`) |
| `AGENT_APPROVAL_SECRET` | Opcional. Firma HMAC de las confirmaciones del asistente |

## Asistente

Se abre desde la barra superior, con `⌘K` / `Ctrl+K`, o con el botón flotante en móvil. Ejemplos:

- «Factúrale el mes a Asiri y agrégale soporte extra por 100 euros»
- «Registra 2 horas de soporte a Arco Iris»
- «¿Quién me debe dinero?» · «¿Cuánto facturé en agosto?»
- «Marca pagada la factura 0542»

Reglas: las lecturas se ejecutan solas; **toda escritura muestra una tarjeta de confirmación** con el desglose (para facturar, con fijos por cargar, pendientes, ítems nuevos y total proyectado) y no toca la base de datos hasta que pulsas Confirmar. Los ítems dictados son puntuales por defecto. El micrófono graba al tocarlo, transcribe en el servidor y deja el texto editable en la caja.

Arquitectura: `src/lib/actions/` contiene la lógica de negocio validada (zod) que comparten los botones de la interfaz y las herramientas del asistente; `src/lib/agent/` define las herramientas y el prompt; `src/app/api/agent` y `src/app/api/transcribe` son las rutas de servidor; `src/components/agent/` es el panel de chat.
