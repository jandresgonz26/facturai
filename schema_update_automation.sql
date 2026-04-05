-- Add preferred_input_currency to clients table
alter table clients add column preferred_input_currency text default 'USD' check (preferred_input_currency in ('USD', 'EUR'));

-- Create recurring_services table
create table recurring_services (
    id uuid default gen_random_uuid() primary key,
    client_id uuid references clients(id) on delete cascade,
    description text not null,
    amount numeric(10, 2) not null,
    is_active boolean default true,
    created_at timestamp with time zone default now()
);

-- Enable RLS
alter table recurring_services enable row level security;

-- Create policies
create policy "Allow all for authenticated users on recurring_services"
on recurring_services for all
using (true)
with check (true);
