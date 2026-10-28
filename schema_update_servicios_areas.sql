-- ============================================================
--  FacturAI · Catálogo por áreas y categorías
--  Área (Marketing digital, Desarrollo web, Diseño gráfico…) → Categoría (las mismas de facturación) → Servicio.
--  · Las categorías de facturación existentes NO se renombran (su nombre sale en las facturas): solo se les
--    asigna un área por su nombre. Las que no encajen quedan «Sin área» y se mueven desde /servicios.
--  · «Servicios adicionales» desaparece: cada servicio tiene su forma de cobro y los paquetes van destacados.
--  · La política de cambios pasa a ser la nota (condiciones) de la categoría de mantenimiento.
--  Requiere schema_update_servicios.sql. Pega y ejecuta en el SQL Editor de Supabase (se puede repetir).
-- ============================================================

create table if not exists facturai.service_areas (
    id         uuid primary key default gen_random_uuid(),
    nombre     text not null unique,
    color      text not null default '#0d9488',
    orden      integer not null default 0,
    created_at timestamptz not null default now()
);
alter table facturai.service_areas enable row level security;
drop policy if exists service_areas_auth on facturai.service_areas;
create policy service_areas_auth on facturai.service_areas for all to authenticated using (true) with check (true);
grant select, insert, update, delete on facturai.service_areas to authenticated, service_role;

alter table facturai.service_categories add column if not exists area_id uuid references facturai.service_areas(id) on delete set null;
alter table facturai.service_categories add column if not exists nota text;
alter table facturai.service_categories add column if not exists orden integer not null default 0;

alter table facturai.servicios add column if not exists category_id uuid references facturai.service_categories(id) on delete set null;
alter table facturai.servicios add column if not exists destacado boolean not null default false;

insert into facturai.service_areas (nombre, color, orden) values
    ('Marketing digital', '#7c3aed', 1),
    ('Desarrollo web', '#0d9488', 2),
    ('Diseño gráfico', '#db2777', 3)
on conflict (nombre) do nothing;

-- Áreas de las categorías existentes, por su nombre (diseño antes que desarrollo: «Diseño web» es desarrollo).
update facturai.service_categories set area_id = (select id from facturai.service_areas where nombre = 'Diseño gráfico')
where area_id is null and name not ilike '%web%'
  and name ilike any (array['%diseño%', '%diseno%', '%logo%', '%brand%', '%gráfic%', '%grafic%', '%identidad%', '%ilustra%', '%imagen corporativa%']);
update facturai.service_categories set area_id = (select id from facturai.service_areas where nombre = 'Marketing digital')
where area_id is null
  and name ilike any (array['%seo%', '%geo%', '%ads%', '%google%', '%meta%', '%facebook%', '%instagram%', '%redes%', '%social%', '%email%', '%mail%', '%marketing%', '%contenido%', '%campa%', '%publicidad%', '%posicionamiento%']);
update facturai.service_categories set area_id = (select id from facturai.service_areas where nombre = 'Desarrollo web')
where area_id is null
  and name ilike any (array['%web%', '%desarrollo%', '%mantenimiento%', '%hosting%', '%dominio%', '%app%', '%wordpress%', '%software%', '%programa%', '%tienda%', '%ecommerce%']);

-- Categorías que necesita el catálogo actual (solo si no existe ya una parecida).
insert into facturai.service_categories (name, area_id)
select 'Mantenimiento web', (select id from facturai.service_areas where nombre = 'Desarrollo web')
where not exists (select 1 from facturai.service_categories where name ilike '%mantenimiento%');
insert into facturai.service_categories (name, area_id)
select 'SEO y GEO', (select id from facturai.service_areas where nombre = 'Marketing digital')
where not exists (select 1 from facturai.service_categories where name ilike '%seo%');

-- El catálogo actual a su categoría; los paquetes, destacados.
update facturai.servicios set category_id = (select id from facturai.service_categories where name ilike '%mantenimiento%' order by created_at limit 1)
where category_id is null and clave in ('web-care-basico', 'web-care-avanzado', 'dominio-adicional');
update facturai.servicios set category_id = (select id from facturai.service_categories where name ilike '%seo%' order by created_at limit 1)
where category_id is null and clave in ('seo-geo-growth', 'seo-geo-premium', 'auditoria-seo-entrada', 'keyword-research-completo', 'auditoria-tecnica-profunda', 'looker-studio', 'on-page-extra', 'consultoria-seo-geo', 'geo-profundo');
update facturai.servicios set destacado = true where tipo = 'paquete';

-- La política de cambios, como condiciones de la categoría de mantenimiento.
update facturai.service_categories set nota = E'Cuenta como cambio menor (entra en las horas del paquete):\n- Corrección o actualización de texto en páginas existentes\n- Sustitución de imágenes en páginas existentes\n- Cambio de enlaces, botones o CTAs\n- Ajustes de formato visual simples (color de un botón, tamaño de fuente)\n- Actualización de información de contacto, horarios o precios\n\nSe presupuesta aparte:\n- Creación de páginas nuevas\n- Rediseño de secciones o módulos\n- Integración de plugins nuevos o funcionalidades\n- Cambios en la estructura de navegación o menú\n- Landing pages o páginas de campaña\n- Traducciones o versiones en otro idioma'
where id = (select id from facturai.service_categories where name ilike '%mantenimiento%' order by created_at limit 1) and nota is null;
update facturai.servicios set activo = false where clave = 'politica-cambios';
