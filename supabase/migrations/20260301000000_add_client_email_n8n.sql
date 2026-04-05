CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS email text;

CREATE OR REPLACE FUNCTION notify_paid_invoice()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status != 'paid' THEN
    PERFORM net.http_post(
      url := 'https://n8n.jamtech.cloud/webhook/invoice-paid',
      body := json_build_object(
        'invoice_id', NEW.id,
        'invoice_number', NEW.invoice_number,
        'total_amount', NEW.total_amount,
        'client_id', NEW.client_id
      )::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_invoice_paid ON public.invoices;
CREATE TRIGGER on_invoice_paid
AFTER UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION notify_paid_invoice();
