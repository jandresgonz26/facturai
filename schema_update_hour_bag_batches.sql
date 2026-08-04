-- =============================================
-- Schema Update: Persist Hour Bag Batches
-- =============================================
-- Previously, "packaged" logs had no record of *which* packaging action
-- grouped them together. The history view reconstructed groups after the
-- fact by sorting all packaged logs by created_at and chunking every 10h,
-- which mixed logs from different packaging events whenever their
-- created_at dates interleaved. This adds a stable batch identifier and
-- the real packaging timestamp so each "bolsa" stays exactly as it was
-- when the user packaged it.

ALTER TABLE logs ADD COLUMN IF NOT EXISTS packaged_batch_id uuid DEFAULT NULL;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS packaged_at timestamptz DEFAULT NULL;
