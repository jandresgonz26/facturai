-- Create clients table
create table clients (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create logs table
create table logs (
  id uuid default gen_random_uuid() primary key,
  description text not null,
  client_id uuid references clients(id) on delete cascade not null,
  value numeric, -- Can be money or time, stored as number
  status text check (status in ('pending', 'billed')) default 'pending' not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table clients enable row level security;
alter table logs enable row level security;

-- Create policies (allow all for now, can be restricted later)
create policy "Enable read access for all users" on clients for select using (true);
create policy "Enable insert access for all users" on clients for insert with check (true);
create policy "Enable update access for all users" on clients for update using (true);
create policy "Enable delete access for all users" on clients for delete using (true);

create policy "Enable read access for all users" on logs for select using (true);
create policy "Enable insert access for all users" on logs for insert with check (true);
create policy "Enable update access for all users" on logs for update using (true);
create policy "Enable delete access for all users" on logs for delete using (true);
