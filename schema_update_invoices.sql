-- Create invoices table
create table invoices (
  id uuid default gen_random_uuid() primary key,
  invoice_number text not null unique,
  client_id uuid references clients(id) not null,
  issue_date date not null,
  total_amount numeric not null,
  status text check (status in ('draft', 'sent', 'paid')) default 'draft' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Add invoice_id to logs
alter table logs add column invoice_id uuid references invoices(id);

-- Enable RLS for invoices
alter table invoices enable row level security;

-- Create policies for invoices
create policy "Enable read access for all users" on invoices for select using (true);
create policy "Enable insert access for all users" on invoices for insert with check (true);
create policy "Enable update access for all users" on invoices for update using (true);
create policy "Enable delete access for all users" on invoices for delete using (true);
