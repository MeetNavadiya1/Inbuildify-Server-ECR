/**
 * RBAC source-of-truth constants — derived from RBAC_Design_Document.pdf v1.0.
 *
 * Three things live here:
 *  1. The 20 role names + their tier and tenant-scope rule (Sections 2 & 6).
 *  2. The role-creation matrix — who can create whom (Section 3.1).
 *  3. The module permission matrix — per-role CRUD per module (Section 4).
 *
 * Everything else (middleware, seeders, helpers) reads from this file. If a
 * permission rule changes, change it here and re-run the seed migration.
 */

// ─── Roles ──────────────────────────────────────────────────────────────────

export const ROLES = Object.freeze({
  // Tier 1 — Platform
  SUPER_ADMIN: "Super Admin",

  // Tier 2 — Company / Builder admins
  COMPANY_ADMINISTRATOR: "Company Administrator",
  MH_COMPANY_ADMIN: "MH - Company Admin",
  MY_HOME_COMPANY_ADMIN: "My Home - Company Admin",
  MY_HOME_ADMIN: "My Home Admin",
  BUILDER: "Builder",
  ADMIN_EXECUTIVE: "Admin Executive",
  CONTRACT_ADMIN: "Contract Admin",

  // Tier 3 — Operational
  SALES_MANAGER: "Sales Manager",
  SALES_MANAGER_MH: "Sales Manager - MH",
  SALES_EXECUTIVE: "Sales Executive",
  CONSTRUCTION_MANAGER: "Construction Manager",
  CONSTRUCTION_MANAGER_MH: "Construction Manager - MH",
  SITE_SUPERVISOR: "Site Supervisor",
  PERMITS: "Permits",
  COLOR_CONSULTANT: "Color Consultant",
  DRAFT_PERSON: "Draft Person",
  ACCOUNTS: "Accounts",
  AGENT: "Agent",
  CONTACT: "Contact",
});

export const ALL_ROLES = Object.freeze(Object.values(ROLES));

// ─── Tiers & scopes (Section 6) ─────────────────────────────────────────────

export const ROLE_TIERS = Object.freeze({
  [ROLES.SUPER_ADMIN]: 1,

  [ROLES.COMPANY_ADMINISTRATOR]: 2,
  [ROLES.MH_COMPANY_ADMIN]: 2,
  [ROLES.MY_HOME_COMPANY_ADMIN]: 2,
  [ROLES.MY_HOME_ADMIN]: 2,
  [ROLES.BUILDER]: 2,
  [ROLES.ADMIN_EXECUTIVE]: 2,
  [ROLES.CONTRACT_ADMIN]: 2,

  [ROLES.SALES_MANAGER]: 3,
  [ROLES.SALES_MANAGER_MH]: 3,
  [ROLES.SALES_EXECUTIVE]: 3,
  [ROLES.CONSTRUCTION_MANAGER]: 3,
  [ROLES.CONSTRUCTION_MANAGER_MH]: 3,
  [ROLES.SITE_SUPERVISOR]: 3,
  [ROLES.PERMITS]: 3,
  [ROLES.COLOR_CONSULTANT]: 3,
  [ROLES.DRAFT_PERSON]: 3,
  [ROLES.ACCOUNTS]: 3,
  [ROLES.AGENT]: 3,
  [ROLES.CONTACT]: 3,
});

// ─── Who may see the seeded demo dataset ────────────────────────────────────

/**
 * The roles the sample data exists FOR.
 *
 * The demo dataset is there so a builder setting the account up has something to
 * look at — leads, jobs, a colour catalogue — before any of their own work
 * exists. It was never meant to reach the people doing that work: a Colour
 * Consultant opening a job sees the demo colour catalogue copied into it and has
 * no way to tell which of those items the builder actually stocks, and a Sales
 * Executive's pipeline is padded out with leads no one will ever call.
 *
 * So it is shown to the people who administer the account — who can also clear
 * it from Settings → Sample Data — and hidden from everyone else. Not a
 * permission in the MODULE_PERMISSIONS sense: this is not "may they read leads",
 * it is "are these particular rows part of their working set at all", which is
 * why it is a role list rather than a module entry.
 *
 * Super Admin is included because platform support has to be able to see what
 * the account is actually holding when a builder asks about it.
 *
 * Deliberately NOT the whole of tier 2: Admin Executive and Contract Admin sit
 * at that tier but are staff doing the day-to-day work, not the people who own
 * the account's setup.
 */
export const SAMPLE_DATA_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.COMPANY_ADMINISTRATOR,
  ROLES.MH_COMPANY_ADMIN,
  ROLES.MY_HOME_COMPANY_ADMIN,
  ROLES.MY_HOME_ADMIN,
  ROLES.BUILDER,
]);

const SAMPLE_DATA_ROLE_SET = new Set(SAMPLE_DATA_ROLES);

/**
 * May this user look at seeded demo rows?
 *
 * Takes the user rather than just the role name because of `root_user`: the
 * Company Administrator created by /company-signup owns the account outright,
 * and is the person the import is run for, but their role row is assigned
 * afterwards — so during onboarding the name alone answers "no" for the one
 * person the demo data is most for.
 *
 * @param {object|null} user  req.user, or null outside a request
 * @param {string|null} roleName  resolved from user.role_id by the caller
 */
export const canViewSampleData = (user, roleName) =>
  user?.root_user === true || SAMPLE_DATA_ROLE_SET.has(roleName);

/** Scope kinds — used by scopeBuilder + rowScope to decide query filters. */
export const SCOPES = Object.freeze({
  PLATFORM: "platform",          // no tenant filter
  COMPANY: "company",            // company_id only
  BUILDER: "builder",            // builder_id (within parent company)
  ASSIGNED: "assigned",          // row-level: assigned_to = self
  SITE_ASSIGNED: "site_assigned", // row-level: supervisor_id = self
  JOB_ASSIGNED: "job_assigned",  // row-level: present in job assignment table
  SELF: "self",                  // row-level: created_by / referred_by = self
  JOB_ONLY: "job_only",          // contact: only their own job
});

export const ROLE_SCOPES = Object.freeze({
  [ROLES.SUPER_ADMIN]: SCOPES.PLATFORM,

  [ROLES.COMPANY_ADMINISTRATOR]: SCOPES.COMPANY,
  [ROLES.MH_COMPANY_ADMIN]: SCOPES.COMPANY,
  [ROLES.MY_HOME_COMPANY_ADMIN]: SCOPES.COMPANY,
  [ROLES.MY_HOME_ADMIN]: SCOPES.COMPANY,

  [ROLES.BUILDER]: SCOPES.BUILDER,
  [ROLES.ADMIN_EXECUTIVE]: SCOPES.BUILDER,
  [ROLES.CONTRACT_ADMIN]: SCOPES.BUILDER,
  [ROLES.SALES_MANAGER]: SCOPES.BUILDER,
  [ROLES.SALES_MANAGER_MH]: SCOPES.BUILDER,
  [ROLES.CONSTRUCTION_MANAGER]: SCOPES.BUILDER,
  [ROLES.CONSTRUCTION_MANAGER_MH]: SCOPES.BUILDER,
  [ROLES.ACCOUNTS]: SCOPES.BUILDER,
  [ROLES.PERMITS]: SCOPES.JOB_ASSIGNED,
  [ROLES.COLOR_CONSULTANT]: SCOPES.JOB_ASSIGNED,
  [ROLES.DRAFT_PERSON]: SCOPES.JOB_ASSIGNED,

  [ROLES.SALES_EXECUTIVE]: SCOPES.ASSIGNED,
  [ROLES.SITE_SUPERVISOR]: SCOPES.SITE_ASSIGNED,
  [ROLES.AGENT]: SCOPES.SELF,
  [ROLES.CONTACT]: SCOPES.JOB_ONLY,
});

// ─── Modules & actions (Section 4) ──────────────────────────────────────────

export const ACTIONS = Object.freeze({
  CREATE: "create",
  READ: "read",
  UPDATE: "update",
  DELETE: "delete",
});

/**
 * Module names are the values stored in role_permission.module_name.
 * Section 4 rolls "Reset Password", "Activate/Deactivate" etc. into the same
 * role-set as Edit, so we collapse those into the CRUD booleans on a single
 * module row. If finer-grained actions are needed later, add a new module
 * (e.g. USER_PASSWORD_RESET) rather than splitting the action booleans.
 */
export const MODULES = Object.freeze({
  USER: "user",
  COMPANY: "company",
  BUILDER: "builder",
  LEAD: "lead",
  OPPORTUNITY: "opportunity",
  JOB: "job",
  CONSTRUCTION_CHECKLIST: "construction_checklist",
  CONSTRUCTION_OHS: "construction_ohs",
  MAINTENANCE: "maintenance",
  QUOTATION: "quotation",
  INVOICE: "invoice",
  COMMISSION: "commission",
  COST_CENTRE: "cost_centre",
  COLOR_SELECTION: "color_selection",
  COLOR_GROUP: "color_group",
  COLOR_CATEGORY: "color_category",
  DOCUMENT: "document",
  ESTATE: "estate",
  FLOOR_PLAN: "floor_plan",
  FACADE: "facade",
  PRICE_LIST: "price_list",
  SETTINGS: "settings",
  ROLE_MANAGEMENT: "role_management",
  EMAIL_TEMPLATE: "email_template",
  DASHBOARD_PLATFORM: "dashboard_platform",
  DASHBOARD_COMPANY: "dashboard_company",
  DASHBOARD_BUILDER: "dashboard_builder",
  REPORT_SALES: "report_sales",
  REPORT_CONSTRUCTION: "report_construction",
  REPORT_FINANCIAL: "report_financial",
  REPORT_ACTIVITY: "report_activity",
});

// ─── Role creation matrix (Section 3.1) ─────────────────────────────────────

const NONE = Object.freeze([]);

export const ROLE_CREATION_MATRIX = Object.freeze({
  [ROLES.SUPER_ADMIN]: [
    ROLES.COMPANY_ADMINISTRATOR,
    ROLES.MH_COMPANY_ADMIN,
    ROLES.MY_HOME_COMPANY_ADMIN,
    ROLES.MY_HOME_ADMIN,
  ],

  // All four Company-Admin variants share the same downstream creation rights.
  [ROLES.COMPANY_ADMINISTRATOR]: [ROLES.BUILDER, ROLES.ADMIN_EXECUTIVE, ROLES.CONTRACT_ADMIN],
  [ROLES.MH_COMPANY_ADMIN]: [ROLES.BUILDER, ROLES.ADMIN_EXECUTIVE, ROLES.CONTRACT_ADMIN],
  [ROLES.MY_HOME_COMPANY_ADMIN]: [ROLES.BUILDER, ROLES.ADMIN_EXECUTIVE, ROLES.CONTRACT_ADMIN],
  [ROLES.MY_HOME_ADMIN]: [ROLES.BUILDER, ROLES.ADMIN_EXECUTIVE, ROLES.CONTRACT_ADMIN],

  // Builder is "the pivotal role" (§5.1) — the main user who creates ALL
  // operational staff. The PDF's two creation lists disagree (§3's bullet list
  // has Site Supervisor but not Contact; §3.1's table has Contact but not Site
  // Supervisor, and neither lists Sales Executive). We resolve to the UNION so
  // the central branch admin can create every Tier-3 role. The frontend
  // ROLE_CREATION_MATRIX mirrors this exact list — keep them in sync.
  [ROLES.BUILDER]: [
    ROLES.SALES_MANAGER,
    ROLES.SALES_MANAGER_MH,
    ROLES.CONSTRUCTION_MANAGER,
    ROLES.CONSTRUCTION_MANAGER_MH,
    ROLES.ADMIN_EXECUTIVE,
    ROLES.CONTRACT_ADMIN,
    ROLES.ACCOUNTS,
    ROLES.DRAFT_PERSON,
    ROLES.PERMITS,
    ROLES.SITE_SUPERVISOR,
    ROLES.COLOR_CONSULTANT,
    ROLES.AGENT,
    ROLES.CONTACT,
    ROLES.SALES_EXECUTIVE,
  ],

  [ROLES.SALES_MANAGER]: [ROLES.SALES_EXECUTIVE, ROLES.AGENT, ROLES.CONTACT],
  [ROLES.SALES_MANAGER_MH]: [ROLES.SALES_EXECUTIVE, ROLES.AGENT, ROLES.CONTACT],

  [ROLES.CONSTRUCTION_MANAGER]: [ROLES.SITE_SUPERVISOR, ROLES.PERMITS, ROLES.DRAFT_PERSON, ROLES.COLOR_CONSULTANT],
  [ROLES.CONSTRUCTION_MANAGER_MH]: [ROLES.SITE_SUPERVISOR, ROLES.PERMITS, ROLES.DRAFT_PERSON, ROLES.COLOR_CONSULTANT],

  // Roles that cannot create any user.
  [ROLES.ADMIN_EXECUTIVE]: NONE,
  [ROLES.CONTRACT_ADMIN]: NONE,
  [ROLES.SALES_EXECUTIVE]: NONE,
  [ROLES.SITE_SUPERVISOR]: NONE,
  [ROLES.PERMITS]: NONE,
  [ROLES.COLOR_CONSULTANT]: NONE,
  [ROLES.DRAFT_PERSON]: NONE,
  [ROLES.ACCOUNTS]: NONE,
  [ROLES.AGENT]: NONE,
  [ROLES.CONTACT]: NONE,
});

/** Pure check: can a creator role create users with the target role? */
export function canCreateRole(creatorRoleName, targetRoleName) {
  if (!creatorRoleName || !targetRoleName) return false;

  if (creatorRoleName === ROLES.SUPER_ADMIN) return true;

  const COMPANY_ADMIN_ROLES = [
    ROLES.COMPANY_ADMINISTRATOR,
    ROLES.MH_COMPANY_ADMIN,
    ROLES.MY_HOME_COMPANY_ADMIN,
    ROLES.MY_HOME_ADMIN,
  ];

  if (COMPANY_ADMIN_ROLES.includes(creatorRoleName)) {
    return targetRoleName !== ROLES.SUPER_ADMIN;
  }

  const allowed = ROLE_CREATION_MATRIX[creatorRoleName];
  return Array.isArray(allowed) && allowed.includes(targetRoleName);
}

// ─── Module permission matrix (Section 4) ───────────────────────────────────
//
// Encoding helpers — these keep the matrix readable. A row is { c, r, u, d }
// expanded to {create, read, update, delete} at module load.

const _ = { c: false, r: false, u: false, d: false }; // no access
const RO = { c: false, r: true, u: false, d: false }; // read-only
const CR = { c: true, r: true, u: false, d: false };
const CU = { c: true, r: true, u: true, d: false };   // create + update, no delete
const RU = { c: false, r: true, u: true, d: false };
const ALL = { c: true, r: true, u: true, d: true };

const expand = (row) => ({
  [ACTIONS.CREATE]: !!row.c,
  [ACTIONS.READ]: !!row.r,
  [ACTIONS.UPDATE]: !!row.u,
  [ACTIONS.DELETE]: !!row.d,
});

/**
 * Build the full per-role permission map. Rules baked in (from Section 4):
 *  - Super Admin: ALL on every module.
 *  - "Own records only" (🔒) and row-level scoping are NOT encoded here —
 *    they are reflected by granting the action and letting the row-scope
 *    helpers further constrain the query. Module guards say "can do action";
 *    row scoping says "on which rows".
 */
function buildMatrix() {
  const matrix = {};
  for (const role of ALL_ROLES) {
    matrix[role] = {};
    for (const mod of Object.values(MODULES)) {
      matrix[role][mod] = expand(_); // default deny
    }
  }

  // ─── Super Admin — full access everywhere ─────────────────────────────────
  for (const mod of Object.values(MODULES)) {
    matrix[ROLES.SUPER_ADMIN][mod] = expand(ALL);
  }

  // ─── 4.1 User Management ──────────────────────────────────────────────────
  matrix[ROLES.COMPANY_ADMINISTRATOR][MODULES.USER] = expand(ALL);
  matrix[ROLES.MH_COMPANY_ADMIN][MODULES.USER] = expand(ALL);
  matrix[ROLES.MY_HOME_COMPANY_ADMIN][MODULES.USER] = expand(ALL);
  matrix[ROLES.MY_HOME_ADMIN][MODULES.USER] = expand(ALL);
  matrix[ROLES.BUILDER][MODULES.USER] = expand(ALL);
  matrix[ROLES.SALES_MANAGER][MODULES.USER] = expand(CU);       // create+edit own team, no delete
  matrix[ROLES.SALES_MANAGER_MH][MODULES.USER] = expand(CU);
  matrix[ROLES.CONSTRUCTION_MANAGER][MODULES.USER] = expand(CU);
  matrix[ROLES.CONSTRUCTION_MANAGER_MH][MODULES.USER] = expand(CU);
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.USER] = expand(RO);

  // ─── 4.2 Company & Builder ────────────────────────────────────────────────
  matrix[ROLES.COMPANY_ADMINISTRATOR][MODULES.COMPANY] = expand(RU);
  matrix[ROLES.MH_COMPANY_ADMIN][MODULES.COMPANY] = expand(RU);
  matrix[ROLES.MY_HOME_COMPANY_ADMIN][MODULES.COMPANY] = expand(RU);
  matrix[ROLES.MY_HOME_ADMIN][MODULES.COMPANY] = expand(RU);
  matrix[ROLES.BUILDER][MODULES.COMPANY] = expand(RO);
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.COMPANY] = expand(RO);

  matrix[ROLES.COMPANY_ADMINISTRATOR][MODULES.BUILDER] = expand(ALL);
  matrix[ROLES.MH_COMPANY_ADMIN][MODULES.BUILDER] = expand(ALL);
  matrix[ROLES.MY_HOME_COMPANY_ADMIN][MODULES.BUILDER] = expand(ALL);
  matrix[ROLES.MY_HOME_ADMIN][MODULES.BUILDER] = expand(ALL);
  matrix[ROLES.BUILDER][MODULES.BUILDER] = expand(RU); // own only — row scope enforces

  // ─── 4.3 Leads & Opportunities ────────────────────────────────────────────
  const fullLeadRoles = [ROLES.BUILDER, ROLES.SALES_MANAGER, ROLES.SALES_MANAGER_MH];
  for (const r of fullLeadRoles) {
    matrix[r][MODULES.LEAD] = expand(ALL);
    matrix[r][MODULES.OPPORTUNITY] = expand(ALL);
  }
  matrix[ROLES.SALES_EXECUTIVE][MODULES.LEAD] = expand(CU); // own assigned only via row scope
  matrix[ROLES.SALES_EXECUTIVE][MODULES.OPPORTUNITY] = expand(CR);
  matrix[ROLES.AGENT][MODULES.LEAD] = expand(CU);
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.LEAD] = expand(RO);
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.OPPORTUNITY] = expand(RO);

  // ─── 4.4 Jobs ─────────────────────────────────────────────────────────────
  matrix[ROLES.BUILDER][MODULES.JOB] = expand(ALL);
  matrix[ROLES.CONSTRUCTION_MANAGER][MODULES.JOB] = expand(ALL);
  matrix[ROLES.CONSTRUCTION_MANAGER_MH][MODULES.JOB] = expand(ALL);
  matrix[ROLES.SITE_SUPERVISOR][MODULES.JOB] = expand(RU); // assigned only via row scope
  matrix[ROLES.PERMITS][MODULES.JOB] = expand(RO);
  matrix[ROLES.DRAFT_PERSON][MODULES.JOB] = expand(RO);
  matrix[ROLES.SALES_MANAGER][MODULES.JOB] = expand(RO);
  matrix[ROLES.SALES_MANAGER_MH][MODULES.JOB] = expand(RO);
  matrix[ROLES.ACCOUNTS][MODULES.JOB] = expand(RO);

  for (const r of [ROLES.BUILDER, ROLES.CONSTRUCTION_MANAGER, ROLES.CONSTRUCTION_MANAGER_MH, ROLES.SITE_SUPERVISOR]) {
    matrix[r][MODULES.CONSTRUCTION_CHECKLIST] = expand(ALL);
    matrix[r][MODULES.CONSTRUCTION_OHS] = expand(ALL);
  }

  // ─── 4.4b Maintenance (post-handover warranty requests) ───────────────────
  matrix[ROLES.BUILDER][MODULES.MAINTENANCE] = expand(ALL);
  matrix[ROLES.CONSTRUCTION_MANAGER][MODULES.MAINTENANCE] = expand(ALL);
  matrix[ROLES.CONSTRUCTION_MANAGER_MH][MODULES.MAINTENANCE] = expand(ALL);
  matrix[ROLES.SITE_SUPERVISOR][MODULES.MAINTENANCE] = expand(RU); // assigned only, via row scope
  matrix[ROLES.CONTACT][MODULES.MAINTENANCE] = expand(CR); // customer: create/view own job's requests only
  matrix[ROLES.SALES_MANAGER][MODULES.MAINTENANCE] = expand(RO);
  matrix[ROLES.SALES_MANAGER_MH][MODULES.MAINTENANCE] = expand(RO);
  matrix[ROLES.ACCOUNTS][MODULES.MAINTENANCE] = expand(RO);

  // ─── 4.5 Quotation & Sales Process ────────────────────────────────────────
  matrix[ROLES.BUILDER][MODULES.QUOTATION] = expand(ALL);
  matrix[ROLES.SALES_MANAGER][MODULES.QUOTATION] = expand(ALL);
  matrix[ROLES.SALES_MANAGER_MH][MODULES.QUOTATION] = expand(ALL);
  matrix[ROLES.SALES_EXECUTIVE][MODULES.QUOTATION] = expand(CU);
  matrix[ROLES.ACCOUNTS][MODULES.QUOTATION] = expand(RO);
  matrix[ROLES.CONTRACT_ADMIN][MODULES.QUOTATION] = expand(RU);
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.QUOTATION] = expand(RO);

  // ─── 4.6 Invoices & Accounts ──────────────────────────────────────────────
  matrix[ROLES.BUILDER][MODULES.INVOICE] = expand(ALL);
  matrix[ROLES.COMPANY_ADMINISTRATOR][MODULES.INVOICE] = expand(ALL);
  matrix[ROLES.MH_COMPANY_ADMIN][MODULES.INVOICE] = expand(ALL);
  matrix[ROLES.MY_HOME_COMPANY_ADMIN][MODULES.INVOICE] = expand(ALL);
  matrix[ROLES.MY_HOME_ADMIN][MODULES.INVOICE] = expand(ALL);
  matrix[ROLES.ACCOUNTS][MODULES.INVOICE] = expand(CU); // no delete
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.INVOICE] = expand(RO);
  matrix[ROLES.CONTRACT_ADMIN][MODULES.INVOICE] = expand(RO);

  for (const r of [ROLES.BUILDER, ROLES.COMPANY_ADMINISTRATOR, ROLES.MH_COMPANY_ADMIN, ROLES.MY_HOME_COMPANY_ADMIN, ROLES.MY_HOME_ADMIN, ROLES.ACCOUNTS]) {
    matrix[r][MODULES.COMMISSION] = expand(ALL);
    matrix[r][MODULES.COST_CENTRE] = expand(ALL);
  }

  // ─── 4.7 Colour Selections ────────────────────────────────────────────────
  matrix[ROLES.BUILDER][MODULES.COLOR_SELECTION] = expand(ALL);
  matrix[ROLES.COLOR_CONSULTANT][MODULES.COLOR_SELECTION] = expand(ALL); // assigned jobs only via row scope
  matrix[ROLES.SALES_MANAGER][MODULES.COLOR_SELECTION] = expand(RO);
  matrix[ROLES.CONSTRUCTION_MANAGER][MODULES.COLOR_SELECTION] = expand(RO);
  matrix[ROLES.CONTACT][MODULES.COLOR_SELECTION] = expand(RO); // own job only

  matrix[ROLES.BUILDER][MODULES.COLOR_GROUP] = expand(ALL);
  matrix[ROLES.COLOR_CONSULTANT][MODULES.COLOR_GROUP] = expand(RO);

  matrix[ROLES.BUILDER][MODULES.COLOR_CATEGORY] = expand(ALL);
  matrix[ROLES.COLOR_CONSULTANT][MODULES.COLOR_CATEGORY] = expand(RO);

  // ─── 4.8 Documents & Drive ────────────────────────────────────────────────
  const docFullRoles = [
    ROLES.BUILDER,
    ROLES.COMPANY_ADMINISTRATOR,
    ROLES.MH_COMPANY_ADMIN,
    ROLES.MY_HOME_COMPANY_ADMIN,
    ROLES.MY_HOME_ADMIN,
    ROLES.SALES_MANAGER,
    ROLES.SALES_MANAGER_MH,
    ROLES.CONSTRUCTION_MANAGER,
    ROLES.CONSTRUCTION_MANAGER_MH,
  ];
  for (const r of docFullRoles) matrix[r][MODULES.DOCUMENT] = expand(ALL);
  matrix[ROLES.SITE_SUPERVISOR][MODULES.DOCUMENT] = expand(CU); // upload + view assigned
  matrix[ROLES.ACCOUNTS][MODULES.DOCUMENT] = expand(ALL);
  matrix[ROLES.COLOR_CONSULTANT][MODULES.DOCUMENT] = expand(CU);
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.DOCUMENT] = expand(ALL);
  matrix[ROLES.CONTRACT_ADMIN][MODULES.DOCUMENT] = expand(ALL);
  matrix[ROLES.CONTACT][MODULES.DOCUMENT] = expand(RO);

  // ─── 4.9 Estates / Lots / Floor Plans / Facades / Price Lists ─────────────
  const estateFullRoles = [
    ROLES.BUILDER,
    ROLES.COMPANY_ADMINISTRATOR,
    ROLES.MH_COMPANY_ADMIN,
    ROLES.MY_HOME_COMPANY_ADMIN,
    ROLES.MY_HOME_ADMIN,
  ];
  for (const r of estateFullRoles) {
    matrix[r][MODULES.ESTATE] = expand(ALL);
    matrix[r][MODULES.FLOOR_PLAN] = expand(ALL);
    matrix[r][MODULES.FACADE] = expand(ALL);
    matrix[r][MODULES.PRICE_LIST] = expand(ALL);
  }
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.ESTATE] = expand(RO);
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.PRICE_LIST] = expand(RO);
  matrix[ROLES.SALES_MANAGER][MODULES.ESTATE] = expand(RO);
  matrix[ROLES.SALES_MANAGER][MODULES.FLOOR_PLAN] = expand(RO);
  matrix[ROLES.SALES_MANAGER][MODULES.FACADE] = expand(RO);
  matrix[ROLES.SALES_MANAGER][MODULES.PRICE_LIST] = expand(RO);
  matrix[ROLES.SALES_EXECUTIVE][MODULES.ESTATE] = expand(RO);
  matrix[ROLES.SALES_EXECUTIVE][MODULES.FLOOR_PLAN] = expand(RO);
  matrix[ROLES.SALES_EXECUTIVE][MODULES.FACADE] = expand(RO);

  // ─── 4.10 Settings & Configuration ────────────────────────────────────────
  // SETTINGS and EMAIL_TEMPLATE: Builder-tier admins can manage these.
  const settingsAdminRoles = [
    ROLES.COMPANY_ADMINISTRATOR,
    ROLES.MH_COMPANY_ADMIN,
    ROLES.MY_HOME_COMPANY_ADMIN,
    ROLES.MY_HOME_ADMIN,
    ROLES.BUILDER,
  ];
  for (const r of settingsAdminRoles) {
    matrix[r][MODULES.SETTINGS] = expand(ALL);
    matrix[r][MODULES.EMAIL_TEMPLATE] = expand(ALL);
  }
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.SETTINGS] = expand(RO);

  // ROLE_MANAGEMENT: Company Administrator variants only. Builder is excluded
  // from the default matrix. Company Admins can delegate ROLE_MANAGEMENT to
  // another role (e.g. Builder) temporarily via PUT /role/:id/permissions.
  const roleManagementAdminRoles = [
    ROLES.COMPANY_ADMINISTRATOR,
    ROLES.MH_COMPANY_ADMIN,
    ROLES.MY_HOME_COMPANY_ADMIN,
    ROLES.MY_HOME_ADMIN,
  ];
  for (const r of roleManagementAdminRoles) {
    matrix[r][MODULES.ROLE_MANAGEMENT] = expand(ALL);
  }

  // ─── 4.11 Reports & Dashboard ─────────────────────────────────────────────
  matrix[ROLES.COMPANY_ADMINISTRATOR][MODULES.DASHBOARD_COMPANY] = expand(ALL);
  matrix[ROLES.MH_COMPANY_ADMIN][MODULES.DASHBOARD_COMPANY] = expand(ALL);
  matrix[ROLES.MY_HOME_COMPANY_ADMIN][MODULES.DASHBOARD_COMPANY] = expand(ALL);
  matrix[ROLES.MY_HOME_ADMIN][MODULES.DASHBOARD_COMPANY] = expand(ALL);

  matrix[ROLES.COMPANY_ADMINISTRATOR][MODULES.DASHBOARD_BUILDER] = expand(ALL);
  matrix[ROLES.MH_COMPANY_ADMIN][MODULES.DASHBOARD_BUILDER] = expand(ALL);
  matrix[ROLES.MY_HOME_COMPANY_ADMIN][MODULES.DASHBOARD_BUILDER] = expand(ALL);
  matrix[ROLES.MY_HOME_ADMIN][MODULES.DASHBOARD_BUILDER] = expand(ALL);
  matrix[ROLES.BUILDER][MODULES.DASHBOARD_BUILDER] = expand(ALL);

  const salesReportRoles = [
    ROLES.COMPANY_ADMINISTRATOR, ROLES.MH_COMPANY_ADMIN, ROLES.MY_HOME_COMPANY_ADMIN, ROLES.MY_HOME_ADMIN,
    ROLES.BUILDER, ROLES.SALES_MANAGER, ROLES.SALES_MANAGER_MH,
  ];
  for (const r of salesReportRoles) matrix[r][MODULES.REPORT_SALES] = expand(ALL);
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.REPORT_SALES] = expand(RO);

  const constrReportRoles = [
    ROLES.COMPANY_ADMINISTRATOR, ROLES.MH_COMPANY_ADMIN, ROLES.MY_HOME_COMPANY_ADMIN, ROLES.MY_HOME_ADMIN,
    ROLES.BUILDER, ROLES.CONSTRUCTION_MANAGER, ROLES.CONSTRUCTION_MANAGER_MH,
  ];
  for (const r of constrReportRoles) matrix[r][MODULES.REPORT_CONSTRUCTION] = expand(ALL);
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.REPORT_CONSTRUCTION] = expand(RO);

  const finReportRoles = [
    ROLES.COMPANY_ADMINISTRATOR, ROLES.MH_COMPANY_ADMIN, ROLES.MY_HOME_COMPANY_ADMIN, ROLES.MY_HOME_ADMIN,
    ROLES.BUILDER, ROLES.ACCOUNTS,
  ];
  for (const r of finReportRoles) matrix[r][MODULES.REPORT_FINANCIAL] = expand(ALL);
  matrix[ROLES.ADMIN_EXECUTIVE][MODULES.REPORT_FINANCIAL] = expand(RO);

  const activityReportRoles = [
    ROLES.COMPANY_ADMINISTRATOR, ROLES.MH_COMPANY_ADMIN, ROLES.MY_HOME_COMPANY_ADMIN, ROLES.MY_HOME_ADMIN,
    ROLES.BUILDER, ROLES.SALES_MANAGER, ROLES.SALES_MANAGER_MH,
    ROLES.CONSTRUCTION_MANAGER, ROLES.CONSTRUCTION_MANAGER_MH,
    ROLES.ADMIN_EXECUTIVE,
  ];
  for (const r of activityReportRoles) matrix[r][MODULES.REPORT_ACTIVITY] = expand(ALL);

  // Company Administrator variants: full access on ALL modules.
  // These are the top-level tenant admins and must be unrestricted within
  // their company scope. This block runs last so it overrides any partial
  // assignments above — if a module is added to MODULES later, CA gets it too.
  const companyAdminAllRoles = [
    ROLES.COMPANY_ADMINISTRATOR,
    ROLES.MH_COMPANY_ADMIN,
    ROLES.MY_HOME_COMPANY_ADMIN,
    ROLES.MY_HOME_ADMIN,
  ];
  for (const r of companyAdminAllRoles) {
    for (const mod of Object.values(MODULES)) {
      matrix[r][mod] = expand(ALL);
    }
  }

  return matrix;
}

export const MODULE_PERMISSIONS = Object.freeze(buildMatrix());

/** Pure check: does a role have the given action on the given module? */
export function hasModulePermission(roleName, moduleName, action) {
  const rolePerms = MODULE_PERMISSIONS[roleName];
  if (!rolePerms) return false;
  const modPerms = rolePerms[moduleName];
  if (!modPerms) return false;
  return modPerms[action] === true;
}

/** Returns the role's scope tag from SCOPES, or null if the role is unknown. */
export function getRoleScope(roleName) {
  return ROLE_SCOPES[roleName] || null;
}

/** Returns the role's tier (1/2/3), or null if unknown. */
export function getRoleTier(roleName) {
  return ROLE_TIERS[roleName] || null;
}

/**
 * True for the platform/company/builder administrators (tiers 1 and 2) — the
 * roles that configure and own a job's workflow rather than just work through
 * their own slice of it.
 *
 * Used by the "Show all Tasks to all Roles" visibility rule: with the setting
 * off, an operational role sees only its own tasks, but an administrator must
 * still see the whole workflow — they are the ones adding stages and tasks, and
 * a filtered view would hide the very tasks they just created.
 */
export function managesWorkflow(roleName) {
  const tier = getRoleTier(roleName);
  return tier === 1 || tier === 2;
}

/**
 * Returns the list of role names whose permissions the given caller role is
 * allowed to view or modify. The rule mirrors ROLE_CREATION_MATRIX:
 * "you can manage permissions for roles you are allowed to create."
 *
 * Super Admin can manage all roles (returns ALL_ROLES).
 * Roles that cannot create anyone (e.g. Sales Executive) return [].
 *
 * @param {string} callerRoleName
 * @returns {string[]} array of manageable role names
 */
export function getManageableRoles(callerRoleName) {
  if (!callerRoleName) return [];
  if (callerRoleName === ROLES.SUPER_ADMIN) return [...ALL_ROLES];
  
  const COMPANY_ADMIN_ROLES = [
    ROLES.COMPANY_ADMINISTRATOR,
    ROLES.MH_COMPANY_ADMIN,
    ROLES.MY_HOME_COMPANY_ADMIN,
    ROLES.MY_HOME_ADMIN,
  ];
  if (COMPANY_ADMIN_ROLES.includes(callerRoleName)) {
    return ALL_ROLES.filter(r => r !== ROLES.SUPER_ADMIN);
  }

  return ROLE_CREATION_MATRIX[callerRoleName] ?? [];
}
