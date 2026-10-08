ALTER TABLE contractor
ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE customer
ADD COLUMN is_deleted boolean DEFAULT false NOT NULL;

ALTER TABLE leads
ADD COLUMN message TEXT;

ALTER TABLE builder
ADD COLUMN license_number VARCHAR(100),
ADD COLUMN abn_number VARCHAR(100),
ADD COLUMN phone_number VARCHAR(20);

ALTER TABLE builder
ALTER COLUMN logo SET DEFAULT 'https://cdn.dribbble.com/userupload/5245642/file/original-430a2e28de5df4e1932405b3a9f783e7.png?resize=752x&vertical=center';

ALTER TABLE leads
ADD COLUMN builder_id UUID,
ADD CONSTRAINT fk_leads_builder
  FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE;

ALTER TABLE contractor ADD COLUMN service_id UUID;

UPDATE contractor
SET service_id = (
  SELECT service_id FROM service WHERE service = 'Color Painting' LIMIT 1
);

ALTER TABLE contractor ALTER COLUMN service_id SET NOT NULL;

ALTER TABLE contractor
ADD CONSTRAINT fk_contractor_service
FOREIGN KEY (service_id) REFERENCES service(service_id)
ON DELETE CASCADE;

CREATE TYPE lead_decision_enum AS ENUM ('WON', 'LOST');

ALTER TABLE leads 
ADD COLUMN decision lead_decision_enum DEFAULT NULL;

ALTER TABLE floor_plan
ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE facade
ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE range
ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE dwelling_type
ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE range
ADD COLUMN builder_id UUID,
ADD CONSTRAINT fk_range_builder
  FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE;

ALTER TABLE dwelling_type
ADD COLUMN builder_id UUID,
ADD CONSTRAINT fk_dwelling_type_builder
  FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE;

ALTER TABLE facade
ADD COLUMN cost NUMERIC(12,2) DEFAULT 0;

ALTER TABLE quotation
ADD COLUMN slug_id VARCHAR(255) NOT NULL DEFAULT 'DDQ0000';

ALTER TABLE leads
ADD COLUMN slug_id VARCHAR(255) NOT NULL DEFAULT 'DDL0000';

ALTER TABLE service
ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO lead_source (name) VALUES 
('ADMIN_PANEL'),
('WEBSITE'),
('INSTAGRAM'),
('FACEBOOK'),
('YOUTUBE'),
('LINKEDIN'),
('TWITTER'),
('TIKTOK'),
('WHATSAPP'),
('EMAIL_CAMPAIGN'),
('GOOGLE_ADS'),
('FACEBOOK_ADS'),
('INSTAGRAM_ADS'),
('YOUTUBE_ADS'),
('LINKEDIN_ADS'),
('REFERRAL'),
('PHONE_CALL'),
('TRADE_SHOW'),
('PARTNER'),
('OTHER');

ALTER TABLE lead_source
ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE leads
DROP COLUMN lead_source_id;

ALTER TABLE leads
ADD COLUMN lead_source_id UUID NULL,
ADD CONSTRAINT fk_leads_lead_source FOREIGN KEY (lead_source_id) REFERENCES lead_source (lead_source_id) ON DELETE SET NULL;

ALTER TABLE quotation_version_items
ADD COLUMN category_item_quantity INT DEFAULT NULL;

ALTER TABLE quotation_versions 
ADD COLUMN floor_plan_id UUID,
ADD COLUMN facade_id UUID,
ADD COLUMN package_id UUID,
ADD COLUMN range_id UUID,
ADD COLUMN dwelling_type_id UUID;

ALTER TABLE quotation_versions 
ADD CONSTRAINT fk_quotation_versions_floor_plan 
  FOREIGN KEY (floor_plan_id) REFERENCES floor_plan(floor_plan_id) ON DELETE CASCADE,
ADD CONSTRAINT fk_quotation_versions_facade 
  FOREIGN KEY (facade_id) REFERENCES facade(facade_id) ON DELETE CASCADE,
ADD CONSTRAINT fk_quotation_versions_package 
  FOREIGN KEY (package_id) REFERENCES packages(package_id) ON DELETE CASCADE,
ADD CONSTRAINT fk_quotation_versions_range 
  FOREIGN KEY (range_id) REFERENCES range(range_id) ON DELETE CASCADE,
ADD CONSTRAINT fk_quotation_versions_dwelling_type 
  FOREIGN KEY (dwelling_type_id) REFERENCES dwelling_type(dwelling_type_id) ON DELETE CASCADE;

ALTER TABLE quotation
DROP CONSTRAINT quotation_floor_plan_id_fkey,
DROP CONSTRAINT quotation_facade_id_fkey,
DROP CONSTRAINT quotation_package_id_fkey,
DROP CONSTRAINT quotation_range_id_fkey,
DROP CONSTRAINT quotation_dwelling_type_id_fkey;

ALTER TABLE quotation 
DROP COLUMN floor_plan_id,
DROP COLUMN facade_id,
DROP COLUMN package_id,
DROP COLUMN range_id,
DROP COLUMN dwelling_type_id;

ALTER TABLE packages 
ADD COLUMN range_id UUID,
ADD COLUMN dwelling_type_id UUID;

ALTER TABLE packages 
ADD CONSTRAINT fk_packages_range 
  FOREIGN KEY (range_id) REFERENCES range(range_id) ON DELETE CASCADE,
ADD CONSTRAINT fk_packages_dwelling_type 
  FOREIGN KEY (dwelling_type_id) REFERENCES dwelling_type(dwelling_type_id) ON DELETE CASCADE;

ALTER TABLE contractor DROP CONSTRAINT contractor_email_key;

ALTER TABLE categories
  ADD COLUMN builder_id UUID NOT NULL,
  ADD COLUMN admin_category_id UUID DEFAULT NULL,
  ADD COLUMN is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN display_order INT NOT NULL;

ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_name_key;

ALTER TABLE categories
  ADD CONSTRAINT categories_builder_id_fkey FOREIGN KEY (builder_id)
    REFERENCES builder(builder_id) ON DELETE CASCADE,
  ADD CONSTRAINT categories_admin_category_id_fkey FOREIGN KEY (admin_category_id)
    REFERENCES admin_categories(admin_category_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION seed_builder_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO categories (builder_id, admin_category_id, name, description, display_order)
  SELECT 
    NEW.builder_id,
    ac.admin_category_id,
    ac.name,
    ac.description,
    ROW_NUMBER() OVER (ORDER BY ac.created_at)
  FROM admin_category ac;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_builder_insert
AFTER INSERT ON builder
FOR EACH ROW
EXECUTE FUNCTION seed_builder_categories();

ALTER TABLE leads
ADD COLUMN quotation_version_id UUID DEFAULT NULL,
ADD CONSTRAINT fk_leads_quotation_version FOREIGN KEY (quotation_version_id) REFERENCES quotation_versions(quotation_version_id) ON DELETE SET NULL;

ALTER TABLE task
  ADD COLUMN IF NOT EXISTS is_workflow_process_task BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS workflow_process_id UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS workflow_process_task_id UUID DEFAULT NULL;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'task_workflow_process_id_fkey'
  ) THEN
    ALTER TABLE task ADD CONSTRAINT task_workflow_process_id_fkey 
      FOREIGN KEY (workflow_process_id) REFERENCES workflow_process(workflow_process_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'task_workflow_process_task_id_fkey'
  ) THEN
    ALTER TABLE task ADD CONSTRAINT task_workflow_process_task_id_fkey 
      FOREIGN KEY (workflow_process_task_id) REFERENCES workflow_process_task(workflow_process_task_id) ON DELETE SET NULL;
  END IF;
END$$;
