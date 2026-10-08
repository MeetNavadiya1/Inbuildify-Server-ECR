-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CREATE TABLE country (
--   country_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   name VARCHAR(100) NOT NULL UNIQUE,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
--   updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
-- );

-- CREATE TABLE state (
--   state_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   name VARCHAR(100) NOT NULL,
--   country_id UUID NOT NULL,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
--   updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
--   CONSTRAINT fk_country FOREIGN KEY (country_id) REFERENCES country(country_id) ON DELETE CASCADE,
--   CONSTRAINT unique_state_per_country UNIQUE (country_id, name)
-- );

-- CREATE TABLE builder (
--   builder_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   name VARCHAR(100) NOT NULL,
--   email VARCHAR(100) UNIQUE NOT NULL,
--   logo VARCHAR(500) DEFAULT 'https://cdn.dribbble.com/userupload/5245642/file/original-430a2e28de5df4e1932405b3a9f783e7.png?resize=752x&vertical=center',
--   slogan VARCHAR(500),
--   firm_name VARCHAR(250),
--   license_number VARCHAR(100),
--   abn_number VARCHAR(100),
--   phone_number VARCHAR(20),
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- CREATE TYPE users_role_enum AS ENUM ('super_admin', 'admin', 'project_owner', 'service_provider', 'client');

-- CREATE TABLE users (
--   users_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL,
--   name VARCHAR(100) NOT NULL,
--   email VARCHAR(100) UNIQUE NOT NULL,
--   password VARCHAR(255) NOT NULL,
--   is_verified BOOLEAN DEFAULT FALSE,
--   is_deleted BOOLEAN DEFAULT FALSE,
--   role users_role_enum[] NOT NULL,
--   root_user BOOLEAN DEFAULT FALSE,
--   otp VARCHAR(10),
--   expires_at TIMESTAMP,
--   reset_password_token VARCHAR(255),
--   reset_token_expires_at TIMESTAMP,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE
-- );

-- CREATE TABLE users_token (
--   users_token_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   user_id UUID NOT NULL,
--   access_token TEXT NOT NULL,
--   refresh_token TEXT NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (user_id) REFERENCES users(users_id) ON DELETE CASCADE
-- );

-- CREATE TABLE service (
--   service_id UUID DEFAULT uuid_generate_v4() NOT NULL,
--   service VARCHAR(100) NOT NULL,
--   builder_id UUID DEFAULT NULL,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   CONSTRAINT service_pkey PRIMARY KEY (service_id),
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE SET NULL
-- );

-- CREATE TABLE contractor (
--   contractor_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   name VARCHAR(100) NOT NULL,
--   email VARCHAR(100) NOT NULL,
--   builder_id UUID NOT NULL,
--   phone VARCHAR(15),
--   address TEXT,
--   service_id UUID NOT NULL,
--   is_deleted BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (service_id) REFERENCES service(service_id) ON DELETE CASCADE
-- );

-- CREATE TABLE customer (
-- 	customer_id uuid DEFAULT uuid_generate_v4() NOT NULL,
-- 	name varchar(100) NOT NULL,
-- 	email varchar(100) NOT NULL,
-- 	builder_id uuid NOT NULL,
-- 	phone varchar(15) NULL,
-- 	address text NULL,
-- 	is_deleted boolean DEFAULT false NOT NULL,
-- 	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
-- 	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
-- 	CONSTRAINT customer_email_key UNIQUE (email),
-- 	CONSTRAINT customer_pkey PRIMARY KEY (customer_id),
-- 	CONSTRAINT customer_builder_id_fkey FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE
-- );

-- CREATE TABLE invites (
--   invite_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   email VARCHAR(255) NOT NULL,
--   invite_token TEXT NOT NULL UNIQUE,
--   builder_id UUID NOT NULL,
--   role users_role_enum NOT NULL,
--   expires_at TIMESTAMP NOT NULL,
--   invited_at TIMESTAMP DEFAULT NOW(),
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE
-- );

-- CREATE TABLE status_logs (
--   status_log_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   request_id UUID NOT NULL,
--   status_code INT NOT NULL,
--   error TEXT,
--   method VARCHAR(10),
--   url VARCHAR(255),
--   request_body TEXT,
--   response TEXT,
--   timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- CREATE TYPE lead_status_enum AS ENUM ('NEW', 'IN_PROGRESS', 'JOB', 'CONSTRUCTION', 'COMPLETED', 'CANCELLED');

-- CREATE TYPE lead_decision_enum AS ENUM ('WON', 'LOST');

-- CREATE TABLE lead_source (
--   lead_source_id UUID DEFAULT uuid_generate_v4() NOT NULL,
--   name VARCHAR(100) NOT NULL,
--   builder_id UUID DEFAULT NULL,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   CONSTRAINT lead_source_pkey PRIMARY KEY (lead_source_id),
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE SET NULL
-- );

-- CREATE TABLE leads (
--   lead_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   slug_id VARCHAR(255) NOT NULL DEFAULT 'DDL0000',
--   builder_id UUID NOT NULL,
--   lead_contact_id UUID DEFAULT NULL,
--   status lead_status_enum DEFAULT 'NEW' NOT NULL,
--   lead_source_id UUID NOT NULL,
--   notes TEXT,
--   message TEXT,
--   decision lead_decision_enum DEFAULT NULL,
--   quotation_version_id UUID DEFAULT NULL,
--   assignee_id UUID NOT NULL,
--   created_by_id UUID NOT NULL,
--   updated_by_id UUID NOT NULL,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (assignee_id) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (lead_source_id) REFERENCES lead_source(lead_source_id) ON DELETE SET NULL,
--   FOREIGN KEY (created_by_id) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (updated_by_id) REFERENCES users(users_id) ON DELETE SET NULL
-- );

-- CREATE TABLE leads_contact (
--   leads_contact_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   lead_id UUID NOT NULL,
--   country_id UUID DEFAULT NULL,
--   state_id UUID DEFAULT NULL,
--   name VARCHAR(100) NOT NULL,
--   email VARCHAR(150) DEFAULT NULL,
--   phone VARCHAR(20) DEFAULT NULL,
--   secondary_phone VARCHAR(20),
--   address1 TEXT,
--   address2 TEXT,
--   city VARCHAR(100),
--   zip VARCHAR(20),
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE,
--   FOREIGN KEY (country_id) REFERENCES country(country_id) ON DELETE CASCADE,
--   FOREIGN KEY (state_id) REFERENCES state(state_id) ON DELETE CASCADE
-- );

-- ALTER TABLE leads

--   ADD CONSTRAINT fk_lead_contact FOREIGN KEY (lead_contact_id)

--   REFERENCES leads_contact(leads_contact_id) ON DELETE SET NULL;

-- CREATE TABLE range (
--   range_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL,
--   name VARCHAR(50) NOT NULL UNIQUE,
--   is_deleted BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE
-- );

-- CREATE TABLE dwelling_type (
--   dwelling_type_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL,
--   name VARCHAR(50) NOT NULL UNIQUE,
--   is_deleted BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE
-- );

-- CREATE TABLE floor_plan (
--   floor_plan_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL,
--   name VARCHAR(100) NOT NULL,
--   image VARCHAR(500),
--   range_id UUID NOT NULL,
--   dwelling_type_id UUID NOT NULL,
--   beds INTEGER DEFAULT 0,
--   bath INTEGER DEFAULT 0,
--   car_park INTEGER DEFAULT 0,
--   width_meter DECIMAL(8,2) DEFAULT 0,
--   depth_meter DECIMAL(8,2) DEFAULT 0,
--   dwelling INTEGER DEFAULT 0,
--   garage INTEGER DEFAULT 0,
--   porch INTEGER DEFAULT 0,
--   alfresco INTEGER DEFAULT 0,
--   total_sqft DECIMAL(10,2) DEFAULT 0,
--   is_deleted BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  
--   CONSTRAINT fk_floor_plan_builder FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   CONSTRAINT fk_floor_plan_range FOREIGN KEY (range_id) REFERENCES range(range_id) ON DELETE CASCADE,
--   CONSTRAINT fk_floor_plan_dwelling_type FOREIGN KEY (dwelling_type_id) REFERENCES dwelling_type(dwelling_type_id) ON DELETE CASCADE
-- );  

-- CREATE TABLE facade (
--   facade_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL,
--   name VARCHAR(100) NOT NULL,
--   image VARCHAR(500),
--   dwelling_type_id UUID NOT NULL,
--   standard BOOLEAN DEFAULT FALSE,
--   upgrade BOOLEAN DEFAULT FALSE,
--   cost NUMERIC(12,2) DEFAULT 0,
--   is_deleted BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   CONSTRAINT fk_facade_builder FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   CONSTRAINT fk_facade_dwelling_type FOREIGN KEY (dwelling_type_id) REFERENCES dwelling_type(dwelling_type_id) ON DELETE CASCADE
-- );

-- CREATE TYPE cost_type AS ENUM ('INCLUDED', 'FIXED', 'VARIABLE');

-- CREATE TYPE cost_option AS ENUM ('NONE', 'TBA', 'TBC');

-- CREATE TYPE item_status AS ENUM ('ACTIVE', 'INACTIVE');

-- CREATE TABLE conditions (
--   condition_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   name VARCHAR(100) NOT NULL UNIQUE,
--   description TEXT,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- CREATE TABLE IF NOT EXISTS admin_category (
--   admin_category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   name VARCHAR(100) UNIQUE NOT NULL,
--   description TEXT,
--   created_at TIMESTAMP DEFAULT now(),
--   updated_at TIMESTAMP DEFAULT now()
-- );

-- CREATE TABLE categories (
--   category_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   builder_id UUID NOT NULL,
--   admin_category_id UUID DEFAULT NULL,
--   name VARCHAR(100) NOT NULL,
--   description TEXT,
--   display_order INT NOT NULL,
--   is_deleted BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT now(),
--   updated_at TIMESTAMP DEFAULT now(),
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (admin_category_id) REFERENCES admin_category(admin_category_id) ON DELETE CASCADE
-- );

-- CREATE TABLE category_items (
--   category_item_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL,
--   category_id UUID NOT NULL,
--   description TEXT NOT NULL,
--   short_description VARCHAR(500),
--   cost_type cost_type NOT NULL,
--   cost NUMERIC(12,2),
--   cost_type_text VARCHAR(255),
--   cost_option cost_option DEFAULT 'NONE',
--   include_by_default BOOLEAN DEFAULT FALSE,
--   show_in_hl_package BOOLEAN DEFAULT TRUE,
--   package_only BOOLEAN DEFAULT FALSE,
--   uom VARCHAR(50),
--   sort_order INT DEFAULT 0,
--   range_id UUID,
--   dwelling_type_id UUID,
--   status item_status DEFAULT 'ACTIVE',
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE CASCADE,
--   FOREIGN KEY (range_id) REFERENCES range(range_id) ON DELETE SET NULL,
--   FOREIGN KEY (dwelling_type_id) REFERENCES dwelling_type(dwelling_type_id) ON DELETE SET NULL
-- );

-- CREATE TABLE category_items_condition (
--   category_items_condition_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL,
--   category_item_id UUID NOT NULL,
--   condition_id UUID NOT NULL,
--   range_start NUMERIC(12,2),
--   range_end NUMERIC(12,2),
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (category_item_id) REFERENCES category_items(category_item_id) ON DELETE CASCADE,
--   FOREIGN KEY (condition_id) REFERENCES conditions(condition_id) ON DELETE CASCADE
-- );

-- CREATE TABLE packages (
--   package_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   name VARCHAR(255) NOT NULL,
--   builder_id UUID NOT NULL,
--   category_item_ids UUID[] NOT NULL,
--   amount NUMERIC(12,2) NOT NULL DEFAULT 0,
--   range_id UUID,
--   dwelling_type_id UUID,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (range_id) REFERENCES range(range_id) ON DELETE SET NULL,
--   FOREIGN KEY (dwelling_type_id) REFERENCES dwelling_type(dwelling_type_id) ON DELETE SET NULL
-- );

-- CREATE TYPE property_title_status AS ENUM ('ESTIMATED', 'ACTUAL');

-- CREATE TYPE property_compaction_report AS ENUM ('AVAILABLE', 'NOT_AVAILABLE');

-- CREATE TYPE property_land_type AS ENUM ('REGULAR', 'IRREGULAR');

-- CREATE TABLE property (
--   property_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL,
--   lead_id UUID NOT NULL,
--   country VARCHAR(100) NOT NULL,
--   address1 VARCHAR(255) NOT NULL,
--   address2 VARCHAR(255),
--   city_suburb VARCHAR(100) NOT NULL,
--   state_region VARCHAR(100) NOT NULL,
--   zip_postal_code VARCHAR(20) NOT NULL,
--   estate_name VARCHAR(150),
--   title_status property_title_status NOT NULL,
--   title_date DATE,
--   compaction_report property_compaction_report NOT NULL,
--   land_type property_land_type NOT NULL,
--   width_m NUMERIC(8,2),
--   depth_m NUMERIC(8,2),
--   total_size_m2 NUMERIC(12,2),
--   site_fall_mm NUMERIC(12,2),
--   land_fill_mm NUMERIC(12,2),
--   bush_fire BOOLEAN DEFAULT FALSE,
--   corner_block BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE
-- );

-- CREATE TABLE quotation (
--   quotation_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   slug_id VARCHAR(255) NOT NULL DEFAULT 'DDQ0000',
--   builder_id UUID NOT NULL,
--   lead_id UUID NOT NULL,
--   property_id UUID NOT NULL,
--   created_by_id UUID NOT NULL,
--   updated_by_id UUID NOT NULL,
--   is_deleted BOOLEAN DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE,
--   FOREIGN KEY (property_id) REFERENCES property(property_id) ON DELETE CASCADE,
--   FOREIGN KEY (created_by_id) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (updated_by_id) REFERENCES users(users_id) ON DELETE SET NULL
-- );

-- CREATE TABLE quotation_versions (
--   quotation_version_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   quotation_id UUID NOT NULL,
--   floor_plan_id UUID NOT NULL,
--   facade_id UUID NOT NULL,
--   package_id UUID NOT NULL,
--   range_id UUID NOT NULL,
--   dwelling_type_id UUID NOT NULL,
--   version_number INT NOT NULL,
--   notes TEXT,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (quotation_id) REFERENCES quotation(quotation_id) ON DELETE CASCADE,
--   FOREIGN KEY (floor_plan_id) REFERENCES floor_plan(floor_plan_id) ON DELETE CASCADE,
--   FOREIGN KEY (facade_id) REFERENCES facade(facade_id) ON DELETE CASCADE,
--   FOREIGN KEY (package_id) REFERENCES packages(package_id) ON DELETE CASCADE,
--   FOREIGN KEY (range_id) REFERENCES range(range_id) ON DELETE CASCADE,
--   FOREIGN KEY (dwelling_type_id) REFERENCES dwelling_type(dwelling_type_id) ON DELETE CASCADE,
--   UNIQUE (quotation_id, version_number)
-- );

-- CREATE TABLE quotation_version_items (
--   quotation_version_item_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   quotation_version_id UUID NOT NULL,
--   notes TEXT,
--   category_id UUID NOT NULL,
--   caterogy_name VARCHAR(100) NOT NULL,
--   category_description TEXT NOT NULL,
--   category_item_id UUID DEFAULT NULL,
--   category_item_description TEXT DEFAULT NULL,
--   category_item_short_description VARCHAR(500) DEFAULT NULL,
--   category_item_cost_type cost_type DEFAULT NULL,
--   category_item_cost NUMERIC(12,2) DEFAULT NULL,
--   category_item_quantity INT DEFAULT NULL,
--   category_item_cost_type_text VARCHAR(255) DEFAULT NULL,
--   category_item_cost_option cost_option DEFAULT NULL,
--   category_item_include_by_default BOOLEAN DEFAULT NULL,
--   category_item_show_in_hl_package BOOLEAN DEFAULT NULL,
--   category_item_package_only BOOLEAN DEFAULT NULL,
--   category_item_uom VARCHAR(50) DEFAULT NULL,
--   category_item_sort_order INT DEFAULT NULL,
--   category_item_range_id UUID DEFAULT NULL,
--   category_item_dwelling_type_id UUID DEFAULT NULL,
--   category_item_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   category_item_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (quotation_version_id) REFERENCES quotation_versions(quotation_version_id) ON DELETE CASCADE
-- );

-- ALTER TABLE leads

-- ADD CONSTRAINT fk_leads_quotation_version FOREIGN KEY (quotation_version_id) REFERENCES quotation_versions(quotation_version_id) ON DELETE SET NULL;

-- CREATE TYPE action_type_enum AS ENUM ('NOTES', 'SMS', 'APPOINTMENT', 'TASK');

-- CREATE TYPE task_priority_enum AS ENUM ('HIGH', 'LOW', 'MEDIUM');

-- CREATE TABLE actions (
--   action_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   type action_type_enum NOT NULL,
--   builder_id UUID NOT NULL,
--   lead_id UUID NOT NULL,
--   created_by_id UUID NOT NULL,
--   updated_by_id UUID NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE CASCADE,
--   FOREIGN KEY (created_by_id) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (updated_by_id) REFERENCES users(users_id) ON DELETE SET NULL
-- );

-- CREATE TABLE tags (
--   tag_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL,
--   name VARCHAR(100) NOT NULL,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   CONSTRAINT unique_builder_tag UNIQUE (builder_id, name),
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE
-- );

-- CREATE TABLE task (
--   task_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   action_id UUID NOT NULL,
--   name VARCHAR(200) NOT NULL,
--   due_date DATE NOT NULL,
--   time TIME DEFAULT CURRENT_TIME(6),
--   priority task_priority_enum NOT NULL DEFAULT 'MEDIUM',
--   description VARCHAR(500),
--   attachment TEXT,
--   assignee UUID DEFAULT NULL,
--   is_workflow_process_task BOOLEAN NOT NULL DEFAULT FALSE,
--   workflow_process_id UUID DEFAULT NULL,
--   workflow_process_task_id UUID DEFAULT NULL,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (assignee) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (action_id) REFERENCES actions(action_id) ON DELETE CASCADE
-- );

-- CREATE TABLE notes (
--   notes_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   action_id UUID NOT NULL,
--   message VARCHAR(500) NOT NULL,
--   tags UUID[] DEFAULT '{}',
--   attachment TEXT,
--   task_id UUID DEFAULT NULL,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (action_id) REFERENCES actions(action_id) ON DELETE CASCADE,
--   FOREIGN KEY (task_id) REFERENCES task(task_id) ON DELETE SET NULL
-- );

-- CREATE TABLE sms (
--   sms_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   action_id UUID NOT NULL,
--   recipient UUID[] NOT NULL,
--   message VARCHAR(500) NOT NULL,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (action_id) REFERENCES actions(action_id) ON DELETE CASCADE
-- );

-- CREATE TABLE appointment (
--   appointment_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   action_id UUID NOT NULL,
--   title VARCHAR(200) NOT NULL,
--   date DATE NOT NULL,
--   start_time TIME NOT NULL,
--   end_time TIME NOT NULL,
--   location VARCHAR(200),
--   select_users UUID[] DEFAULT '{}',
--   notes VARCHAR(500),
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (action_id) REFERENCES actions(action_id) ON DELETE CASCADE
-- );

-- CREATE TABLE workflow_process (
--   workflow_process_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL,
--   name VARCHAR(200) NOT NULL,
--   description TEXT,
--   display_order INT NOT NULL,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_by_id UUID NOT NULL,
--   updated_by_id UUID NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (created_by_id) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (updated_by_id) REFERENCES users(users_id) ON DELETE SET NULL
-- );

-- CREATE TABLE workflow_process_task (
--   workflow_process_task_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   workflow_process_id UUID NOT NULL,
--   name VARCHAR(200) NOT NULL,
--   description TEXT,
--   attachment TEXT,
--   timespent INT,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_by_id UUID NOT NULL,
--   updated_by_id UUID NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (workflow_process_id) REFERENCES workflow_process(workflow_process_id) ON DELETE CASCADE,
--   FOREIGN KEY (created_by_id) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (updated_by_id) REFERENCES users(users_id) ON DELETE SET NULL
-- );

-- ALTER TABLE task ADD CONSTRAINT task_workflow_process_id_fkey 

--   FOREIGN KEY (workflow_process_id) REFERENCES workflow_process(workflow_process_id) ON DELETE SET NULL;

-- ALTER TABLE task ADD CONSTRAINT task_workflow_process_task_id_fkey 

--   FOREIGN KEY (workflow_process_task_id) REFERENCES workflow_process_task(workflow_process_task_id) ON DELETE SET NULL;

-- CREATE TABLE color_category (
--   color_category_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL,
--   name VARCHAR(100) NOT NULL,
--   description TEXT,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_by_id UUID NOT NULL,
--   updated_by_id UUID NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (created_by_id) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (updated_by_id) REFERENCES users(users_id) ON DELETE SET NULL
-- );

-- CREATE TABLE color_sub_category (
--   color_sub_category_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   color_category_id UUID NOT NULL,
--   name VARCHAR(100) NOT NULL,
--   description TEXT,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_by_id UUID NOT NULL,
--   updated_by_id UUID NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (color_category_id) REFERENCES color_category(color_category_id) ON DELETE CASCADE,
--   FOREIGN KEY (created_by_id) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (updated_by_id) REFERENCES users(users_id) ON DELETE SET NULL
-- );

-- CREATE TABLE color_items (
--   color_item_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   color_sub_category_id UUID NOT NULL,
--   builder_id UUID NOT NULL,
--   name VARCHAR(100) NOT NULL,
--   code VARCHAR(100) NOT NULL,
--   standard BOOLEAN DEFAULT FALSE,
--   upgrade BOOLEAN DEFAULT FALSE,
--   units INT DEFAULT NULL,
--   notes TEXT DEFAULT NULL,
--   highlight_notes_on_pdf BOOLEAN DEFAULT FALSE,
--   supplier_id UUID DEFAULT NULL,
--   image TEXT NOT NULL,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_by_id UUID NOT NULL,
--   updated_by_id UUID NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (color_sub_category_id) REFERENCES color_sub_category(color_sub_category_id) ON DELETE CASCADE,
--   FOREIGN KEY (supplier_id) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (created_by_id) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (updated_by_id) REFERENCES users(users_id) ON DELETE SET NULL
-- );

-- CREATE TYPE invoice_status_enum AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

-- CREATE TABLE invoice (
--   invoice_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   lead_invoice_id VARCHAR(50) UNIQUE NOT NULL,
--   builder_id UUID NOT NULL,
--   lead_id UUID DEFAULT NULL,
--   description VARCHAR(100) NOT NULL,
--   notes VARCHAR(500) NOT NULL,
--   invoice_amount NUMERIC(12,2) DEFAULT 0,
--   due_date DATE NOT NULL,
--   status invoice_status_enum DEFAULT 'draft' NOT NULL,
--   version_number INT NOT NULL,
--   is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
--   created_by_id UUID NOT NULL,
--   updated_by_id UUID NOT NULL,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE,
--   FOREIGN KEY (lead_id) REFERENCES leads(lead_id) ON DELETE SET NULL,
--   FOREIGN KEY (created_by_id) REFERENCES users(users_id) ON DELETE SET NULL,
--   FOREIGN KEY (updated_by_id) REFERENCES users(users_id) ON DELETE SET NULL
-- );

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE country (
  country_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE state (
  state_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  country_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT fk_country FOREIGN KEY (country_id) REFERENCES country(country_id) ON DELETE CASCADE,
  CONSTRAINT unique_state_per_country UNIQUE (country_id, name)
);

CREATE TABLE timezones (
    timezone_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    country_code VARCHAR(2) NOT NULL,
    timezone_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    utc_offset_minutes INT NOT NULL,
    is_dst BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- CREATE TABLE builder (
--   builder_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   name VARCHAR(100) NOT NULL,
--   email VARCHAR(100) UNIQUE NOT NULL,
--   logo VARCHAR(500) DEFAULT 'https://cdn.dribbble.com/userupload/5245642/file/original-430a2e28de5df4e1932405b3a9f783e7.png?resize=752x&vertical=center',
--   slogan VARCHAR(500),
--   firm_name VARCHAR(250),
--   license_number VARCHAR(100),
--   abn_number VARCHAR(100),
--   phone_number VARCHAR(20),
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

CREATE TABLE builder (
  builder_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID  REFERENCES company(company_id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  phone_number VARCHAR(50),
  abn_number VARCHAR(20),
  acn_number VARCHAR(20),
  hia_membership_no VARCHAR(100),
  registration_number VARCHAR(100),
  registered_building_practitioner VARCHAR(255),
  practitioner_reg_no VARCHAR(100),
  licensed_builder_name VARCHAR(150),
  address_id UUID REFERENCES address(address_id) ON DELETE SET NULL,
  bank_name VARCHAR(150),
  account_name VARCHAR(150),
  account_number VARCHAR(50),
  account_bsb VARCHAR(20),
  logo VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE builder_insurer (
  builder_insurer_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  builder_id UUID NOT NULL REFERENCES builder(builder_id) ON DELETE CASCADE,
  insurer_name VARCHAR(150) NOT NULL,
  insured_name VARCHAR(150),
  phone_number VARCHAR(50),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  state_id UUID REFERENCES state(state_id) ON DELETE SET NULL,
  zip_code VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_builder_insurer UNIQUE (builder_id)
);

CREATE TABLE address (
  address_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  country_id UUID REFERENCES country(country_id) ON DELETE SET NULL,
  state_id UUID REFERENCES state(state_id) ON DELETE SET NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  zip_code VARCHAR(20),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL  ,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE company (
  company_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  abn_number VARCHAR(20),
  timezone_id UUID,
  address_id UUID REFERENCES address(address_id) ON DELETE SET NULL,
  bank_name VARCHAR(150),
  account_name VARCHAR(150),
  account_number VARCHAR(50),
  account_bsb VARCHAR(20),
  email_signature_logo VARCHAR(500),
  company_logo VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_timezone FOREIGN KEY (timezone_id) REFERENCES timezones(timezone_id) ON DELETE CASCADE,
);

-- CREATE TYPE users_role_enum AS ENUM ('super_admin', 'admin', 'project_owner', 'service_provider', 'client');

-- CREATE TABLE users (
--   users_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL, 
--   name VARCHAR(100) NOT NULL,
--   email VARCHAR(100) UNIQUE NOT NULL,
--   password VARCHAR(255) NOT NULL,
--   is_verified BOOLEAN DEFAULT FALSE,
--   is_deleted BOOLEAN DEFAULT FALSE,
--   role users_role_enum[] NOT NULL,
--   root_user BOOLEAN DEFAULT FALSE,
--   otp VARCHAR(10),
--   expires_at TIMESTAMP,
--   reset_password_token VARCHAR(255),
--   reset_token_expires_at TIMESTAMP,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE
-- );

-- CREATE TABLE users (
--   users_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL, 
--   name VARCHAR(100) NOT NULL,
--   email VARCHAR(100) UNIQUE NOT NULL,
--   password VARCHAR(255) NOT NULL,
--   is_verified BOOLEAN DEFAULT FALSE,
--   is_deleted BOOLEAN DEFAULT FALSE,
--   role_id UUID REFERENCES role(role_id),
--   root_user BOOLEAN DEFAULT FALSE,
--   otp VARCHAR(10),
--   expires_at TIMESTAMP,
--   reset_password_token VARCHAR(255),
--   reset_token_expires_at TIMESTAMP,
--   otp_resend_count INTEGER DEFAULT 0,
--   last_otp_sent_at TIMESTAMP,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE
-- );

CREATE TABLE users (
  users_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  builder_id UUID NOT NULL REFERENCES builder(builder_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  login_id VARCHAR(100) UNIQUE NOT NULL,
  initials VARCHAR(10),
  phone VARCHAR(20),
  secondary_phone VARCHAR(20),
  role_id UUID REFERENCES role(role_id),
  reporting_to UUID REFERENCES users(user_id),
  designation VARCHAR(100),
  date_of_joining DATE,
  remark TEXT,
  date_of_birth DATE,
  consultant_bio TEXT,
  photo VARCHAR(500),
  signature VARCHAR(500),
  password VARCHAR(255),
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_locked BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  root_user BOOLEAN DEFAULT FALSE,
  otp VARCHAR(10),
  expires_at TIMESTAMP,
  reset_password_token VARCHAR(255),
  reset_token_expires_at TIMESTAMP,
  failed_attempts INT DEFAULT 0,
  next_login_password_change BOOLEAN DEFAULT FALSE,
  password_auto_generated BOOLEAN DEFAULT FALSE,
  email_login_credentials BOOLEAN DEFAULT FALSE,
  address_id UUID REFERENCES address(address_id) ON DELETE SET NULL,
  use_company_address BOOLEAN DEFAULT FALSE,
  has_login BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CREATE TABLE users (
--   users_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   builder_id UUID NOT NULL REFERENCES builder(builder_id) ON DELETE CASCADE,
--   name VARCHAR(100) NOT NULL,
--   email VARCHAR(100) UNIQUE NOT NULL,
--   login_id VARCHAR(100) UNIQUE NOT NULL,
--   initials VARCHAR(10),
--   phone VARCHAR(20),
--   secondary_phone VARCHAR(20),
--   role_id UUID REFERENCES role(role_id),
--   reporting_to UUID REFERENCES users(user_id),
--   country_id UUID REFERENCES country(country_id),
--   state_id UUID REFERENCES state(state_id),
--   designation VARCHAR(100),
--   date_of_joining DATE,
--   remark TEXT,
--   date_of_birth DATE,
--   consultant_bio TEXT,
--   photo VARCHAR(500),
--   signature VARCHAR(500),
--   password VARCHAR(255) NOT NULL,
--   is_verified BOOLEAN DEFAULT FALSE,
--   is_active BOOLEAN DEFAULT TRUE,
--   is_locked BOOLEAN DEFAULT FALSE,
--   is_deleted BOOLEAN DEFAULT FALSE,
--   root_user BOOLEAN DEFAULT FALSE,
--   otp VARCHAR(10),
--   expires_at TIMESTAMP,
--   reset_password_token VARCHAR(255),
--   reset_token_expires_at TIMESTAMP,
--   failed_attempts INT DEFAULT 0,
--   next_login_password_change BOOLEAN DEFAULT FALSE,
--   password_auto_generated BOOLEAN DEFAULT FALSE,
--   email_login_credentials BOOLEAN DEFAULT FALSE,
--   address_id UUID REFERENCES address(address_id) ON DELETE SET NULL,
--   use_company_address BOOLEAN DEFAULT FALSE,
--   has_login BOOLEAN DEFAULT TRUE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

CREATE TABLE users_token (
  users_token_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(users_id) ON DELETE CASCADE
);

CREATE TABLE invites (
  invite_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  builder_id UUID NOT NULL,
  role_id UUID NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  invited_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE
);

CREATE TABLE user_group (
  user_group_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  users_id UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_by_id UUID NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
  updated_by_id UUID NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invites (
  invite_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  builder_id UUID NOT NULL,
  role_id UUID NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  invited_at TIMESTAMP DEFAULT NOW(),
  FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE
);

CREATE TABLE dwelling_type (
    dwelling_type_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,          -- e.g., 'Single Storey', 'Double Storey', etc.
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_dwelling_type_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_dwelling_type_scope UNIQUE (company_id, builder_id, name)
);

CREATE TABLE range (
    range_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,              -- Range name, e.g., 'Classic', 'Premium', etc.
    logo_url VARCHAR(500),                   -- Logo for range
    header_url VARCHAR(500),                 -- Header/banner image
    user_id UUID[] DEFAULT '{}',             --REFERENCES users(user_id) ON DELETE SET NULL, -- Owner/assigned user
    sort_order INT DEFAULT 1,
    bg_color VARCHAR(50),                    -- Background color (e.g., #ffffff)
    font_color VARCHAR(50),                  -- Text color (e.g., #000000)
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_range_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_range_scope UNIQUE (company_id, builder_id, name)
);  

CREATE TABLE screen (
  screen_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE functionality (
  functionality_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  screen_id UUID NOT NULL REFERENCES screen(screen_id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
); 

CREATE TABLE construction_type(
  construction_type_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  builder UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  types_name VARCHAR(255) NOT NULL,
  start_construction_days INT DEFAULT 21,                                 
  sort_order INT DEFAULT 1, 
  dwelling_type UUID[] DEFAULT '{}',
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_construction_type_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE construction_stage(
  construction_stage UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  builder UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  construction_type_id UUID REFERENCES construction_type(construction_type_id) ON DELETE CASCADE,
  stage_name VARCHAR(255) NOT NULL,
  days INT DEFAULT 10,
  sort_order INT DEFAULT 1,
  site_image BOOLEAN DEFAULT FALSE,
  inspection VARCHAR(100) CHECK(inspection IN('not_required', 'stage_start', 'stage_completed')) DEFAULT 'not_required',
  bg_color VARCHAR(50),                    -- Background color (e.g., #ffffff)
  font_color VARCHAR(50),                  -- Text color (e.g., #000000)
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_construction_stage_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
  CONSTRAINT uq_construction_stage_stage_name UNIQUE (company_id, builder_id, stage_name)
);

CREATE TABLE checklist (
  checklist_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  builder_id UUID NOT NULL,
  name VARCHAR(150) NOT NULL,
  screen_id UUID NOT NULL REFERENCES screen(screen_id) ON DELETE CASCADE,
  functionality_id UUID NOT NULL REFERENCES functionality(functionality_id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (builder_id) REFERENCES builder(builder_id) ON DELETE CASCADE
);

CREATE TYPE checklist_item_type AS ENUM ('checkbox', 'dropdown');

CREATE TABLE checklist_item (
  checklist_item_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  checklist_id UUID NOT NULL REFERENCES checklist(checklist_id) ON DELETE CASCADE,
  construction_type_id UUID REFERENCES construction_type(construction_type_id) ON DELETE CASCADE,
  construction_stage_id UUID REFERENCES construction_stage(construction_stage) ON DELETE CASCADE,
  description VARCHAR(500) NOT NULL,
  notes BOOLEAN DEFAULT FALSE,
  is_required BOOLEAN DEFAULT FALSE,
  type checklist_item_type NOT NULL,
  sort INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE show_reference_id_in_pdf_type AS ENUM (

    'document_id',

    'job_id',

    'document_id_and_job_id',

    'hide_document_id_and_job_id'

);

CREATE TABLE general_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    notification_referral_partner BOOLEAN DEFAULT FALSE,
    pdf_password_protected BOOLEAN DEFAULT FALSE,
    pdf_password VARCHAR(255),
    round_of_cost BOOLEAN DEFAULT FALSE,
    negative_value_show BOOLEAN DEFAULT TRUE,
    negative_value_color VARCHAR(50),
    show_reference_id_in_pdf show_reference_id_in_pdf_type DEFAULT 'hide_document_id_and_job_id',
    job_id_label VARCHAR(100)
);

CREATE TABLE surveyor (
  surveyor_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  phone VARCHAR(50),
  abn_number VARCHAR(20),
  registration_number VARCHAR(100),
  address1 VARCHAR(255) NOT NULL,
  address2 VARCHAR(255),
  city VARCHAR(150) NOT NULL,
  state_id UUID REFERENCES state(state_id) ON DELETE SET NULL,
  zip_postal_code VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE custom_field_module (
  module_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE, -- e.g. 'lead', 'job'
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE custom_field (
  custom_field_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES custom_field_module(module_id) ON DELETE CASCADE,
  field_name VARCHAR(150) NOT NULL,
  field_label VARCHAR(150) NOT NULL,
  field_type VARCHAR(50) NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'checkbox', 'list', 'multiline')),
  options TEXT[], -- Used for 'list' type
  is_required BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE, 
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_company_or_builder CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
  CONSTRAINT uq_field_scope UNIQUE (module_id, field_name, company_id, builder_id)
  );

  CREATE TABLE custom_field_value (
  custom_field_value_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  custom_field_id UUID NOT NULL REFERENCES custom_field(custom_field_id) ON DELETE CASCADE,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  record_id UUID NOT NULL, -- e.g. lead_id or job_id
  value_text TEXT,
  value_number NUMERIC,
  value_date DATE,
  value_boolean BOOLEAN,
  value_list TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_field_record UNIQUE (custom_field_id, record_id)
);

CREATE TABLE notes_tag (
  notes_tag_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  background_color VARCHAR(20), -- e.g., #a34d39ff
  font_color VARCHAR(20),       -- e.g., #FFFFFF
  is_active BOOLEAN DEFAULT TRUE, 
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_notes_tag_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
  CONSTRAINT uq_notes_tag_scope UNIQUE (name, company_id, builder_id)
);

CREATE TABLE role (
  role_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(150) NOT NULL,           -- e.g., 'Task Manager', 'Company Admin (My Home)'
  description TEXT,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE role_type(
    role_type_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    role_id UUID NOT NULL REFERENCES role(role_id) ON DELETE CASCADE,
    type_name VARCHAR(100) NOT NULL,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_role_mapping (
  user_role_mapping_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  user_id UUID  REFERENCES users(users_id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES role(role_id) ON DELETE CASCADE,
  role_type_id UUID REFERENCES role_type(role_type_id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_permission_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
  CONSTRAINT uq_user_role UNIQUE (user_id, role_id)
);

CREATE TABLE role_permission (
  role_permission_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  role_id UUID NOT NULL REFERENCES role(role_id) ON DELETE CASCADE,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  module_name VARCHAR(100) NOT NULL,   -- e.g. 'leads', 'jobs', 'surveyors'
  can_create BOOLEAN DEFAULT FALSE,
  can_read BOOLEAN DEFAULT FALSE,
  can_update BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE, 
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_permission_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
  CONSTRAINT uq_role_module_scope UNIQUE (role_id, module_name, company_id, builder_id)
);

CREATE TABLE password_policy (
  password_policy_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  expires_in_days INT DEFAULT 90,                   -- Password expires after N days
  invalid_attempt_limit INT DEFAULT 5,              -- Number of invalid login attempts before lock
  alert_before_expiry_days INT DEFAULT 7,           -- Show alert before password expiry
  password_history_count INT DEFAULT 5,             -- Number of previous passwords stored
  enforce_strong_password BOOLEAN DEFAULT TRUE,     -- Optional: Enforce uppercase, numbers, special chars
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(), 
  CONSTRAINT chk_password_policy_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
  CONSTRAINT uq_password_policy_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE user_password_history (
  history_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(users_id) ON DELETE CASCADE,
  old_password VARCHAR(255) NOT NULL,  -- hashed password
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_old_password UNIQUE (user_id, old_password)
);

CREATE TABLE sales_module_settings (
    sales_module_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    allow_duplicate_leads BOOLEAN DEFAULT FALSE,
    send_email_on_new_lead BOOLEAN DEFAULT TRUE,
    show_common_folders BOOLEAN DEFAULT TRUE,
    -- Optional lead mandatory fields setting
    lead_mandatory_option VARCHAR(50) DEFAULT 'email_and_phone', 
    -- Values: 'email_and_phone', 'either_email_or_phone', 'email_not_mandatory', 'phone_not_mandatory', 'email_and_phone_not_mandatory'
    role_id UUID[] DEFAULT '{}',                --REFERENCES role(role_id),
    sales_won_button_text VARCHAR(100) DEFAULT 'Mark as Won',
    house_size_unit VARCHAR(20) DEFAULT 'sq_m2',  -- e.g., 'sq_m2', 'sq_ft'
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_sales_module_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_sales_module_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE sales_process (
    sales_process_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_sales_process_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_sales_process_scope UNIQUE (company_id, builder_id, name)
);

CREATE TABLE sales_process_stage_functionality (
    functionality_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE sales_stage (
    sales_stage_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sales_process_id UUID NOT NULL REFERENCES sales_process(sales_process_id) ON DELETE CASCADE,
    stage_name VARCHAR(150) NOT NULL,
    functionality_id UUID[] DEFAULT '{}',
    category VARCHAR(50) NOT NULL CHECK (category IN ('lead', 'opportunity')),
    sort_order INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_stage_per_process UNIQUE (sales_process_id, stage_name)
);

CREATE TABLE lead_source (  
    lead_source_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,          -- e.g., 'Website', 'Referral', 'Facebook Ads'
    sort_order INT DEFAULT 1,            -- Used for ordered display in dropdowns
    allow_change BOOLEAN DEFAULT TRUE,   -- If FALSE, cannot modify source after creation
    is_active BOOLEAN DEFAULT TRUE,      -- Enable/disable lead source visibility
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_lead_source_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_lead_source_scope UNIQUE (company_id, builder_id, name)
);

CREATE TABLE lead_lost_reason (
    lead_lost_reason_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    lost_reason VARCHAR(255) NOT NULL,     -- e.g. 'Budget too low', 'No response'
    sort_order INT DEFAULT 1,             -- controls display order in dropdowns
    is_active BOOLEAN DEFAULT TRUE,        -- enable/disable reason
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_lead_lost_reason_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_lead_lost_reason_scope UNIQUE (company_id, builder_id, lost_reason)
);

CREATE TABLE client_type (
  client_type_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY, 
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    client_type VARCHAR(150) NOT NULL,      -- e.g., 'Home Owner', 'Investor'
    sort_order INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_client_type_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_client_type_scope UNIQUE (company_id, builder_id, client_type)
);

CREATE TABLE price_list (
    price_list_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    sort_order INT DEFAULT 0,
    show_in_view_list BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    is_suggested BOOLEAN DEFAULT FALSE,
    location UUID REFERENCES location(location_id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_price_list_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_price_list_name UNIQUE (company_id, builder_id, name)
);

CREATE TABLE quotation_settings (
    quotation_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    allow_save_as_new_version BOOLEAN DEFAULT FALSE,
    mandatory_contact_details BOOLEAN DEFAULT FALSE,
    mandatory_dwelling_type BOOLEAN DEFAULT FALSE,
    mandatory_sketch_number BOOLEAN DEFAULT FALSE,
    mandatory_land_title BOOLEAN DEFAULT FALSE,
    enable_dwelling_size BOOLEAN DEFAULT FALSE,
    enable_builder_cost BOOLEAN DEFAULT FALSE,
    allow_notes BOOLEAN DEFAULT TRUE,
    allow_cost_adjustment BOOLEAN DEFAULT TRUE,
    show_notes_by_default BOOLEAN DEFAULT TRUE,
    allow_multiple_packages BOOLEAN DEFAULT FALSE,
    include_additional_items_in_price_adjusted_list BOOLEAN DEFAULT FALSE,
    auto_approve_on_sales_won BOOLEAN DEFAULT FALSE,
    show_default_pricelist_in_additional_items BOOLEAN DEFAULT TRUE,
    hide_price_to_customer BOOLEAN DEFAULT FALSE,
    enable_estimated_price_range BOOLEAN DEFAULT FALSE,
    quotation_validity_days INT DEFAULT 30,                -- e.g. 30 days
    extend_validity_from_updated_date INT DEFAULT 0,       -- e.g. extend by 5 days
    rename_send_for_approval_button VARCHAR(150),          -- e.g., 'Submit for Review'
    default_pricelist_id UUID REFERENCES price_list(price_list_id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_quotation_settings_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_quotation_settings_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE house_land_package_settings (
    house_land_package_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    include_facade_cost_in_total BOOLEAN DEFAULT FALSE,  -- 🔘 main toggle
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_house_land_package_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_house_land_package_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE job_settings (
    job_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    auto_move_to_maintenance BOOLEAN DEFAULT FALSE,     -- Move job to maintenance automatically when construction completed
    auto_mark_completed BOOLEAN DEFAULT FALSE,          -- Automatically mark job as completed
    auto_archive_after_completion BOOLEAN DEFAULT FALSE, -- Auto-archive job after completion
    auto_archive_after_days INT DEFAULT NULL,            -- Number of days after completion to archive
    milestone_status_check_days INT DEFAULT NULL,        -- Number of days for milestone task/checklist status review
    report_custom_days INT DEFAULT NULL,                 -- Number of days to include in job status report
    report_status_filter VARCHAR(100) DEFAULT 'all',     -- Status filter: 'all', 'active', 'completed', etc.
    report_include_date BOOLEAN DEFAULT TRUE,            -- Include date in job status report
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_job_settings_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_job_settings_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE job_process_stage_functionality (
    functionality_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_workflow BOOLEAN DEFAULT FALSE 
);

CREATE TABLE job_process_stage (
    stage_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID NOT NULL REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    functionality_id UUID NOT NULL REFERENCES job_process_stage_functionality(functionality_id),
    sort_order INT NOT NULL,
    dependent_stage_id UUID REFERENCES job_process_stage(stage_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (company_id, builder_id, name)
);

CREATE TABLE job_process_sub_stage (
    sub_stage_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    stage_id UUID NOT NULL REFERENCES job_process_stage(stage_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    sort_order INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_process_task (
    job_process_task_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sub_stage_id UUID NOT NULL REFERENCES job_process_sub_stage(sub_stage_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL,
    folder_id UUID REFERENCES document_common_folder(document_common_folder_id) ON DELETE SET NULL,
    no_of_days INT,
    assignee_id UUID REFERENCES users(users_id) ON DELETE SET NULL,
    notify BOOLEAN DEFAULT FALSE,
    milestone BOOLEAN DEFAULT FALSE,
    attachment_mandatory BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_process_task_dependency (
    task_id UUID NOT NULL REFERENCES job_process_task(job_process_task_id) ON DELETE CASCADE,
    predecessor_task_id UUID NOT NULL REFERENCES job_process_task(job_process_task_id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, predecessor_task_id)
);

CREATE TABLE job_process_subtask (
    job_process_subtask_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_process_task_id UUID NOT NULL REFERENCES job_process_task(job_process_task_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    sort_order INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_color_settings (
    job_color_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    hide_color_item_images BOOLEAN DEFAULT FALSE,
    hide_color_item_price BOOLEAN DEFAULT FALSE,
    exit_color_code BOOLEAN DEFAULT FALSE,
    page_orientation_portrait BOOLEAN DEFAULT TRUE,
    header_text VARCHAR(500),  -- Color selection screen header text
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_color_settings_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_color_settings_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE job_color_columns (
    job_color_column_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_color_settings_id UUID NOT NULL REFERENCES job_color_settings(job_color_settings_id) ON DELETE CASCADE,
    column_name VARCHAR(150) NOT NULL,  -- e.g., 'Supplier', 'Room', 'Finish', 'Color', etc.
    display_option VARCHAR(50) NOT NULL CHECK (display_option IN ('dont_show', 'show_as_separate_column', 'show_in_existing_items_column')),
    sort_order INT DEFAULT NULL,
    width INT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_color_column_width_sort CHECK ((display_option != 'show_in_existing_items_column') OR (sort_order IS NULL AND width IS NULL))
);

CREATE TABLE job_color_column_sections (
    job_color_column_section_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_color_settings_id UUID NOT NULL REFERENCES job_color_settings(job_color_settings_id) ON DELETE CASCADE,
    section_name VARCHAR(150) CHECK (section_name IN('attach_pdf_beginning', 'attach_pdf_end')),
    attachments VARCHAR(500),
    sort_order INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()  
);

CREATE TABLE job_workflow_settings (
    job_workflow_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    show_all_tasks_to_all_roles BOOLEAN DEFAULT FALSE,
    include_weekend_date BOOLEAN DEFAULT FALSE,
    include_holiday_date BOOLEAN DEFAULT FALSE,
    recalculate_estimated_end_dates_future_tasks BOOLEAN DEFAULT FALSE,
    recalculate_estimated_dates_based_on_actual_changes BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_job_workflow_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_job_workflow_scope UNIQUE (company_id, builder_id)
);  

CREATE TABLE job_invoice_settings (
    job_invoice_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    show_invoice_summary_in_pdf BOOLEAN DEFAULT FALSE,
    invoice_terms_days INT DEFAULT 0 CHECK (invoice_terms_days >= 0),
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_job_invoice_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_job_invoice_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE job_invoice_stage_payments (
    job_invoice_stage_payment_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_invoice_settings_id UUID NOT NULL REFERENCES job_invoice_settings(job_invoice_settings_id) ON DELETE CASCADE,
    description VARCHAR(150) NOT NULL,   -- e.g. Deposit, Base Stage, Frame Stage
    percentage NUMERIC(5,2) CHECK (percentage >= 0 AND percentage <= 100),
    sort_order INT NOT NULL DEFAULT 1,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_variation_settings (
    job_variation_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    allow_notes_in_variation BOOLEAN DEFAULT FALSE,
    allow_cost_adjustment BOOLEAN DEFAULT FALSE,
    show_notes_in_variation_by_default BOOLEAN DEFAULT FALSE,
    drawing_changes_required BOOLEAN DEFAULT FALSE,
    notify_signed_variation BOOLEAN DEFAULT FALSE,
    notify_signed_variation_only_after_contract_prepared BOOLEAN DEFAULT FALSE,
    allowed_move_job_to_construction_with_pending_variation BOOLEAN DEFAULT FALSE,
    make_requested_by_and_delayed_days_mandatory BOOLEAN DEFAULT FALSE,
    send_mail_when_variation_self_approved BOOLEAN DEFAULT FALSE,
    contract_based_variation_header BOOLEAN DEFAULT FALSE,
    contract_based_variation_header_title VARCHAR(255),    
    pre_contract_header VARCHAR(255),                      
    post_contract_header VARCHAR(255),
    notify_signed_variation_user_ids UUID[] DEFAULT '{}',       -- references users.user_id[]   
    notify_signed_variation_group_ids UUID[] DEFAULT '{}',      -- references user_group.user_group_id[]  
    notify_after_contract_user_ids UUID[] DEFAULT '{}',         -- references users.user_id[]   
    notify_after_contract_group_ids UUID[] DEFAULT '{}',        -- references user_group.user_group_id[] 
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_job_variation_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_job_variation_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE job_variation_approval(
  job_variation_approval_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES role(role_id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_job_variation_approval_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE job_commission_settings (
    job_commission_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    define_outgoing_commission BOOLEAN DEFAULT FALSE,
    define_incoming_commission BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_job_commission_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_job_commission_scope UNIQUE (company_id, builder_id)
);

CREATE TYPE commission_type_enum AS ENUM ('outgoing', 'incoming');

CREATE TYPE commission_unit_enum AS ENUM ('percentage', 'amount');

CREATE TYPE commission_recipient_enum AS ENUM (

    'sales_person',

    'reporting_to',

    'referral_partner',

    'customer',

    'other_user'

);

CREATE TABLE job_commission (
    job_commission_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    job_commission_settings_id UUID REFERENCES job_commission_settings(job_commission_settings_id) ON DELETE CASCADE,
    commission_type commission_type_enum NOT NULL, -- outgoing or incoming
    name VARCHAR(150) NOT NULL,
    recipient commission_recipient_enum NOT NULL,
    recipient_user_id UUID REFERENCES users(users_id) ON DELETE SET NULL, -- only for 'other_user'
    commission_unit commission_unit_enum NOT NULL, -- % or $
    commission_value NUMERIC(10,2) NOT NULL CHECK (commission_value >= 0),
    sort_order INT DEFAULT 0,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_job_commission_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE job_commission_sub_stage (
    job_commission_sub_stage_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_commission_id UUID NOT NULL REFERENCES job_commission(job_commission_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    commission_unit commission_unit_enum NOT NULL, -- % or $
    commission_value NUMERIC(10,2) NOT NULL CHECK (commission_value >= 0),
    sort_order INT DEFAULT 0,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_process (
    job_process_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_process_stage_functionality (
    functionality_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_workflow BOOLEAN DEFAULT FALSE
);

CREATE TABLE job_process_stage (
    stage_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_process_id UUID NOT NULL REFERENCES job_process(job_process_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    functionality_id UUID NOT NULL REFERENCES job_process_stage_functionality(functionality_id),
    sort_order INT NOT NULL,
    dependent_stage_id UUID REFERENCES stage(stage_id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_process_sub_stage (
    sub_stage_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_process_stage_id UUID NOT NULL REFERENCES job_process_stage(stage_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    sort_order INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job_process_task_dependency (
    task_id UUID NOT NULL REFERENCES task(task_id) ON DELETE CASCADE,
    predecessor_task_id UUID NOT NULL REFERENCES task(task_id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, predecessor_task_id)
);

CREATE TABLE job_process_subtask (
    subtask_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES task(task_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    sort_order INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE maintenance_settings (                                                         
    maintenance_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    area_enabled BOOLEAN DEFAULT FALSE,
    supplier_enabled BOOLEAN DEFAULT FALSE,
    allow_completion_without_supplier_response BOOLEAN DEFAULT FALSE,
    request_date_enabled BOOLEAN DEFAULT FALSE,
    task_date_enabled BOOLEAN DEFAULT FALSE,
    repair_cost_enabled BOOLEAN DEFAULT FALSE,
    hours_spent_enabled BOOLEAN DEFAULT FALSE,
    -- maintenance_start_date DATE,
    maintenance_start_date VARCHAR(50) CHECK( maintenance_start_date IN('handover_date', 'occupancy_permit_date')) DEFAULT 'handover_date',
    -- handover_date DATE, 
    maintenance_period_days INT CHECK (maintenance_period_days >= 0),
    maintenance_duration_days INT CHECK (maintenance_duration_days >= 0),
    supervisor_roles UUID[] DEFAULT '{}',                     -- refrence from role.role_id[]
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_maintenance_settings_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_maintenance_settings_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE maintenance_area (
    maintenance_area_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,     -- in this table add is_active column
    name VARCHAR(150) NOT NULL,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_maintenance_area_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_maintenance_area_scope UNIQUE (company_id, builder_id, name)
);

CREATE TABLE document_common_folder (
    document_common_folder_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    sort_order INT DEFAULT 0,
    notify BOOLEAN DEFAULT FALSE,
    share_to_customer BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    role_ids UUID[] DEFAULT '{}',     -- refrence from role.role_id
    user_ids UUID[] DEFAULT '{}',     -- refrence from users.users.id
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_document_common_folder_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_document_common_folder_scope UNIQUE (company_id, builder_id, name)
);

CREATE TABLE document_common_subfolder ( 
    document_common_subfolder_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    document_common_folder_id UUID NOT NULL REFERENCES document_common_folder(document_common_folder_id) ON DELETE CASCADE,
    parent_subfolder_id UUID REFERENCES document_common_subfolder(document_common_subfolder_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    sort_order INT DEFAULT 0,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE document_file_naming_rule (
    document_file_naming_rule_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    file_type VARCHAR(150) NOT NULL,
    folder_ids UUID[] DEFAULT '{}',      --refrence from document_common_folder.document_common_folder_id
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_document_file_naming_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_document_file_naming_rule UNIQUE (company_id, builder_id, file_type)
);

CREATE TABLE document_file_naming_format(
  document_file_naming_format_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  naming_format VARCHAR(255),
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_document_file_naming_format_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TYPE document_mapping_type_enum AS ENUM (

    'signed_quotation',

    'signed_color',

    'signed_variation',

    'signed_maintenance',

    'signed_contract_document',

    'compliance_certificate',

    'purchase_order',

    'job_documents'

);

CREATE TABLE document_folder_mapping (
    document_folder_mapping_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    signed_quotation UUID REFERENCES document_common_folder(document_common_folder_id) ON DELETE SET NULL,
    signed_color UUID REFERENCES document_common_folder(document_common_folder_id) ON DELETE SET NULL,
    signed_variation UUID REFERENCES document_common_folder(document_common_folder_id) ON DELETE SET NULL,
    signed_maintenance UUID REFERENCES document_common_folder(document_common_folder_id) ON DELETE SET NULL,
    signed_contract_document UUID REFERENCES document_common_folder(document_common_folder_id) ON DELETE SET NULL,
    compliance_certificate UUID REFERENCES document_common_folder(document_common_folder_id) ON DELETE SET NULL,
    purchase_order UUID REFERENCES document_common_folder(document_common_folder_id) ON DELETE SET NULL,
    job_documents UUID REFERENCES document_common_folder(document_common_folder_id) ON DELETE SET NULL,
    select_all_files_from_folder BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL, 
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_document_folder_mapping_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE integration_settings (
    integration_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    automatically_send_welcome_email BOOLEAN DEFAULT FALSE,
    rea_hl_enabled BOOLEAN DEFAULT FALSE,
    canibuild_enabled BOOLEAN DEFAULT FALSE,
    website_hl_enabled BOOLEAN DEFAULT FALSE,
    google_enabled BOOLEAN DEFAULT FALSE,
    assign_leads_if_assignee_not_found UUID REFERENCES users(users_id) ON DELETE SET NULL,
    always_assign_leads_to UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_integration_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_integration_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE integration_custom_field_header (
    integration_custom_field_header_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    header_name VARCHAR(150) NOT NULL,     -- e.g. "Lead Type", "Job Type"
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_integration_header_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_integration_header UNIQUE (company_id, builder_id, header_name)
);

CREATE TABLE integration_custom_field_item (
    integration_custom_field_item_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    header1_id UUID REFERENCES integration_custom_field_header(integration_custom_field_header_id) ON DELETE SET NULL,
    header2_id UUID REFERENCES integration_custom_field_header(integration_custom_field_header_id) ON DELETE SET NULL,
    value1 VARCHAR(255),  -- e.g. "Residential"
    value2 VARCHAR(255),  -- e.g. "Plumbing"
    assignee_user_id UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_integration_item_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE template_email (
    template_email_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) CHECK (type IN ('standard', 'customized')) NOT NULL DEFAULT 'standard',
    subject VARCHAR(255),
    email_content TEXT NOT NULL,
    additional_recipient_users UUID[] DEFAULT '{}',    -- REFERENCES users(users_id) ON DELETE SET NULL,
    additional_recipient_groups UUID[] DEFAULT '{}',   -- REFERENCES user_group(user_group_id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_template_email_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_template_email_name UNIQUE (company_id, builder_id, name)
);

CREATE TABLE template_email_signature (
    template_email_signature_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    include_email_signature BOOLEAN DEFAULT FALSE,
    signature_content TEXT,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_template_signature_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_template_signature_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE template_note (
    template_note_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    content TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_template_note_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_template_note_name UNIQUE (company_id, builder_id, name)
);

CREATE TABLE template_pdf (
    template_pdf_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    template_json JSONB NOT NULL,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_template_pdf_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_template_note_name UNIQUE (company_id, builder_id, name)
);

CREATE TABLE scheduler_email (
    scheduler_email_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    frequency VARCHAR(50) CHECK (frequency IN ('daily', 'weekly', 'monthly')) NOT NULL,
    send_to_all_active_users BOOLEAN DEFAULT FALSE,
    notification_recipient_users UUID[] DEFAULT '{}', --REFERENCES users(users_id) ON DELETE SET NULL,
    reply_to_users UUID[] DEFAULT '{}',        --REFERENCES users(users_id) ON DELETE SET NULL,
    exclude_recipients UUID[] DEFAULT '{}',    --  when send_to_all_active_users is true
    subject VARCHAR(255) NOT NULL,
    message_body TEXT NOT NULL,
    no_of_action_days INT CHECK (no_of_action_days >= 0),
    no_record_message BOOLEAN DEFAULT FALSE,
    no_record_message_body TEXT,
    attach_files VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_scheduler_email_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_scheduler_email_name UNIQUE (company_id, builder_id, name)
);

CREATE TABLE scheduler_settings (
    scheduler_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    receiver_of_replies UUID[] DEFAULT '{}',     --REFERENCES users(users_id) ON DELETE SET NULL,  -- multiple users can receive replies
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_scheduler_settings_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_scheduler_settings_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE portal_settings (
    portal_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    send_login_credentials_to_customer BOOLEAN DEFAULT FALSE,   --if this false then other field can not put value by user if the the user sill give the calue any filed give them error except publish_packages_to_agent_portal
    portal_active_days_after_handover INT CHECK (portal_active_days_after_handover >= 0),
    send_mail_when_portal_inactive BOOLEAN DEFAULT FALSE,
    show_site_supervisor_details BOOLEAN DEFAULT FALSE,
    show_balance_to_pay BOOLEAN DEFAULT FALSE,
    add_notes_enabled BOOLEAN DEFAULT FALSE,
    allow_color_selection BOOLEAN DEFAULT FALSE,
    show_color_cost BOOLEAN DEFAULT FALSE,  -- only applicable if allow_color_selection = TRUE
    show_construction_stages BOOLEAN DEFAULT FALSE,
    auto_share_site_images BOOLEAN DEFAULT FALSE, -- only applies if show_construction_stages = TRUE
    show_progress_tab BOOLEAN DEFAULT FALSE,
    default_facade_image VARCHAR(500),
    publish_packages_to_agent_portal BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_portal_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_portal_settings_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE master_price_list_categories (
  master_price_list_category_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE NOT NULL,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  display_order INT DEFAULT 0,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TYPE cost_type_enum AS ENUM ('include', 'fixed', 'variable');

CREATE TYPE cost_option_enum AS ENUM ('none', 'tba', 'tbc');

CREATE TABLE master_price_list_categories_item (
  master_price_list_categories_item_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  master_price_list_category_id UUID NOT NULL REFERENCES master_price_list_categories(master_price_list_category_id) ON DELETE CASCADE,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE NOT NULL,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  short_description VARCHAR(500),
  full_description TEXT,
  item_type VARCHAR(100),
  cost NUMERIC(12,2) DEFAULT 0, 
  cost_type cost_type_enum NOT NULL,
  cost_option cost_option_enum NOT NULL,
  currency VARCHAR(10) DEFAULT 'AUD',
  uom VARCHAR(50),
  sort_order INT DEFAULT 0,
  is_standard BOOLEAN DEFAULT FALSE,
  is_upgrade BOOLEAN DEFAULT FALSE,
  extra JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE TABLE price_list_item (
    price_list_item_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    price_list_id UUID NOT NULL REFERENCES price_list(price_list_id) ON DELETE CASCADE,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    item_description TEXT NOT NULL,
    short_description VARCHAR(255),
    cost_type VARCHAR(50) CHECK (cost_type IN ('Included', 'Fixed', 'Variable')) NOT NULL,
    cost_type_text VARCHAR(255),
    cost_option VARCHAR(50) CHECK (cost_option IN ('none', 'tba', 'tbc')) DEFAULT 'none',
    cost NUMERIC(12, 2),
    builder_cost NUMERIC(12, 2),
    sort_order INT DEFAULT 0,
    uom VARCHAR(50),
    status VARCHAR(20) CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
    include_by_default BOOLEAN DEFAULT FALSE,
    allow_remove_from_quotation BOOLEAN DEFAULT FALSE,
    show_in_hl_package BOOLEAN DEFAULT FALSE,
    show_only_in_package BOOLEAN DEFAULT FALSE,
    range_id UUID[] DEFAULT '{}',                    -- REFERENCES range(range_id) ON DELETE SET NULL,
    dwelling_type_id UUID[] DEFAULT '{}',            -- REFERENCES dwelling_type(dwelling_type_id) ON DELETE SET NULL,
    additional_item BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_price_list_item_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE price_list_item_condition (
    price_list_item_condition_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    price_list_item_id UUID NOT NULL REFERENCES price_list_item(price_list_item_id) ON DELETE CASCADE,
    condition_name VARCHAR(255) CHECK(condition_name IN ('site_fall', 'land_size', 'corner_block', 'land_fill')),
    status BOOLEAN DEFAULT TRUE,                  -- if condition_name is corner block
    range_start DOUBLE PRECISION,
    range_end DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE supplier_type (
    supplier_type_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL ,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_supplier_type_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_supplier_type_per_builder UNIQUE (company_id, builder_id, name)
);

-- CREATE TABLE supplier (
--     supplier_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--     company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
--     builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
--     supplier_type_id UUID[] DEFAULT '{}',
--     company_name VARCHAR(255) NOT NULL,
--     abn VARCHAR(50),
--     description TEXT,
--     contact_name VARCHAR(150),
--     primary_phone VARCHAR(50),
--     secondary_phone VARCHAR(50),
--     website VARCHAR(255),
--     address_line1 VARCHAR(255),
--     city VARCHAR(150),
--     state_id UUID REFERENCES state(state_id) ON DELETE SET NULL,
--     zip_code VARCHAR(20),
--     lead_time VARCHAR(100),
--     status BOOLEAN DEFAULT TRUE,
--     emails TEXT[], -- array to store multiple email addresses
--     created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
--     updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
--     created_at TIMESTAMPTZ DEFAULT NOW(),
--     updated_at TIMESTAMPTZ DEFAULT NOW(),
--     CONSTRAINT uq_supplier_per_builder UNIQUE (company_id, builder_id, company_name),
--     CONSTRAINT chk_supplier_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
-- );

CREATE TABLE supplier (
    supplier_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    supplier_type_id UUID[] DEFAULT '{}',
    company_name VARCHAR(255) NOT NULL,
    abn VARCHAR(50),
    description TEXT,
    contact_name VARCHAR(150),
    primary_phone VARCHAR(50),
    secondary_phone VARCHAR(50),
    website VARCHAR(255),
    address_line1 VARCHAR(255),
    city VARCHAR(150),
    state_id UUID REFERENCES state(state_id) ON DELETE SET NULL,
    zip_code VARCHAR(20),
    lead_time VARCHAR(100),
    status BOOLEAN DEFAULT TRUE,
    emails TEXT[], -- array to store multiple email addresses
    work_cover_url VARCHAR(500),
    pl_insurance_url VARCHAR(500),
    white_card_url VARCHAR(500),
    fork_lift_license_url VARCHAR(500),
    trade_license_url VARCHAR(500),
    induction_pack_received BOOLEAN DEFAULT FALSE,
    induction_pack_url VARCHAR(500),
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_supplier_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE supplier_supplier_type_map (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    supplier_id UUID NOT NULL REFERENCES supplier(supplier_id) ON DELETE CASCADE,
    supplier_type_id UUID NOT NULL REFERENCES supplier_type(supplier_type_id) ON DELETE CASCADE,
    is_recommended BOOLEAN DEFAULT FALSE,
    assign_to_new_and_existing_checklist BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_supplier_type_map UNIQUE (supplier_id, supplier_type_id)
);

CREATE TABLE supplier_type_construction_checklist_map(
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    supplier_type_id UUID NOT NULL REFERENCES supplier_type(supplier_type_id) ON DELETE CASCADE,
    construction_checklist_id UUID NOT NULL REFERENCES construction_checklist(construction_checklist_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_supplier_type_construction_checklist_map UNIQUE (supplier_type_id, construction_checklist_id)
);

-- CREATE TABLE supplier_contacts (
--     supplier_contact_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--     supplier_id UUID NOT NULL REFERENCES supplier(supplier_id) ON DELETE CASCADE,
--     contact_name VARCHAR(150) NOT NULL,
--     email VARCHAR(150),
--     phone VARCHAR(50),
--     contact_type VARCHAR(100),
--     created_at TIMESTAMPTZ DEFAULT NOW(),
--     updated_at TIMESTAMPTZ DEFAULT NOW()
-- );

CREATE TABLE supplier_documents (
    supplier_document_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    supplier_id UUID NOT NULL REFERENCES supplier(supplier_id) ON DELETE CASCADE,
    work_cover_url VARCHAR(500),
    pl_insurance_url VARCHAR(500),
    white_card_url VARCHAR(500),
    fork_lift_license_url VARCHAR(500),
    trade_license_url VARCHAR(500),
    induction_pack_received BOOLEAN DEFAULT FALSE,
    induction_pack_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE survey_template (
    survey_template_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    sort_order INT DEFAULT 0,
    is_recommended BOOLEAN DEFAULT FALSE,
    status BOOLEAN DEFAULT TRUE, -- Active/Inactive
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_survey_template UNIQUE (company_id, builder_id, name),
    CONSTRAINT chk_survey_template_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE survey_template_questions (
    survey_question_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    survey_template_id UUID NOT NULL REFERENCES survey_template(survey_template_id) ON DELETE CASCADE,
    description TEXT NOT NULL, -- Question text
    option_type VARCHAR(50) NOT NULL CHECK (option_type IN ('text', 'radio', 'star_1_to_5', 'star_1_to_10')),
    options TEXT[], -- only used if option_type = 'radio', e.g. ARRAY['Yes', 'No', 'Maybe']
    sort_order INT DEFAULT 0,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE package (
    package_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    cost NUMERIC(12,2),
    builder_cost NUMERIC(12,2),
    sort_order INT DEFAULT 0,
    status BOOLEAN DEFAULT TRUE, -- Active / Inactive
    range_id UUID[] DEFAULT '{}',
    package_group_id UUID[] DEFAULT '{}',
    dwelling_type_id UUID[] DEFAULT '{}',
    allow_add_item_from_pricelist BOOLEAN DEFAULT FALSE,  
    allow_remove_package_items BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_package_per_scope UNIQUE (company_id, builder_id, name),
    CONSTRAINT chk_package_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE package_group (
    package_group_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    package_id UUID REFERENCES package(package_id) ON DELETE CASCADE,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    no_of_packages INT DEFAULT 0, -- calculated or maintained manually
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_package_group_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE package_pricelist_item_map (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    package_id UUID NOT NULL REFERENCES package(package_id) ON DELETE CASCADE,
    price_list_item_id UUID NOT NULL REFERENCES price_list_item(price_list_item_id) ON DELETE CASCADE,
    UNIQUE (package_id, price_list_item_id)
);

CREATE TABLE task (
      task_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
      builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      description TEXT,
      due_date DATE,
      due_time TIME,
      assignee_id UUID REFERENCES users(users_id) ON DELETE SET NULL,
      link_to UUID REFERENCES users(users_id) ON DELETE SET NULL,
      link_type VARCHAR(255),
      lead_id UUID REFERENCES leads(leads_id) ON DELETE SET NULL,
      priority VARCHAR(20) CHECK (priority IN ('Low', 'Medium', 'High')) DEFAULT 'Medium',
      status VARCHAR(20) CHECK (status IN ('Yet to Start', 'In Progress', 'Completed', 'Cancelled', 'Skipped')) DEFAULT 'Yet to Start',
      attach_files VARCHAR(500),
      created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
      updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE entity_action (
    entity_action_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    entity_type VARCHAR(50) CHECK (entity_type IN ('lead', 'job', 'sales', 'construction', 'opportunity')) NOT NULL,
    entity_id UUID NOT NULL, -- ID of the lead/job/etc.
    action_type VARCHAR(50) CHECK (action_type IN ('task', 'note', 'appointment')) NOT NULL,
    action_id UUID NOT NULL, -- ID of the task/note/appointment record
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entity_type, entity_id, action_type, action_id)
);

CREATE TABLE location (
    location_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    status BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_location_per_builder UNIQUE (builder_id, name)
);

CREATE TABLE facade (
    facade_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    location_id UUID REFERENCES location(location_id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    dwelling_type_id UUID REFERENCES dwelling_type(dwelling_type_id) ON DELETE SET NULL,
    range_id UUID REFERENCES range(range_id) ON DELETE SET NULL,
    cost_type VARCHAR(20) CHECK (cost_type IN ('standard', 'upgrade')) DEFAULT 'standard',
    cost NUMERIC(12,2),
    builder_cost NUMERIC(12,2),
    image VARCHAR(500),
    status BOOLEAN DEFAULT TRUE,  -- Active / Inactive
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_facade_per_location UNIQUE (location_id, name)
);

CREATE TABLE floor_plan (
    floor_plan_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    min_land_width NUMERIC(8,2),
    min_land_depth NUMERIC(8,2),
    dwelling_area NUMERIC(10,2),  -- in sqm
    dwelling_type_id UUID REFERENCES dwelling_type(dwelling_type_id) ON DELETE SET NULL,
    beds INT,
    baths INT,
    carpark INT,
    living INT,
    range_id UUID REFERENCES range(range_id) ON DELETE SET NULL,
    location_id UUID REFERENCES location(location_id) ON DELETE SET NULL,
    garage_area NUMERIC(10,2),
    porch_area NUMERIC(10,2),
    alfresco_area NUMERIC(10,2),
    total_area NUMERIC(10,2),
    detailed_image VARCHAR(500),
    simple_image VARCHAR(500),
    description TEXT,
    location_id UUID REFERENCES location(location_id),
    status BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_floor_plan_per_builder UNIQUE (builder_id, name)
);

CREATE TABLE floor_plan_pricelist_item_map(
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  floor_plan_id UUID REFERENCES floor_plan(floor_plan_id) ON DELETE CASCADE,
  price_list_item_id UUID REFERENCES price_list_item(price_list_item_id) ON DELETE CASCADE,
  include_default BOOLEAN DEFAULT FALSE,
  modify BOOLEAN DEFAULT FALSE,
  quantity INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_floor_plan_pricelist_item_map UNIQUE (floor_plan_id, price_list_item_id)
);

CREATE TABLE floor_plan_facade_map(
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  floor_plan_id UUID REFERENCES floor_plan(floor_plan_id) ON DELETE CASCADE,
  facade_id UUID REFERENCES facade(facade_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_floor_plan_facade_map UNIQUE (floor_plan_id, facade_id)
);

CREATE TABLE estate (
    estate_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    street_name VARCHAR(150),
    city VARCHAR(100),
    state_id UUID REFERENCES state(state_id) ON DELETE SET NULL,
    country_id UUID REFERENCES country(country_id) ON DELETE SET NULL,
    zip VARCHAR(20),
    estate_logo VARCHAR(500),
    website VARCHAR(255),
    description TEXT CHECK (char_length(description) <= 4000),
    status BOOLEAN DEFAULT TRUE,
    featured BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_estate_per_builder UNIQUE (builder_id, name)
);

CREATE TABLE estate_images (
    estate_image_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    estate_id UUID REFERENCES estate(estate_id) ON DELETE CASCADE,
    image_url VARCHAR(500),
    uploaded_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE estate_documents (
    estate_document_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    estate_id UUID REFERENCES estate(estate_id) ON DELETE CASCADE,
    document_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    uploaded_by UUID REFERENCES users(users_id) ON DELETE SET NULL
);

CREATE TABLE estate_features (
    estate_feature_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    estate_id UUID REFERENCES estate(estate_id) ON DELETE CASCADE,
    feature_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (estate_id, feature_name)
);

CREATE TABLE estate_stages (
    estate_stage_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    estate_id UUID REFERENCES estate(estate_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    release_date DATE,
    attach_file TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (estate_id, name)
);

CREATE TABLE estate_stage_documents (
    estate_stage_document_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    estate_stage_id UUID REFERENCES estate_stages(estate_stage_id) ON DELETE CASCADE,
    document_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

--------------------------------------------------------------------------------------------------------------

CREATE TABLE drive(
  drive_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_construction_setting_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE construction_settings(
    construction_setting_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    suppliers_tradies_madatory_to_complete_checklist BOOLEAN DEFAULT FALSE,
    allow_checklist_even_supplier_tradies_not_responded BOOLEAN DEFAULT FALSE,
    show_warning_when_supplier_trade_booked_same_day_for_checklist BOOLEAN DEFAULT FALSE,
    sending_email_private_inspector_mandatory BOOLEAN DEFAULT FALSE,
    make_inspection_chacklist_mandatory BOOLEAN DEFAULT FALSE,
    include_weekend_date BOOLEAN DEFAULT FALSE,
    include_holiday_date BOOLEAN DEFAULT FALSE,
    include_onhold_date BOOLEAN DEFAULT FALSE,
    allow_stage_date_change BOOLEAN DEFAULT FALSE,
    default_lead_time_for_supplier_trade BOOLEAN DEFAULT FALSE,
    no_of_reminder_days INT DEFAULT 7,
    allow_move_next_stage_even_checklist_not_completed BOOLEAN DEFAULT FALSE,
    apply_changes_all_existing_jobs BOOLEAN DEFAULT FALSE,
    rebook_confrimed_bookings_on_date_changes BOOLEAN DEFAULT FALSE,
    send_email_when_stage_completed BOOLEAN DEFAULT FALSE,
    move_jobs_from_ready_for_construction_to_under_construction BOOLEAN DEFAULT FALSE,
    recalculate_stage_date_construction_days_when_deleys_captured BOOLEAN DEFAULT FALSE,
    enable_forcast_date BOOLEAN DEFAULT FALSE,
    number_of_days_site_start_from_title_date INT DEFAULT 90,
    label_for_permit_received_date VARCHAR(150),
    site_supervisor_roles UUID[] DEFAULT '{}',
    stage_completion_date VARCHAR(50) CHECK(stage_completion_date IN ('claim', 'move_to_next_page')) DEFAULT 'claim',
    admin_coordinator_roles UUID[] DEFAULT '{}',
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_construction_setting_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_construction_setting_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE construction_option(
    construction_option_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    option_name VARCHAR(255) NOT NULL,
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_construction_option_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
    CONSTRAINT uq_construction_option_option_name UNIQUE (company_id, builder_id, option_name)
);

CREATE TABLE compliance_type(
  compliance_type_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL, 
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE construction_checklist(
  construction_checklist_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  builder UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  construction_type_id UUID REFERENCES construction_type(construction_type_id) ON DELETE CASCADE,
  construction_stage_id UUID REFERENCES construction_stage(construction_stage) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  supplier_type_id UUID REFERENCES supplier_type(supplier_type_id) ON DELETE CASCADE,
  sort_order INT DEFAULT 1,
  data_required BOOLEAN DEFAULT TRUE,
  supplier BOOLEAN DEFAULT TRUE,
  claim BOOLEAN DEFAULT FALSE,
  dependent BOOLEAN DEFAULT FALSE,
  no_of_days INT DEFAULT 1,                 -- if data require is true then user can input in this field
  notify BOOLEAN DEFAULT FALSE,
  milestone BOOLEAN DEFAULT FALSE,
  attachment_mandatory BOOLEAN DEFAULT FALSE,
  attachment_mandatory_name VARCHAR(255),             -- if attachment mandatory is true then user input in this field
  cost_center_id UUID[] DEFAULT '{}',                        --REFERENCES cost_center(cost_center_id) ON DELETE SET NULL,
  construction_option_id UUID[] DEFAULT '{}',                      --REFERENCES construction_option(construction_option_id) ON DELETE CASCADE,
  compliance_type_id UUID REFERENCES compliance_type(compliance_type_id) ON DELETE SET NULL,
  po_folder_id UUID REFERENCES document_common_folder(document_common_folder_id) ON DELETE SET NULL,
  job_documents_folder_id UUID REFERENCES document_common_folder(document_common_folder_id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_construction_option_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE construction_checklist_predecessor(
  construction_checklist_predecessor_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  construction_checklist_id UUID NOT NULL REFERENCES construction_checklist(construction_checklist_id) ON DELETE CASCADE,
  predecessor_checklist_id UUID REFERENCES construction_checklist(construction_checklist_id) ON DELETE SET NULL,
  offset BOOLEAN DEFAULT FALSE,
  duration INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE construction_sub_checklist(
  construction_sub_checklist_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  construction_checklist_id UUID NOT NULL REFERENCES construction_checklist(construction_checklist_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  data_required BOOLEAN DEFAULT TRUE,
  no_of_days INT DEFAULT 0,
  sort_order INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE construction_inspection_checklist(
  construction_inspection_checklist_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  builder UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  construction_type_id UUID REFERENCES construction_type(construction_type_id) ON DELETE CASCADE,
  construction_stage_id UUID REFERENCES construction_stage(construction_stage) ON DELETE CASCADE,
  field_name VARCHAR(255) NOT NULL CHECK(field_name IN ('checklist', 'section')),
  description VARCHAR(500) NOT NULL,
  sort_order INT DEFAULT 1,
  construction_option_id UUID REFERENCES construction_option(construction_option_id) ON DELETE CASCADE,    -- if checklist in field_name
  section_id UUID REFERENCES construction_inspection_checklist(construction_inspection_checklist_id) ON DELETE CASCADE,      -- if checklist in field_name
  add_all_existing_jobs BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_construction_option_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE construction_ohs_settings (
  construction_ohs_settings_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  signature_required BOOLEAN DEFAULT FALSE,
  minimum_audits INT DEFAULT 0,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_ohs_set_scope CHECK (company_id IS NOT NULL OR builder_id IS NOT NULL)
);

CREATE TABLE construction_ohs_list (
  construction_ohs_list_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  construction_ohs_settings_id UUID
    REFERENCES construction_ohs_settings(construction_ohs_settings_id)
    ON DELETE CASCADE,
  field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('category', 'item')),
  field_name VARCHAR(100),
  description VARCHAR(500),
  sort_order INT DEFAULT 1,
  -- only used when field_type = 'item'
  parent_id UUID REFERENCES construction_ohs_list(construction_ohs_list_id) ON DELETE CASCADE,
  add_defaults BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_ohs_list_scope CHECK (company_id IS NOT NULL OR builder_id IS NOT NULL)
);

CREATE TABLE construction_ets_recharge(
  construction_ets_recharge_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  enable_ets_supplier BOOLEAN DEFAULT FALSE,
  enable_recharge_supplier BOOLEAN DEFAULT TRUE,
  signature_section BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_constrcution_ets_recharge_scope CHECK (company_id IS NOT NULL OR builder_id IS NOT NULL),
  CONSTRAINT uq_construction_ets_recharge_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE construction_ets_recharge_approval(
construction_ets_recharge_approval_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
construction_ets_recharge_id UUID NOT NULL REFERENCES construction_ets_recharge(construction_ets_recharge_id) ON DELETE CASCADE,
role_id UUID NOT NULL REFERENCES role(role_id) ON DELETE SET NULL,
amount NUMERIC(12, 2) NOT NULL,
created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
)

CREATE TABLE appointment(
  appointment_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location_id UUID REFERENCES location(location_id) ON DELETE SET NULL,
  link_to UUID,
  lead_id UUID REFERENCES leads(leads_id) ON DELETE SET NULL,
  select_users UUID[] DEFAULT '{}',
  notes VARCHAR(255),
  is_deleted BOOLEAN DEFAULT FALSE,
  send_appointment_customer BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_appointment_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE holiday(
  holiday_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  state UUID[] DEFAULT '{}',            -- from state_id
  holiday_start_date DATE NOT NULL,
  holiday_end_date DATE NOT NULL,
  holiday_description VARCHAR(500) NOT NULL,
  status BOOLEAN DEFAULT TRUE,          -- active / inactive
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_holiday_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE recalculate_date(
  recalculate_date_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  recalculate_workflow_job_estimated_dates BOOLEAN DEFAULT FALSE,
  recalculate_construction_job_estimated_dates BOOLEAN DEFAULT FALSE,
  capture_reason_rebooking_and_rebooking_email BOOLEAN DEFAULT FALSE,
  capture_text VARCHAR(500),
  recalculate_confirmed_booking_dates BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_recalculate_date_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL)),
  CONSTRAINT uq_recalculate_date_scope UNIQUE (company_id, builder_id)
);

CREATE TABLE color_type(
  color_type_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  color_type_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  CONSTRAINT chk_color_type_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE color(
  color_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  color_name VARCHAR(255) NOT NULL,
  sort_order INT DEFAULT 1,
  status BOOLEAN DEFAULT TRUE,    
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_color_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE color_category(
  color_category_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  color_id UUID NOT NULL REFERENCES color(color_id) ON DELETE CASCADE,
  category_name VARCHAR(255) NOT NULL,
  selection_type VARCHAR(100) CHECK (selection_type IN ('single', 'multiple')) DEFAULT 'multiple',
  sort_order INT DEFAULT 1,
  status BOOLEAN DEFAULT TRUE,                -- active / inactive
  suppliers UUID[] DEFAULT '{}',              --from supplier_id
  color_group UUID[] DEFAULT '{}',                  --from color_group
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE color_group(
  color_group_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  status BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_color_group_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE color_item(
  color_item_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  color_category_id UUID REFERENCES color_category(color_category_id) ON DELETE CASCADE,
  item_name VARCHAR(255) NOT NULL,
  item_code VARCHAR(100) NOT NULL,
  supplier_id UUID REFERENCES supplier(supplier_id) ON DELETE SET NULL,
  upgrade_option VARCHAR(50) CHECK(upgrade_option IN('fixed', 'start_from', 'tba')),
  cost_type VARCHAR(50) CHECK(cost_type IN ('standard', 'upgrade')) DEFAULT 'standard',
  cost NUMERIC (10,2),                   --if cost_type is upgrade
  features VARCHAR(500),
  description VARCHAR(500),
  specification_name VARCHAR(500),
  color_type_id UUID[] DEFAULT '{}',
  range_id UUID[] DEFAULT '{}',
  sort_order INT,
  units VARCHAR(50) CHECK(units IN('mandatory', 'non_mandatory', 'not_required')) DEFAULT 'non_mandatory',
  color_image JSONB DEFAULT '[]',
  specification JSONB DEFAULT '[]',
  status BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_color_item_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE color_item_custom_field(
  color_item_custom_field_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  color_item UUID REFERENCES color_item(color_item_id) ON DELETE CASCADE,
  field_type VARCHAR(255) CHECK(field_type IN('text', 'checkbox', 'dropdown_list', 'radio_button')),
  field_name VARCHAR(255),
  required_field BOOLEAN DEFAULT FALSE,
  sort_order INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE color_group_item_map(
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  color_group_id UUID REFERENCES color_group(color_group_id) ON DELETE CASCADE,
  color_item_id UUID REFERENCES color_item(color_item_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cost_center(
    cost_center_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
    builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
    code VARCHAR(100) NoT NULL,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(500),
    sort_order int DEFAULT 1,
    status BOOLEAN DEFAULT TRUE,         -- active or inactive
    created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_cost_center_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE cost_center_checklist_map(
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cost_center_id UUID NOT NULL REFERENCES cost_center(cost_center_id) ON DELETE CASCADE,
    construction_checklist_id UUID NOT NULL REFERENCES construction_checklist(construction_checklist_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_cost_center_checklist_map UNIQUE (cost_center_id, construction_checklist_id)
);

CREATE TABLE contract_format(
  contract_format_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  builder UUID REFERENCES builder(builder_id) ON DELETE SET NULL,
  format_name VARCHAR(255) NOT NULL,
  defualt_format BOOLEAN DEFAULT TRUE,
  status BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_contract_format_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE contract_section(
  contract_section_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  contract_format_id UUID REFERENCES contract_format(contract_format_id) ON DELETE CASCADE,
  section_name VARCHAR(255),
  sort_order INT DEFAULT 1,
  section_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_referral_partner(
  agent_referral_partner_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(users_id) ON DELETE SET NULL,
  address_id UUID REFERENCES address(address_id) ON DELETE SET NULL,
  account_name VARCHAR(255),
  account_bsb VARCHAR(255),
  account_number VARCHAR(255),
  abn VARCHAR(255),
  company_name VARCHAR(255),
  referred_user_id UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_agent_referral_partner_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE quotation_format(
  quotation_format_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  builder UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  logo_alignment VARCHAR(100) NOT NULL CHECK(logo_alignment IN("center", "left", "right")),
  logo_size_height DECIMAL(10, 2),
  logo_size_width DECIMAL(10,2),
  log pedding VARCHAR(255),
  show_job_address BOOLEAN DEFAULT FALSE,
  label_logo_size_height DECIMAL(10, 2),
  label_logo_size_width DECIMAL(10,2),
  -- custom foot table
  format_name VARCHAR(255),
  show_account VARCHAR(255) NOT NULL CHECK(show_account IN("company_account", "builder_account")),
  show_excel BOOLEAN DEFAULT FALSE,
  hide_logo_first_page BOOLEAN FALSE,
  watermark VARCHAR(500),                 --image
  default_facade VARCHAR(500)             --image
  draft_background BOOLEAN DEFAULT FALSE,
  hide_watermark BOOLEAN DEFAULT FALSE,
  status BOOLEAN DEFAULT TRUE,
  make_default BOOLEAN FALSE,
  include_package_price_list BOOLEAN DEFAULT FALSE,
  show-quotation_with_builder BOOLEAN DEFAULT FALSE,       -- if the show_account = company_account
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_quotation_format_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE master_section(
  master_section_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  master_name VARCHAR(255) NOT NULL,
  status BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_master_section_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE master_section_header(
  master_section_header_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  master_section UUID REFERENCES master_section(master_section_id) ON DELETE CASCADE,
  heading_name VARCHAR(255) NOT NULL,
  effective_start_date DATE,
  effective_end_date DATE,
  sort_order int DEFAULT 1,
  status BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE master_section_item(
  master_section_item_id UUID DEFAULT uuid_generate_v4(),
  master_section_header_id UUID REFERENCES master_section_header(master_section_header_id) ON DELETE CASCADE,
  item_name VARCHAR(2000) NOT NULL,
  effective_start_date DATE,
  effective_end_date DATE,
  sort_order int DEFAULT 1,
  status BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lot(
  lot_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,       -- need to decide that leads id of the lot can select in the house land and package
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  estate_id UUID REFERENCES estate(estate_id) ON DELETE CASCADE,                  -- in lot table add lead id for the create property/lot in the lead and quotation
  estate_stage_id UUID REFERENCES estate_stages(estate_stage_id) ON DELETE CASCADE,
  lot_number VARCHAR(255) NOT NULL,
  street VARCHAR(255) NOT NULL,
  city VARCHAR(255) NOT NULL,
  state_id UUID REFERENCES state(state_id) ON DELETE SET NULL,
  zip_code VARCHAR(10) NOT NULL,
  title_status VARCHAR(255),                  -- in this desicdde which status is 
  title_date DATE,
  lot_type VARCHAR(100),                  --  reguler or irregular DEFAULT reguler
  corner_block BOOLEAN,
  width_m NUMERIC(10,2),
  depth_m NUMERIC(10,2),
  size_m2 NUMERIC(10,2),
  price NUMERIC(10,2),
  site_fall_mm NUMERIC(10,2),
  land_fill_mm NUMERIC(10,2),
  total_size_m2 NUMERIC(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  CONSTRAINT chk_lot_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE lot_package_group(
  lot_package_group_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  group_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  CONSTRAINT chk_lot_package_group_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE lot_package(
  lot_package_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lot_id UUID REFERENCES lot(lot_id) ON DELETE CASCADE,
  package_name VARCHAR(255) NOT NULL,
  dwelling_type_id UUID REFERENCES dwelling_type(dwelling_type_id) ON DELETE SET NULL,
  range_id UUID REFERENCES range(range_id) ON DELETE SET NULL,
  lot_package_group_id UUID REFERENCES lot_package_group(lot_package_group_id) ON DELETE SET NULL,   -- this table is not use for now
  disclaimer VARCHAR(100),                              -- valid validity or standard
  floor_plan_id UUID REFERENCES floor_plan(floor_plan_id) ON DELETE SET NULL,
  facade_id UUID REFERENCES facade(facade_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL
);

CREATE TABLE house_feature(
  house_feature_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(3000),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  CONSTRAINT chk_house_feature_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE inclusion_package(
  inclusion_package_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  CONSTRAINT chk_inclusion_package_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE house_land_package(
  house_land_package_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  title VARCHAR(255),
  range_id UUID REFERENCES range(range_id) ON DELETE SET NULL,
  dwelling_type_id UUID REFERENCES dwelling_type(dwelling_type_id) ON DELETE SET NULL,
  template_id UUID REFERENCES template_email(template_email_id) ON DELETE SET NULL,                    -- need to decide which template is used
  contact_id UUID REFERENCES users(users_id) ON DELETE SET NULL,
  contact_show_pdf BOOLEAN,
  lot_id UUID REFERENCES lot(lot_id) ON DELETE SET NULL,
  price_type VARCHAR(100),                 -- valid esimate, fixed DEFAULT estimate
  floor_plan_id UUID REFERENCES floor_plan(floor_plan_id) ON DELETE SET NULL,
  floor_plan_description VARCHAR(1000),            -- if the floor plan select then user can input description if not then can not input it is optional
  facade_id UUID REFERENCES facade(facade_id) ON DELETE SET NULL,
  package_group_id UUID REFERENCES lot_package_group(lot_package_group_id) ON DELETE SET NULL,
  package_description VARCHAR(3000),
  house_feature_id UUID REFERENCES house_feature(house_feature_id) ON DELETE SET NULL,
  disclaimer_type VARCHAR(255),              -- standard and other type to decide
  disclaimer_description VARCHAR(3000),
  attach_files VARCHAR(500),                   -- attach pdf
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  CONSTRAINT chk_house_land_package_scope CHECK ((company_id IS NOT NULL) OR (builder_id IS NOT NULL))
);

CREATE TABLE h_l_package_lot_package_map(
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  house_land_package_id UUID REFERENCES house_land_package(house_land_package_id) ON DELETE CASCADE,
  lot_package_id UUID REFERENCES lot_package(lot_package_id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,                -- this table is not use for now
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE h_l_package_pricelist_item_map(
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  house_land_package_id UUID REFERENCES house_land_package(house_land_package_id) ON DELETE CASCADE,
  price_list_item_id UUID REFERENCES price_list_item(price_list_item_id) ON DELETE CASCADE,
  quantity NUMERIC(12,2),
  total_price NUMERIC(12,2),
  note VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE h_l_package_commission_map(
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  house_land_package_id UUID REFERENCES house_land_package(house_land_package_id) ON DELETE CASCADE,
  job_commission_id UUID REFERENCES job_commission(job_commission_id) ON DELETE CASCADE,
  total_commission NUMERIC(12,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

--  make one api for the transfer, on hold , blocklist, convert to opportunity, send welcome letter
-- make one api for the delete
CREATE TABLE leads (
  leads_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,

  reference_number VARCHAR(30) NOT NULL,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,

  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  notes VARCHAR(1000),
  send_letter BOOLEAN DEFAULT FALSE,

  house_land_package_id UUID REFERENCES house_land_package(house_land_package_id) ON DELETE SET NULL,
  property_detail_id UUID REFERENCES property_detail(property_detail_id) ON DELETE SET NULL,   

  lead_source_id UUID REFERENCES lead_source(lead_source_id) ON DELETE SET NULL,

  status VARCHAR(20) DEFAULT 'new',                -- valid new, working, convert
  -- opportunity_notes VARCHAR(1000),                 -- remove this
  -- outcome VARCHAR(10), -- Won / Lost               -- make different api for won/lost     // also remove this
  
  rating VARCHAR(150),              -- none, hot, cold, warm
  land VARCHAR(150),                  -- none, no, yes
  finance VARCHAR(150),               -- none, no, yes
  face_to_face VARCHAR(150),         -- none, yes, no
  purpose VARCHAR(150),             -- none, own house, investment property
  client_type_id UUID REFERENCES client_type(client_type_id) ON DELETE SET NULL,
  forcast_close DATE,

  build_budget NUMERIC(10,2),
  region_id UUID REFERENCES state(state_id) ON DELETE SET NULL,
  prelim_agreement DATE,
  client_profile VARCHAR(500),
  h_l_budget NUMERIC(10,2),
  assignee_id UUID REFERENCES users(users_id),
  assignee_note VARCHAR(500),
  lead_lost_reason_id UUID REFERENCES lead_lost_reason(lead_lost_reason_id) ON DELETE SET NULL,
  lead_lost_comment VARCHAR(1000),
  structure_engineer_id UUID REFERENCES structure_engineer(structure_engineer_id) ON DELETE SET NULL,
  structure_report_file VARCHAR(500),
  created_by UUID REFERENCES users(users_id),
  updated_by UUID REFERENCES users(users_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE opportunity(
  opportunity_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  leads_id UUID REFERENCES leads(leads_id) ON DELETE CASCADE,
  opportunity_notes VARCHAR(1000),
  status VARCHAR(252),                                -- valid  Proposal, negotiation, closed
  out_come VARCHAR(10), -- Won / Lost               -- make different api for won/lost
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE job(
  job_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  reference_number VARCHAR(30) NOT NULL,
  opportunity_id UUID REFERENCES opportunity(opportunity_id) ON DELETE CASCADE,
  quotation_version_id UUID REFERENCES quotation_versions(quotation_version_id) ON DELETE SET NULL,
  job_note VARCHAR(1000),
  send_email BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leads_contact_map(
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  leads_id UUID REFERENCES leads(leads_id) ON DELETE CASCADE,
  contact_id UUID REFERENCES users(users_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CREATE TABLE property(  
--   property_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   -- leads_id UUID REFERENCES leads(leads_id) ON DELETE CASCADE,
--   lot_no INTEGER,
--   street_no INTEGER,
--   address_id UUID REFERENCES address(address_id) ON DELETE SET NULL,
--   estate_name VARCHAR(255),
--   title_status VARCHAR(255),         --  ('ESTIMATED', 'ACTUAL')
--   title_date DATE,
--   compaction_report VARCHAR(255),     -- ('AVAILABLE', 'NOT_AVAILABLE')
--   land_type,                          -- ('REGULAR', 'IRREGULAR')
--   width_m NUMERIC(10,2),
--   depth_m NUMERIC(10,2),           -- video new lead to won lead:  22:41
--   total_size_m2 NUMERIC(10,2),
--   site_fall_mm NUMERIC(10,2),
--   land_fill_mm NUMERIC(10,2),
--   bush_fire BOOLEAN,
--   corner_block BOOLEAN,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

CREATE TABLE job_form(
  job_form_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  leads_id UUID REFERENCES leads(leads_id) ON DELETE CASCADE,
  street_name VARCHAR(255) NOT NULL,
  land_developer VARCHAR(255),
  council VARCHAR(255),
  title_volume VARCHAR(255),
  folio VARCHAR(255),
  plan_subdivision VARCHAR(255),
  site_fall VARCHAR(255),          --   valid under_1_m, 1_2_m, 2_3_m, above_3_m
  existing_tree BOOLEAN,
  driveaway_location VARCHAR(255),          -- valid front_left, front_right, rear_side
  any_sewer_tie BOOLEAN,
  easements BOOLEAN,
  buildup_area_easements BOOLEAN,
  build_zone VARCHAR(255),                        -- valid north_west, south_east, north, west
  story_id UUID REFERENCES dwelling_type(dwelling_type_id) ON DELETE SET NULL,
  finished_surface_m NUMERIC(10,2),
  existing_surface_m NUMERIC(10,2),
  filled_area_fill_m NUMERIC(10,2),
  max_fill_location VARCHAR(255),               -- valid front_left, front_right, rear_left, rear_right
  max_finished_surface_m NUMERIC(10,2),
  min_finished_surface_m NUMERIC(10,2),
  engineering_fall_m NUMERIC(10,2),  
  fall_type VARCHAR(255),                       -- valid front_to_rear, rear_to_front, diagonal_front_to_rear, diagonal_rear_to_front
  ceiling_height NUMERIC(10,2),
  eaves_location VARCHAR(255),
  lot_type VARCHAR(255),                   -- valid under_300_m2 or over_300_m2
  site_coverage_allowed VARCHAR(255),          -- vlid less_then_60 or 60 or 70 or 80 or 90
  eaves_size VARCHAR(255),                   -- valid 450 mm or 600 mm
  eaves_return VARCHAR(255)[],                -- valid 2_m, 3_m, 4_m, all_around, side_only, n_a 
  roof_covering VARCHAR(255)[],          -- valid concrete_tiles, standard, simline, flat, colorbond_roof, with_blanket, with_sarking 
  roof_pitch VARCHAR(255),               -- valid 15, 18, 20, 22.5, 25
  flat_roof_pitch VARCHAR(255),            -- valid 5
  parapet_wall VARCHAR(255),              -- valid front_only, all_around, n_a
  single_story VARCHAR(255),            -- valid brick, hebel,
  double_story_gf VARCHAR(255),             -- valid brick, hebel
  double_story_ff VARCHAR(255),         --  valid brick, poly, hebel
  wall_over_garage VARCHAR(255),         -- valid brick, poly, hebel
  wall_over_lower_roof VARCHAR(255),         -- valid poly, xon_cladding, whetherboard
  all_electric BOOLEAN,
  type_of_cooling VARCHAR(255),
  garage_door_type VARCHAR(255),
  connection VARCHAR(255),                -- nbn, opticom
  recycled_water BOOLEAN,
  extra_requirement VARCHAR(255)[],            -- valid rainwater_tank, solar_hot_water, heat_pump
  three_phase BOOLEAN,
  driveway VARCHAR(255),                   -- valid by_client, by_builder
  front_wall VARCHAR(255),
  between_garage_building VARCHAR(255),
  garage_side VARCHAR(255),
  other_side VARCHAR(255),
  rear VARCHAR(255),
  allowed_porch_encroachment VARCHAR(255),
  boundry_build BOOLEAN,
  boundry_construction BOOLEAN,
  double_story_front_wall VARCHAR(255),
  double_story_garage_side VARCHAR(255),
  double_story_other_side VARCHAR(255),
  double_story_rear VARCHAR(255),
  double_story_balcony_encroachment VARCHAR(255),
  facade_material_requirement JSONB DEFAULT '{}'::jsonb,         --  in this json user have to input material name and percentage value, max 3 reocrd input
  raised_porch_facade BOOLEAN,
  parapet_walls_pitch_roof BOOLEAN,
  parapet_walls_tray_deck_roof BOOLEAN,
  concept_inspiration BOOLEAN,
  plan_subdivision_engineering BOOLEAN,
  memorandum_common_provisions BOOLEAN,
  developer_guidelines BOOLEAN,
  contact_for_sale BOOLEAN,
  variational_list BOOLEAN,
  special_job_notes VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE business_contact (
    business_contact_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    leads_id UUID REFERENCES leads(leads_id) ON DELETE CASCADE,

    contact_type VARCHAR(50) CHECK(contact_type IN ('company', 'conveyancer', 'mortgage_broker', 'financer')) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    address1 VARCHAR(255),
    address2 VARCHAR(255),
    city VARCHAR(255),
    zip_code VARCHAR(10),
    country_id UUID REFERENCES country(country_id) ON DELETE SET NULL,
    state_id UUID REFERENCES state(state_id) ON DELETE SET NULL,
    abn_number VARCHAR(20),
    acn_number VARCHAR(20),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quotation(
  quotation_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  leads_id UUID REFERENCES leads(leads_id) ON DELETE CASCADE,
  reference_number VARCHAR(30),                            --- need to decide contat update un quotatio  or not
  is_hl_package_quotation BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL
);

-- when the user not select dwellingype then user can not select foorplan, facade, in quotation version
-- when the user update range or dwelling type that time remove the facade, floorplan, package, pricelist item , template which ar selected
CREATE TABLE quotation_version(
  quotation_version_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quotation_id UUID REFERENCES quotation(quotation_id) ON DELETE CASCADE,
  quotation_version_no INT,
  location_id UUID REFERENCES location(location_id) ON DELETE SET NULL, 
  range_id UUID REFERENCES range(range_id) ON DELETE SET NULL,
  dwelling_type_id UUID REFERENCES dwelling_type(dwelling_type_id) ON DELETE SET NULL,
  floor_plan_id UUID REFERENCES floor_plan(floor_plan_id) ON DELETE SET NULL,
  facade_id UUID REFERENCES facade(facade_id) ON DELETE SET NULL,
  package_id UUID REFERENCES package(package_id) ON DELETE SET NULL,
  facade_price NUMERIC(12, 2) DEFAULT 0,
  is_approve BOOLEAN DEFAULT FALSE,
  sketch_number NUMERIC(10,2),               -- if the is approve true then user can input sketch number
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CREATE TABLE quotation_version_package_map(
--   id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
--   quotation_version_id UUID REFERENCES quotation_version(quotation_version_id) ON DELETE CASCADE,
--   package_id UUID REFERENCES package(package_id) ON DELETE CASCADE,
--   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- when the location and dwelling type select then user can select priclist item in quotation version
CREATE TABLE quotation_version_pricelist_item_map(
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quotation_version_id UUID REFERENCES quotation_version(quotation_version_id) ON DELETE CASCADE,
  price_list_item_id UUID REFERENCES price_list_item(price_list_item_id) ON DELETE CASCADE,
  quantity NUMERIC(12,2),
  note VARCHAR(500),
  total_price NUMERIC(12,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE quotation_version_custom_section(
  custom_section_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quotation_version_id UUID REFERENCES quotation_version(quotation_version_id) ON DELETE CASCADE,
  file_url VARCHAR(500),
  sort_order INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoice(
  invoice_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  leads_id UUID REFERENCES leads(leads_id) ON DELETE CASCADE,
  reference_number VARCHAR(30),
  generate_invoice BOOLEAN DEFAULT FALSE, 
  invoice_date DATE,                         
  due_date DATE,
  invoice_amount NUMERIC(12,2),
  deposite_date DATE,
  deposite_amount NUMERIC(12,2),
  payment_method VARCHAR(50),                   -- valid cash, cheque, personal_online_transfer, loan_online_transfer, EFTPOS
  transaction_no VARCHAR(20),
  description VARCHAR(500),
  status VARCHAR(100),                         -- valid paid, draft, unsent, sent, ready
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE property_detail(
  property_detail_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lot_id UUID REFERENCES lot(lot_id) ON DELETE SET NULL,
  lot_number VARCHAR(255),
  street VARCHAR(255),
  address_line_1 VARCHAR(255),
  address_line_2 VARCHAR(255),
  city VARCHAR(255),
  state_id UUID REFERENCES state(state_id) ON DELETE SET NULL,
  country_id UUID REFERENCES country(country_id) ON DELETE SET NULL,
  zip_code VARCHAR(10),
  estate_id UUID REFERENCES estate(estate_id) ON DELETE CASCADE,                  
  estate_stage_id UUID REFERENCES estate_stages(estate_stage_id) ON DELETE CASCADE,
  estate_name VARCHAR(255),
  title_status VARCHAR(255),         --  ('ESTIMATED', 'ACTUAL')
  title_date DATE,
  compaction_report VARCHAR(255),     -- ('AVAILABLE', 'NOT_AVAILABLE')
  land_type VARCHAR(255),                          -- ('REGULAR', 'IRREGULAR')
  width_m NUMERIC(10,2),
  depth_m NUMERIC(10,2),           -- video new lead to won lead:  22:41
  total_size_m2 NUMERIC(10,2),
  site_fall_mm NUMERIC(10,2),
  land_fill_mm NUMERIC(10,2),
  price NUMERIC(10,2),
  bush_fire BOOLEAN,
  corner_block BOOLEAN,
  is_hl_package_lot BOOLEAN,
  compaction_report_url VARCHAR(500),
  compaction_report_content JSONB,
  clearing_date DATE,
  compaction_report_provider VARCHAR(255),  -- valid self, builder
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE actions(
  action_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  leads_id UUID REFERENCES leads(leads_id) ON DELETE CASCADE,
  action_type VARCHAR(50) CHECK (action_type IN ('task', 'note', 'appointment', 'sms')) NOT NULL,

  description VARCHAR(500),
  notes_tag_id UUID[] DEFAULT '{}',
  send_to_customer BOOLEAN,
  create_follow_up_task BOOLEAN,
  attach_file VARCHAR(500),

  users_id UUID[] DEFAULT '{}',
  
  name VARCHAR(255),
  due_date DATE,
  end_date DATE,
  location_id UUID REFERENCES location(location_id) ON DELETE SET NULL,
  start_time TIME,
  end_time TIME,

  priority VARCHAR(255),             -- valid low, medium, high
  status VARCHAR(255),          -- valid completed, yet_to_start, in_progress, skipped, cancelled
  link_to_user UUID REFERENCES users(users_id) ON DELETE SET NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes(
  notes_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  leads_id UUID REFERENCES leads(leads_id) ON DELETE CASCADE,
  description VARCHAR(500),
  note_tag_id UUID[] DEFAULT '{}',
  send_to_customer BOOLEAN DEFAULT FALSE,
  create_follow_up_task BOOLEAN DEFAULT FALSE,
  task_id UUID REFERENCES task(task_id) ON DELETE SET NULL,
  attach_file VARCHAR(500),
  note_type VARCHAR(255),            -- valid send, reply
  parent_note_id UUID REFERENCES notes(notes_id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sms(
  sms_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  leads_id UUID REFERENCES leads(leads_id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(users_id) ON DELETE SET NULL,
  message VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lead_activity_log(
  lead_activity_log_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  leads_id UUID REFERENCES leads(leads_id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(users_id) ON DELETE SET NULL,
  module VARCHAR(255), -- lead, contact, task, email, etc.
  module_id UUID,     -- specific record (lead_id, contact_id)
  record_name VARCHAR(255), -- Name of the record (e.g. "SMS Welcome")
  action VARCHAR(255), -- CREATE, UPDATE, DELETE, etc.
  field_name VARCHAR(255), 
  old_value TEXT,          -- before change
  new_value TEXT,          -- after change
  description TEXT, -- human-readable message
  metadata JSONB, -- extra info
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_log_lead_created 
ON lead_activity_log(leads_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_module_id 
ON lead_activity_log(module_id);

CREATE INDEX IF NOT EXISTS idx_activity_log_module 
ON lead_activity_log(module);

CREATE TABLE structure_engineer(
  structure_engineer_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  builder_id UUID REFERENCES builder(builder_id) ON DELETE CASCADE,
  company_id UUID REFERENCES company(company_id) ON DELETE CASCADE,
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(255),
  address VARCHAR(500),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(users_id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(users_id) ON DELETE SET NULL
);

CREATE TABLE quotation_version_items (
  quotation_version_item_id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quotation_version_id UUID REFERENCES quotation_version(quotation_version_id) ON DELETE CASCADE NOT NULL,
  price_list_id UUID NOT NULL,
  price_list_name VARCHAR(100) NOT NULL,
  price_list_item_id UUID DEFAULT NULL,
  price_list_item_description TEXT DEFAULT NULL,
  price_list_item_short_description VARCHAR(255) DEFAULT NULL,
  price_list_item_cost_type cost_type VARCHAR(50) DEFAULT NULL,
  price_list_item_cost_type_text VARCHAR(255) DEFAULT NULL,
  price_list_item_cost_option cost_option VARCHAR(50) DEFAULT NULL,
  price_list_item_cost NUMERIC(12, 2) DEFAULT NULL,
  price_list_item_builder_cost NUMERIC(12, 2) DEFAULT NULL,
  price_list_item_sort_order INT DEFAULT NULL,
  price_list_item_uom VARCHAR(50) DEFAULT NULL,
  price_list_item_status VARCHAR(20) DEFAULT NULL,
  price_list_item_include_by_default BOOLEAN DEFAULT NULL,
  price_list_item_allow_remove_from_quotation BOOLEAN DEFAULT NULL,
  price_list_item_show_in_hl_package BOOLEAN DEFAULT NULL,
  price_list_item_package_only BOOLEAN DEFAULT NULL,
  price_list_item_range_id UUID[] DEFAULT '{}',
  price_list_item_dwelling_type_id UUID[] DEFAULT '{}',
  price_list_item_created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  price_list_item_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  extra_type VARCHAR(50) DEFAULT NULL,
  extra_item BOOLEAN DEFAULT FALSE,
  package_id UUID DEFAULT NULL,
  package_name VARCHAR(200) DEFAULT NULL,
  package_cost NUMERIC(12,2) DEFAULT NULL,
  package_builder_cost NUMERIC(12,2) DEFAULT NULL,
  quantity NUMERIC(12,2) DEFAULT NULL,
  note VARCHAR(500) DEFAULT NULL,
  total_price NUMERIC(12,2) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
