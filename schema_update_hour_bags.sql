-- =============================================
-- Schema Update: Hour Bags & Sub-Client System
-- =============================================

-- 1. Add parent_client_id, billing_modality, and hour_bag_price to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS parent_client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_modality text CHECK (billing_modality IN ('standard', 'hour_bag')) DEFAULT 'standard' NOT NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS hour_bag_price numeric DEFAULT NULL;

-- 2. Add hours field to logs for time tracking
ALTER TABLE logs ADD COLUMN IF NOT EXISTS hours numeric DEFAULT NULL;

-- 3. Add 'packaged' status option to logs
-- First drop the old constraint, then add a new one that includes 'packaged'
ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_status_check;
ALTER TABLE logs ADD CONSTRAINT logs_status_check CHECK (status IN ('pending', 'billed', 'packaged'));
