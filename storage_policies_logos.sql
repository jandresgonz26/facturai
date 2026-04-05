-- Storage policies for logos bucket

-- Allow public uploads to logos bucket
create policy "Allow public uploads to logos bucket"
on storage.objects for insert
with check (bucket_id = 'logos');

-- Allow public reads from logos bucket
create policy "Allow public reads from logos bucket"
on storage.objects for select
using (bucket_id = 'logos');

-- Allow public updates to logos bucket
create policy "Allow public updates to logos bucket"
on storage.objects for update
using (bucket_id = 'logos');

-- Allow public deletes from logos bucket  
create policy "Allow public deletes from logos bucket"
on storage.objects for delete
using (bucket_id = 'logos');
