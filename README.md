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

1. Copia `.env.example` a `.env.local` y rellena las variables. Las claves de IA viven solo en el servidor.
2. Ejecuta en el SQL Editor de Supabase los esquemas en orden (`schema.sql` y los `schema_update_*.sql`). Para el asistente es necesario **`schema_update_agent.sql`** (trazabilidad de servicios fijos por periodo y fecha de vencimiento en facturas) y para la meta mensual del dashboard **`schema_update_dashboard.sql`**. La app funciona sin esas migraciones, pero con ellas la carga de fijos es idempotente de forma fiable y la meta es configurable en Ajustes.
3. `npm install` y `npm run dev`.

Variables de entorno:

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Base de datos (navegador, con sesión) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor. La usan Telegram, el cron y el bridge de Spark, que corren sin usuario |
| `SUPABASE_DB_URL` | Conexión directa a Postgres para migraciones (`npm run migrate`) y `scripts/create-user.mjs` |
| `ANTHROPIC_API_KEY` | Asistente (Claude). Es el proveedor principal desde octubre de 2026 |
| `ANTHROPIC_WORKSPACE_ID` | Solo si la clave es de usuario (`sk-ant-usr-…`): ID del workspace de la consola de Anthropic |
| `ANTHROPIC_MODEL` | Modelo del chat (por defecto `claude-opus-5-5`) |
| `ANTHROPIC_MODEL_RUTINAS` | Modelo de las rutinas automáticas y borradores (por defecto `claude-sonnet-5-5`) |
| `ANTHROPIC_EFFORT` | Esfuerzo de razonamiento: `low`, `medium` (por defecto) o `high` |
| `BREVO_API_KEY` | Listas y campañas de Brevo para el departamento de Marketing (la misma clave que usa la web) |
| `SEO_API_TOKEN` | Llave de la API de solo lectura de la plataforma SEO para el departamento de SEO (el mismo valor que `EXTERNAL_API_TOKEN` allá) |
| `SEO_API_URL` | Opcional. Dirección de la plataforma SEO; por defecto `https://seoagency.jamtech.cloud` |
| `SUPABASE_DB_SCHEMA` | Esquema donde viven las tablas (por defecto `facturai`) |
| `OPENAI_API_KEY` | Transcripción del micrófono; también sirve de respaldo del asistente si falta la clave de Anthropic |
| `OPENAI_MODEL` | Modelo de respaldo con OpenAI (por defecto `gpt-5.4-mini`) |
| `OPENAI_TRANSCRIBE_MODEL` | Modelo de transcripción del micrófono (por defecto `gpt-4o-mini-transcribe`) |
| `AGENT_APPROVAL_SECRET` | Opcional. Firma HMAC de las confirmaciones del asistente |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_IDS` | Bot de Telegram (opcional) |
| `APP_BASE_URL` | URL pública de la app; el servidor la usa para cargar la cabecera de los PDF enviados por Telegram o correo |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TEST_TO`, `EMAIL_BCC` | Correos a clientes (ver sección) |

## Asistente

Se abre desde la barra superior, con `⌘K` / `Ctrl+K`, o con el botón flotante en móvil. Ejemplos:

- «Factúrale el mes a Asiri y agrégale soporte extra por 100 euros»
- «Registra 2 horas de soporte a Arco Iris»
- «¿Quién me debe dinero?» · «¿Cuánto facturé en agosto?»
- «Marca pagada la factura 0542»
- «¿Qué se le cobró a Total Envíos en mayo?» (detalle de ítems)
- «Cotízale a X una landing por 800 y mantenimiento por 100» (crea la cotización y ofrece el PDF)
- «¿Qué tengo pendiente hoy?» (briefing: vencidas, fijos sin cargar, trabajo sin facturar, bolsas casi llenas)

Antes de registrar un servicio que suene recurrente (SEO, mantenimiento…), el asistente revisa cómo se describió antes para ese cliente y reutiliza la misma redacción cambiando el mes; si ya existe un pendiente igual, avisa en vez de duplicar. Si mencionas una categoría que no existe, pregunta si quieres crearla.

Reglas: las lecturas se ejecutan solas; **toda escritura muestra una tarjeta de confirmación** con el desglose (para facturar, con fijos por cargar, pendientes, ítems nuevos y total proyectado) y no toca la base de datos hasta que pulsas Confirmar. Los ítems dictados son puntuales por defecto. El micrófono graba al tocarlo, transcribe en el servidor y deja el texto editable en la caja.

## Bot de Telegram (sin n8n)

El bot usa el mismo asistente, las mismas herramientas y las mismas confirmaciones que el chat web, directamente contra la app.

1. Crea el bot en Telegram con **@BotFather** (`/newbot`) y copia el token.
2. Ejecuta `schema_update_telegram.sql` en Supabase (guarda la conversación por chat).
3. En el servidor añade `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (una cadena aleatoria larga), `APP_BASE_URL` (URL pública de la app) y despliega.
4. Registra el webhook: `node scripts/telegram-setup.mjs https://tu-dominio.com`.
5. Escríbele al bot: te responderá tu **chat id**. Ponlo en `TELEGRAM_ALLOWED_CHAT_IDS` y redespliega. Nadie más podrá usarlo.

Desde Telegram puedes escribir o mandar **notas de voz**. Toda escritura llega como una tarjeta con botones **Confirmar / Cancelar**; nada se guarda hasta que confirmas. Al facturar o cotizar, el bot te manda el **PDF** al chat. Comandos: `/pendiente`, `/nuevo`, `/ayuda`.

## Correos a clientes (Resend)

Factura, cotización y agradecimiento de pago se envían desde la app con el PDF adjunto, siempre como JAM Tech. Nunca es automático: desde Facturas/Cotizaciones (botón de sobre) o por el asistente, ves la vista previa exacta (destinatario, asunto, cuerpo, adjunto) y confirmas. Cada envío queda en `email_log` y se muestra en la tarjeta ("Enviada el… a…", "Agradecimiento el…"); si repites, avisa que ya se envió. Enviar la factura la pasa a "Enviada".

1. Crea una cuenta en [resend.com](https://resend.com), verifica el dominio `jamtech.cloud` (SPF y DKIM, dos registros DNS) y crea una API key.
2. Ejecuta `schema_update_crm.sql` en Supabase (crea `email_log`, notas, etapas; retira el aviso a n8n al marcar pagada).
3. En el servidor: `RESEND_API_KEY`, `EMAIL_FROM` (remitente del dominio verificado) y, las primeras semanas, `EMAIL_TEST_TO=tu@correo` para que TODO se desvíe a ti. Opcional `EMAIL_BCC` para copia oculta de cada envío.

## CRM

Un lead es un cliente en etapa temprana: misma ficha, mismos datos. Etapas: **Lead → Cotizado → Cliente activo → Inactivo**. Cotizar a un nombre nuevo crea el lead solo; cotizar a un lead lo pasa a Cotizado; su primera factura lo pasa a Activo. Pantalla **Pipeline** (tablero, arrastrar para mover), pestaña **Actividad** en la ficha (etapa, próxima acción con fecha, notas, historial de cotizaciones/facturas/pagos/correos). El briefing y la campana avisan de próximas acciones vencidas, leads sin seguimiento (7 días) y cotizaciones sin respuesta (15 días). Por chat: «crea un lead para X», «anota que…», «recuérdame llamar a Y el lunes», «¿qué leads tengo?».

## Pantallas

- **Dashboard**: "Qué toca hoy" (alertas accionables, también en la campana de la cabecera), registro rápido, bolsas de horas, actividad. "Facturado este mes" suma las facturas emitidas en el mes por fecha de emisión, con cobrado y por cobrar, contra una meta configurable en Ajustes.
- **Clientes**: lista con búsqueda, subclientes anidados y pendientes por cliente; ficha lateral para crear/editar con pestaña de servicios fijos (pausar, eliminar).
- **Facturación**: asistente paso a paso: cliente → servicios fijos que faltan → ítems del mes (agregar, quitar, actualizar tasa EUR) → revisar y emitir (número, fecha, vencimiento) → descargar PDF/DOCX.
- **Facturas**: filtros por cliente, estado y mes; estados borrador/enviada/pagada; fecha de vencimiento (sale en el documento como "Pagar antes de" y marca la factura como vencida).

Arquitectura: `src/lib/actions/` contiene la lógica de negocio validada (zod) que comparten los botones de la interfaz y las herramientas del asistente; `src/lib/agent/` define las herramientas y el prompt; `src/app/api/agent` y `src/app/api/transcribe` son las rutas de servidor; `src/components/agent/` es el panel de chat.

## Base de datos compartida con la web (octubre de 2026)

FacturAI ya no tiene proyecto propio de Supabase: vive en el proyecto de la web de JAM Tech (`dibumwvpkyuqkiplgqtj`), dentro de su propio esquema **`facturai`**. Las tablas de la web siguen en `public` y no se tocan.

- El cliente de Supabase (`src/lib/supabase.ts`) apunta al esquema con `db: { schema: 'facturai' }`; `scripts/run-sql.mjs` y `scripts/spark-sync.mjs` también.
- La clave pública (`anon`) **no** tiene acceso al esquema; solo los usuarios con sesión y el servidor (service role).
- Se inicia sesión con el mismo usuario del panel de la web.
- `scripts/exportar-db.mjs` saca una copia completa (estructura + datos) a `migracion/`, que está fuera de Git. `scripts/diagnostico-db.mjs` mide la base.
- El puente web → CRM vive en la base (`supabase/facturai-sync.sql` del repo de la web): cada lead del regalo de Jami entra como lead con nota y tarea de seguimiento, y cada pedido pagado de la oferta de WhatsApp entra como cliente activo con su ítem por facturar y la tarea de agendar.

## Oficina JAM (equipo de IA por departamentos)

El asistente es la cara visible de cinco departamentos: 📋 Operaciones, 🤝 Ventas, 💸 Finanzas, 📣 Marketing y 🔎 SEO (`src/lib/agent/shared.ts`). Cada herramienta pertenece a uno; su uso queda registrado en `agent_events` (`schema_update_oficina.sql`) y se ve en **/oficina**, una oficina en 3D (three.js) donde cada personaje trabaja, descansa o levanta la mano cuando espera una confirmación. Tocar a un personaje abre el chat con ese departamento.

- **Chat** (web y Telegram): Claude con todas las herramientas; cada escritura sigue pasando por la tarjeta de confirmación.
- **Marketing** (`src/lib/agent/tools-marketing.ts`): listas y campañas de Brevo, leads de la web y `redactar_boletin`, que investiga en la web y devuelve un borrador de "Aprende con Jami" con sus reglas editoriales.
- **SEO** (`src/lib/agent/tools-seo.ts`): `seo_cartera` y `seo_cliente` leen la plataforma SEO (repo `plataforma-seo`, en seoagency.jamtech.cloud) por su API de solo lectura `/api/externo/*` con `SEO_API_TOKEN`. Los datos SEO siguen viviendo en la base SQLite de esa plataforma; aquí no se copian. Con la rutina de SEO (`?dep=seo`, lunes 9:30) la Oficina también pide el **resumen en video** de cada cliente (la plataforma reutiliza el de la semana) y manda los enlaces por Telegram.
- **Rutinas automáticas** (`src/lib/agent/rutinas.ts`): `POST /api/cron/oficina` con `x-cron-secret` hace que cada departamento revise su área con herramientas de solo lectura y mande un informe corto por Telegram (`?dep=ventas` para uno solo, `?dry_run=1` para verlo sin enviarlo). El informe queda en la sesión de Telegram, así que se puede responder "hazlo" y el asistente sabe de qué se trata. Sugerencia de horarios en Dokploy: Finanzas y Ventas a las 8:00 de lunes a viernes, Operaciones a las 7:30 todos los días, Marketing los lunes a las 9:00, SEO los lunes a las 9:30.
