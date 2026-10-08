/**
 * Catalog of the standard "Lead Fields" columns for the Sales → Lead/Focus
 * report. Single source of truth shared by:
 *   - focus-report.service.js  → builds the SELECT list (`select AS "key"`)
 *     and the ORDER BY whitelist (`sortColumn`).
 *   - report-column.service.js → builds the column catalog + default layout.
 *
 * Column shape:
 *   key           camelCase field returned on each row (and used by the layout)
 *   label         default header text (user may rename via saved layout)
 *   select        SQL expression producing the value (aliased to `key`)
 *   sortColumn    real SQL column allowed in ORDER BY, or null (not sortable)
 *   defaultWidth  default column width in px
 *   defaultVisible whether the column shows before the user customizes
 *
 * Every column maps to a real source. Referral Partner and Category were
 * removed (no lead→partner FK / no category field). Dwelling Type, Deposit,
 * Deposit Date, Closed Date and Packages are sourced from
 * HLP/quotation/invoice/opportunity.
 */

// Reused property-address concat, mirrored from leads.repository.getAllLeads.
const PROPERTY_ADDRESS_SQL = "COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(pd_state.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), NULL)";

// Number of appointments linked to the lead.
const APPOINTMENTS_SQL = "(SELECT COUNT(*)::int FROM appointment ap WHERE ap.lead_id = l.leads_id)";

// Status prefers the opportunity's status (e.g. "Opportunity"/"Negotiation")
// and falls back to the lead's own status, matching the sample report.
const STATUS_SQL = "COALESCE((SELECT o.status FROM opportunity o WHERE o.leads_id = l.leads_id LIMIT 1), l.status)";

// Dwelling Type — from the lead's House & Land package floor plan, else its
// latest quotation version's floor plan.
const DWELLING_TYPE_SQL = `COALESCE(
    (SELECT dt.name FROM house_land_package hlp JOIN floor_plan fp ON hlp.floor_plan_id = fp.floor_plan_id JOIN dwelling_type dt ON fp.dwelling_type_id = dt.dwelling_type_id WHERE hlp.house_land_package_id = l.house_land_package_id),
    (SELECT dt.name FROM quotation q JOIN quotation_version qv ON qv.quotation_id = q.quotation_id JOIN floor_plan fp ON qv.floor_plan_id = fp.floor_plan_id JOIN dwelling_type dt ON fp.dwelling_type_id = dt.dwelling_type_id WHERE q.leads_id = l.leads_id ORDER BY qv.quotation_version_no DESC LIMIT 1))`;

// Packages — the lead's H&L package title, else its latest quotation version's package name.
const PACKAGES_SQL = `COALESCE(
    (SELECT hlp.title FROM house_land_package hlp WHERE hlp.house_land_package_id = l.house_land_package_id),
    (SELECT p.name FROM quotation q JOIN quotation_version qv ON qv.quotation_id = q.quotation_id JOIN package p ON qv.package_id = p.package_id WHERE q.leads_id = l.leads_id ORDER BY qv.quotation_version_no DESC LIMIT 1))`;

// Deposit amount / date — the lead's most recent invoice deposit.
const DEPOSIT_SQL = "(SELECT iv.deposite_amount FROM invoice iv WHERE iv.leads_id = l.leads_id AND iv.deposite_amount IS NOT NULL ORDER BY iv.deposite_date DESC NULLS LAST LIMIT 1)";
const DEPOSIT_DATE_SQL = "(SELECT iv.deposite_date FROM invoice iv WHERE iv.leads_id = l.leads_id AND iv.deposite_amount IS NOT NULL ORDER BY iv.deposite_date DESC NULLS LAST LIMIT 1)";

// Closed Date — when the lead's opportunity reached an outcome (won/lost).
const CLOSED_DATE_SQL = "(SELECT o.updated_at FROM opportunity o WHERE o.leads_id = l.leads_id AND o.out_come IS NOT NULL ORDER BY o.updated_at DESC LIMIT 1)";

export const REPORT_KEYS = Object.freeze({
  SALES_FOCUS: "sales_focus",
});

export const LEAD_FOCUS_COLUMNS = [
  { key: "referenceId", label: "Reference ID", select: "l.reference_number", sortColumn: "l.reference_number", defaultWidth: 120, defaultVisible: true },
  { key: "name", label: "Name", select: "l.name", sortColumn: "l.name", defaultWidth: 200, defaultVisible: true },
  { key: "contact", label: "Contact", select: "l.phone", sortColumn: "l.phone", defaultWidth: 130, defaultVisible: true },
  { key: "email", label: "Email", select: "l.email", sortColumn: "l.email", defaultWidth: 250, defaultVisible: true },
  { key: "created", label: "Created", select: "l.created_at", sortColumn: "l.created_at", defaultWidth: 120, defaultVisible: true },
  { key: "updated", label: "Updated", select: "l.updated_at", sortColumn: "l.updated_at", defaultWidth: 120, defaultVisible: true },
  { key: "propertyAddress", label: "Property Address", select: PROPERTY_ADDRESS_SQL, sortColumn: null, defaultWidth: 220, defaultVisible: true },
  { key: "dwellingType", label: "Dwelling Type", select: DWELLING_TYPE_SQL, sortColumn: null, defaultWidth: 130, defaultVisible: true },
  { key: "leadSource", label: "Lead Source", select: "ls.name", sortColumn: "ls.name", defaultWidth: 160, defaultVisible: true },
  { key: "rating", label: "Rating", select: "l.rating", sortColumn: "l.rating", defaultWidth: 130, defaultVisible: true },
  { key: "assignee", label: "Assignee", select: "assignee.name", sortColumn: "assignee.name", defaultWidth: 150, defaultVisible: true },
  { key: "status", label: "Status", select: STATUS_SQL, sortColumn: "l.status", defaultWidth: 130, defaultVisible: true },
  { key: "lostReason", label: "Lost Reason", select: "llr.lost_reason", sortColumn: null, defaultWidth: 160, defaultVisible: true },
  { key: "closedDate", label: "Closed Date", select: CLOSED_DATE_SQL, sortColumn: null, defaultWidth: 120, defaultVisible: true },
  { key: "land", label: "Land", select: "l.land", sortColumn: "l.land", defaultWidth: 120, defaultVisible: true },
  { key: "finance", label: "Finance", select: "l.finance", sortColumn: "l.finance", defaultWidth: 120, defaultVisible: true },
  { key: "faceToFace", label: "Face to Face", select: "l.face_to_face", sortColumn: "l.face_to_face", defaultWidth: 130, defaultVisible: true },
  { key: "purpose", label: "Purpose", select: "l.purpose", sortColumn: "l.purpose", defaultWidth: 130, defaultVisible: true },
  { key: "clientType", label: "Client Type", select: "ct.client_type", sortColumn: "ct.client_type", defaultWidth: 140, defaultVisible: true },
  { key: "deposit", label: "Deposit", select: DEPOSIT_SQL, sortColumn: null, defaultWidth: 120, defaultVisible: true },
  { key: "depositDate", label: "Deposit Date", select: DEPOSIT_DATE_SQL, sortColumn: null, defaultWidth: 120, defaultVisible: true },
  { key: "forecastDate", label: "Forecast Date", select: "l.forcast_close", sortColumn: "l.forcast_close", defaultWidth: 120, defaultVisible: true },
  { key: "packages", label: "Packages", select: PACKAGES_SQL, sortColumn: null, defaultWidth: 160, defaultVisible: true },
  { key: "appointments", label: "Appointments", select: APPOINTMENTS_SQL, sortColumn: null, defaultWidth: 130, defaultVisible: true },
  { key: "lastUpdatedOn", label: "LastUpdatedOn", select: "l.updated_at", sortColumn: "l.updated_at", defaultWidth: 130, defaultVisible: true },
];

// key -> catalog entry, for O(1) lookups.
export const LEAD_FOCUS_COLUMN_MAP = Object.freeze(
  LEAD_FOCUS_COLUMNS.reduce((acc, c) => {
    acc[c.key] = c;
    return acc;
  }, {}),
);

// Whitelist of { columnKey: sqlColumn } sortable columns for ORDER BY.
export const LEAD_FOCUS_SORTABLE = Object.freeze(
  LEAD_FOCUS_COLUMNS.reduce((acc, c) => {
    if (c.sortColumn) {
      acc[c.key] = c.sortColumn;
    }
    return acc;
  }, {}),
);
