-- Add paid_at column to invoices table
alter table invoices add column paid_at timestamp with time zone;
