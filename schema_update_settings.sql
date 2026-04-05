-- Create company_settings table
create table company_settings (
  id uuid default gen_random_uuid() primary key,
  company_name text not null default 'JAMTech C.A.',
  rif text not null default 'J-40505911-0',
  phone text not null default '+58(424)922-5108',
  email text not null default 'hello@jamtechcorp.com',
  logo_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Insert default settings
insert into company_settings (company_name, rif, phone, email)
values ('JAMTech C.A.', 'J-40505911-0', '+58(424)922-5108', 'hello@jamtechcorp.com');

-- Enable RLS for company_settings
alter table company_settings enable row level security;

-- Create policies for company_settings
create policy "Enable read access for all users" on company_settings for select using (true);
create policy "Enable update access for all users" on company_settings for update using (true);

-- Note: Create a storage bucket called 'logos' in Supabase Storage UI
-- Make it public so we can access the images directly
