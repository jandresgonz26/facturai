-- ============================================================
--  FacturAI · Catálogo de servicios
--  Mis paquetes mensuales, los servicios adicionales (fuera de los paquetes, como referencia) y la
--  política de cambios. Se pueden elegir al armar una cotización o una propuesta (opcional).
--  Pega y ejecuta esto en el SQL Editor de Supabase. Se puede ejecutar más de una vez.
-- ============================================================

create table if not exists facturai.servicios (
    id          uuid primary key default gen_random_uuid(),
    clave       text unique,                      -- para la carga inicial (no se repite al volver a ejecutar)
    tipo        text not null check (tipo in ('paquete', 'adicional', 'politica')),
    nombre      text not null,
    precio      numeric check (precio is null or precio >= 0),
    precio_max  numeric check (precio_max is null or precio_max >= 0),   -- con precio: rango «200–350 €»
    unidad      text not null default 'mes' check (unidad in ('mes', 'unico', 'hora', 'porcentaje', 'ninguna')),
    moneda      text not null default 'EUR' check (moneda in ('USD', 'EUR')),
    resumen     text,
    incluye     jsonb not null default '[]'::jsonb,
    no_incluye  jsonb not null default '[]'::jsonb,
    orden       integer not null default 0,
    activo      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists servicios_tipo_idx on facturai.servicios (tipo, orden);

alter table facturai.servicios enable row level security;
drop policy if exists servicios_auth on facturai.servicios;
create policy servicios_auth on facturai.servicios for all to authenticated using (true) with check (true);
grant select, insert, update, delete on facturai.servicios to authenticated, service_role;

-- ── Carga inicial ────────────────────────────────────────────────────────────
insert into facturai.servicios (clave, tipo, nombre, precio, precio_max, unidad, resumen, incluye, no_incluye, orden) values
('web-care-basico', 'paquete', 'Web Care Básico', 55, null, 'mes',
 'Mantenimiento técnico esencial. Para webs WordPress sencillas, de un solo idioma, que necesitan estar sanas y seguras sin una estrategia SEO activa.',
 '["Actualización mensual de plugins, tema y core de WordPress", "Copia de seguridad mensual completa (archivos + base de datos)", "Análisis básico de seguridad: detección de malware y revisión de accesos", "Verificación de que el sitio carga correctamente y sin errores críticos", "Reporte técnico mensual con semáforo de estado (verde / atención / urgente)", "1 hora incluida para cambios menores", "Soporte por Slack o email"]'::jsonb,
 '["Optimización SEO", "Creación de páginas nuevas", "Desarrollo de funcionalidades"]'::jsonb, 1),

('web-care-avanzado', 'paquete', 'Web Care Avanzado', 95, null, 'mes',
 'Mantenimiento técnico ampliado. Para webs extensas, con muchas secciones o en más de un idioma, que requieren más horas de revisión e intervención.',
 '["Todo lo del Web Care Básico", "Revisión técnica para webs multiidioma (hreflang, versiones por idioma, conflictos de indexación)", "2 horas incluidas para cambios menores", "Soporte por Slack o email"]'::jsonb,
 '["Optimización SEO", "Creación de páginas nuevas", "Desarrollo de funcionalidades"]'::jsonb, 2),

('seo-geo-growth', 'paquete', 'SEO + GEO Growth', 230, null, 'mes',
 'Optimización SEO/GEO mensual. Para webs medianas con objetivo de posicionamiento activo en Google y visibilidad creciente en ChatGPT y Gemini.',
 '["Todo lo del Web Care Básico", "Análisis mensual de Search Console y GA4 con dashboard en Looker Studio", "Optimización on-page de hasta 2 páginas al mes (title, meta, H1/H2, texto, alt)", "Keyword research trimestral: validación y actualización del mapa de keywords", "Recomendación mensual de 1 artículo de blog con keyword validada y brief de contenido", "Sección GEO básica en el reporte: visibilidad en ChatGPT y Gemini con 5-10 prompts", "Reporte mensual en PDF con métricas, estado técnico, acciones y próximos pasos", "3 horas incluidas para cambios", "Soporte por Slack o email"]'::jsonb,
 '["Seguimiento de posiciones de keywords objetivo", "Creación de páginas nuevas", "Desarrollo de funcionalidades"]'::jsonb, 3),

('seo-geo-premium', 'paquete', 'SEO + GEO Premium', 360, null, 'mes',
 'Estrategia avanzada SEO/GEO. Para webs extensas, multiidioma o multidominio, con objetivos agresivos de crecimiento o presencia en más de un mercado.',
 '["Todo lo del SEO + GEO Growth", "Optimización on-page de hasta 5 páginas al mes", "Keyword research mensual", "Recomendación de 2 artículos de blog al mes", "Auditoría técnica profunda trimestral", "Seguimiento de posiciones de keywords objetivo con histórico y comparativa de competidores", "Sección GEO completa: 15+ prompts, ranking de competidores en IA y estrategia de mejora", "4 horas incluidas para cambios", "Soporte prioritario por Slack o email"]'::jsonb,
 '[]'::jsonb, 4),

('auditoria-seo-entrada', 'adicional', 'Auditoría SEO de entrada', 200, 350, 'unico',
 'Análisis completo del estado SEO al inicio de la relación: Search Console, sitemap, keywords, indexación, velocidad y on-page. Entregable: informe PDF con prioridades.', '[]'::jsonb, '[]'::jsonb, 11),
('keyword-research-completo', 'adicional', 'Keyword research completo', 100, 180, 'unico',
 'Investigación de keywords para un dominio o sección. Entregable: Excel con keywords recomendadas, sin volumen, propuesta de blog y keywords por página.', '[]'::jsonb, '[]'::jsonb, 12),
('auditoria-tecnica-profunda', 'adicional', 'Auditoría técnica profunda', 80, 150, 'unico',
 'Páginas bloqueadas, errores 404, thin content, velocidad y duplicidades. Entregable: informe priorizado.', '[]'::jsonb, '[]'::jsonb, 13),
('looker-studio', 'adicional', 'Configuración Looker Studio', 60, 100, 'unico',
 'Dashboard de Search Console + GA4 personalizado para el cliente, con comparativa mensual automatizada.', '[]'::jsonb, '[]'::jsonb, 14),
('on-page-extra', 'adicional', 'Optimización on-page extra', 40, 50, 'hora',
 'Horas adicionales de optimización de páginas fuera de las incluidas en el paquete.', '[]'::jsonb, '[]'::jsonb, 15),
('consultoria-seo-geo', 'adicional', 'Consultoría SEO/GEO puntual', 40, 50, 'hora',
 'Sesión de asesoría sobre estrategia, problemas técnicos o decisiones SEO concretas.', '[]'::jsonb, '[]'::jsonb, 16),
('dominio-adicional', 'adicional', 'Gestión de dominio adicional', 30, 60, 'porcentaje',
 'Para clientes con más de 2 dominios: incremento sobre el precio del paquete según la complejidad.', '[]'::jsonb, '[]'::jsonb, 17),
('geo-profundo', 'adicional', 'Análisis GEO profundo puntual', 80, 120, 'unico',
 'Visibilidad de la marca en ChatGPT y Gemini con 20+ prompts, comparativa con competidores y recomendaciones.', '[]'::jsonb, '[]'::jsonb, 18),

('politica-cambios', 'politica', 'Política de cambios y horas extras', null, null, 'ninguna',
 'Qué entra como cambio menor incluido en las horas del paquete y qué se presupuesta aparte.',
 '["Corrección o actualización de texto en páginas existentes", "Sustitución de imágenes en páginas existentes", "Cambio de enlaces, botones o CTAs", "Ajustes de formato visual simples (color de un botón, tamaño de fuente)", "Actualización de información de contacto, horarios o precios"]'::jsonb,
 '["Creación de páginas nuevas", "Rediseño de secciones o módulos", "Integración de plugins nuevos o funcionalidades", "Cambios en la estructura de navegación o menú", "Landing pages o páginas de campaña", "Traducciones o versiones en otro idioma"]'::jsonb, 30)
on conflict (clave) do nothing;
