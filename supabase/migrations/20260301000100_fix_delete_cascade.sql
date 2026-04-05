-- Fix invoices -> clients cascade
ALTER TABLE public.invoices 
DROP CONSTRAINT IF EXISTS invoices_client_id_fkey,
ADD CONSTRAINT invoices_client_id_fkey 
  FOREIGN KEY (client_id) 
  REFERENCES public.clients(id) 
  ON DELETE CASCADE;

-- Fix logs -> invoices cascade
ALTER TABLE public.logs 
DROP CONSTRAINT IF EXISTS logs_invoice_id_fkey,
ADD CONSTRAINT logs_invoice_id_fkey 
  FOREIGN KEY (invoice_id) 
  REFERENCES public.invoices(id) 
  ON DELETE CASCADE;
