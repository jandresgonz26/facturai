-- Add category column to logs table
alter table logs add column category text;

-- Set default category for existing records
update logs set category = 'Servicio Profesional' where category is null;

-- Make category not null with default
alter table logs alter column category set default 'Servicio Profesional';
alter table logs alter column category set not null;
