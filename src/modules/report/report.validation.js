import Joi from "joi";

// Accept a value that is either a single string or an array of strings, always
// normalising to an array (query params arrive as either depending on count).
const stringOrArray = Joi.alternatives()
  .try(Joi.array().items(Joi.string()), Joi.string())
  .custom((value) => (Array.isArray(value) ? value : [value]));

const CREATED_AT_RANGES = [
  "last_15_minutes", "last_1_hour", "last_2_hours", "last_24_hours",
  "today", "yesterday", "last_7_days", "last_15_days", "last_30_days",
];

// Boolean flag that also accepts the "true"/"false" strings query params carry.
const boolFlag = Joi.alternatives().try(Joi.boolean(), Joi.string().valid("true", "false"));

export const focusReportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  status: Joi.string().optional(),
  rating: stringOrArray.optional(),
  lead_source_id: stringOrArray.optional(),
  client_type_id: Joi.string().uuid().optional(),
  region_id: Joi.string().uuid().optional(),
  assignee_id: stringOrArray.optional(),
  dwelling_type_id: Joi.string().uuid().optional(),
  // Per-column text filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  name: Joi.string().allow("").optional(),
  email: Joi.string().allow("").optional(),
  contact: Joi.string().allow("").optional(),
  property_address: Joi.string().allow("").optional(),
  created_at: Joi.string().valid(...CREATED_AT_RANGES).optional(),
  created_from: Joi.date().iso().optional(),
  created_to: Joi.date().iso().optional(),
  updated_at: Joi.string().valid(...CREATED_AT_RANGES).optional(),
  updated_from: Joi.date().iso().optional(),
  updated_to: Joi.date().iso().optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const quotationReportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  status: Joi.string().valid("Approved", "Draft", "approved", "draft").optional(),
  lead_source_id: stringOrArray.optional(),
  assignee_id: stringOrArray.optional(),
  created_at: Joi.string().valid(...CREATED_AT_RANGES).optional(),
  created_from: Joi.date().iso().optional(),
  created_to: Joi.date().iso().optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  lead_job_ref: Joi.string().allow("").optional(),
  name: Joi.string().allow("").optional(),
  email: Joi.string().allow("").optional(),
  phone: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const floorPlanReportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  mode: Joi.string().valid("floor_plan", "facade").default("floor_plan"),
  type: Joi.string().valid("all", "sales", "job").default("all"),
  period: Joi.string().valid("current_month", "last_month", "last_3_months", "last_6_months", "last_1_year", "custom").optional(),
  created_from: Joi.date().iso().optional(),
  created_to: Joi.date().iso().optional(),
  dwelling_type_id: Joi.string().uuid().optional(),
  range_id: Joi.string().uuid().optional(),
  // Per-column search boxes.
  reference: Joi.string().allow("").optional(),
  customer_name: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  quotation_id: Joi.string().allow("").optional(),
  floor_plan: Joi.string().allow("").optional(),
  facade: Joi.string().allow("").optional(),
  assignee_id: stringOrArray.optional(),
  search: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const noActionReportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  status: Joi.string().optional(),
  lead_source_id: stringOrArray.optional(),
  assignee_id: stringOrArray.optional(),
  created_at: Joi.string().valid(...CREATED_AT_RANGES, "last_3_months", "last_6_months", "last_1_year").optional(),
  created_from: Joi.date().iso().optional(),
  created_to: Joi.date().iso().optional(),
  include_on_hold: boolFlag.optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  name: Joi.string().allow("").optional(),
  email: Joi.string().allow("").optional(),
  contact: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const performanceReportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  role_id: Joi.string().uuid().optional(),
  user_id: Joi.string().uuid().optional(),
  period: Joi.string().valid(
    "today", "yesterday", "last_7_days", "last_15_days", "last_30_days",
    "this_month", "last_month", "last_3_months", "last_6_months", "last_1_year", "custom",
  ).optional(),
  start_date: Joi.date().iso().optional(),
  end_date: Joi.date().iso().optional(),
  show_updated: boolFlag.optional(),
  show_customer_meeting_only: boolFlag.optional(),
  list_report: Joi.string().valid("none", "lead", "opportunities", "quotation", "sales", "meeting").optional(),
  include_cancelled_jobs: boolFlag.optional(),
  include_archived_jobs: boolFlag.optional(),
}).unknown(false);

export const workflowStatusQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  dwelling_type_id: Joi.string().uuid().optional(),
  assignee_id: stringOrArray.optional(),
  lead_source_id: stringOrArray.optional(),
  supervisor_id: stringOrArray.optional(),
  completion_from: Joi.date().iso().optional(),
  completion_to: Joi.date().iso().optional(),
  include_cancelled_jobs: boolFlag.optional(),
  include_archived_jobs: boolFlag.optional(),
  include_completed_jobs: boolFlag.optional(),
  include_workflow_completed_jobs: boolFlag.optional(),
  // JSON-encoded array of { taskName, stageName?, status, op? } conditions.
  conditions: Joi.string().optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const maintenanceSummaryQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  supervisor_id: stringOrArray.optional(),
  status: Joi.string().valid("readyformaintenance", "undermaintenance", "completed").optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  customer_name: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
  maintenance_id: Joi.string().uuid().optional(),
}).unknown(false);

export const maintenanceDetailedQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  supervisor_id: stringOrArray.optional(),
  status: Joi.string().valid("Pending", "On Hold", "Completed").optional(),
  supplier: Joi.string().allow("").optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  customer_name: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
  maintenance_id: Joi.string().uuid().optional(),
}).unknown(false);

export const noActionJobsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  status: Joi.string().optional(),
  assignee_id: stringOrArray.optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  name: Joi.string().allow("").optional(),
  email: Joi.string().allow("").optional(),
  contact: Joi.string().allow("").optional(),
  property_address: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

// days / status_filter / include_date default to Settings → Job → Settings
// ("Customize The Job Status Report And Email"); passing them overrides it for
// this request only.
export const jobStatusReportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  days: Joi.number().integer().min(1).optional(),
  status_filter: Joi.string().valid("all", "completed", "incompleted").optional(),
  include_date: Joi.boolean().optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("asc"),
}).unknown(false);

// Defaults come from `job_settings.milestone_status_check_days`.
export const milestoneStatusReportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  days: Joi.number().integer().min(1).optional(),
  status_filter: Joi.string().valid("all", "completed", "incompleted").optional(),
  include_date: Joi.boolean().optional(),
  reference: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  milestone: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("asc"),
}).unknown(false);

export const customerStatusQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  status: Joi.string().optional(),
  assignee_id: stringOrArray.optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  customer_name: Joi.string().allow("").optional(),
  phone: Joi.string().allow("").optional(),
  email: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  lead_source: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const contractReportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  supervisor_id: stringOrArray.optional(),
  signed: boolFlag.optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  customer_name: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  email: Joi.string().allow("").optional(),
  phone: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const extensionNoticeQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  reason: Joi.string().valid("Private Inspection", "Materials", "Weather", "Variation", "Permits", "Others").optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  customer_name: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const invoicePaymentQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  status: Joi.string().optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  name: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  invoice_description: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const costSummaryQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  customer_name: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  agent_name: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const landTitleForecastQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  title_status: Joi.string().optional(),
  dwelling_type_id: Joi.string().uuid().optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  customer_name: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  builder_name: Joi.string().allow("").optional(),
  estate_name: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("asc"),
}).unknown(false);

export const surveyReportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  status: Joi.string().valid("Sent", "Opened", "Completed").optional(),
  survey_template_id: Joi.string().uuid().optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  submitted_by: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const variationReportQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(200).default(25),
  search: Joi.string().allow("").optional(),
  status: Joi.string().optional(),
  supervisor_id: stringOrArray.optional(),
  // Per-column text search filters (in addition to the global `search`).
  reference: Joi.string().allow("").optional(),
  name: Joi.string().allow("").optional(),
  job_address: Joi.string().allow("").optional(),
  description: Joi.string().allow("").optional(),
  created_user: Joi.string().allow("").optional(),
  sort_by: Joi.string().optional(),
  sort_order: Joi.string().valid("asc", "desc", "ASC", "DESC").default("desc"),
}).unknown(false);

export const saveReportColumnsSchema = Joi.object({
  applyToAll: Joi.boolean().default(false),
  columns: Joi.array()
    .items(
      Joi.object({
        key: Joi.string().required(),
        label: Joi.string().allow("").optional(),
        visible: Joi.boolean().optional(),
        order: Joi.number().integer().min(0).optional(),
        width: Joi.number().integer().min(20).max(2000).optional(),
      }).unknown(true),
    )
    .min(1)
    .required(),
}).unknown(false);
