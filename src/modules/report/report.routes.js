import express from "express";
import authMiddleware from "../../middleware/authMiddleware.js";
import scopeBuilder from "../../middleware/rbac/scopeBuilder.js";
import { requirePermission, MODULES, ACTIONS } from "../../middleware/rbac/index.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { focusReportQuerySchema, quotationReportQuerySchema, floorPlanReportQuerySchema, performanceReportQuerySchema, noActionReportQuerySchema, workflowStatusQuerySchema, maintenanceSummaryQuerySchema, maintenanceDetailedQuerySchema, noActionJobsQuerySchema, jobStatusReportQuerySchema, milestoneStatusReportQuerySchema, customerStatusQuerySchema, contractReportQuerySchema, extensionNoticeQuerySchema, invoicePaymentQuerySchema, costSummaryQuerySchema, landTitleForecastQuerySchema, surveyReportQuerySchema, variationReportQuerySchema, saveReportColumnsSchema } from "./report.validation.js";
import {
  getFocusReportController,
  getFocusReportColumnsController,
  saveFocusReportColumnsController,
  getQuotationReportController,
  getFloorPlanReportController,
  getFloorPlanReportFiltersController,
  getPerformanceReportController,
  getNoActionReportController,
  getWorkflowStatusReportController,
  getWorkflowColumnsController,
  saveWorkflowColumnsController,
  getMaintenanceSummaryReportController,
  getMaintenanceDetailedReportController,
  getNoActionJobsReportController,
  getJobStatusReportController,
  getMilestoneStatusReportController,
  getCustomerStatusReportController,
  getContractReportController,
  getExtensionNoticeReportController,
  getInvoicePaymentReportController,
  getCostSummaryReportController,
  getLandTitleForecastReportController,
  getSurveyReportController,
  getVariationReportController,
} from "./report.controller.js";

const router = express.Router();

router.use(authMiddleware);
router.use(scopeBuilder);

// Sales → Lead / Focus report
router.get(
  "/sales/focus/columns",
  requirePermission(MODULES.REPORT_SALES, ACTIONS.READ),
  getFocusReportColumnsController,
);

router.put(
  "/sales/focus/columns",
  requirePermission(MODULES.REPORT_SALES, ACTIONS.UPDATE),
  validateRequest(saveReportColumnsSchema, REQUEST_SOURCE.BODY),
  saveFocusReportColumnsController,
);

router.get(
  "/sales/focus",
  requirePermission(MODULES.REPORT_SALES, ACTIONS.READ),
  validateRequest(focusReportQuerySchema, REQUEST_SOURCE.QUERY),
  getFocusReportController,
);

// Sales → Quotation report (no column customization)
router.get(
  "/sales/quotation",
  requirePermission(MODULES.REPORT_SALES, ACTIONS.READ),
  validateRequest(quotationReportQuerySchema, REQUEST_SOURCE.QUERY),
  getQuotationReportController,
);

// Sales → Floor Plan / Facade report (mode toggle, no column customization)
router.get(
  "/sales/floor-plan/filters",
  requirePermission(MODULES.REPORT_SALES, ACTIONS.READ),
  getFloorPlanReportFiltersController,
);

router.get(
  "/sales/floor-plan",
  requirePermission(MODULES.REPORT_SALES, ACTIONS.READ),
  validateRequest(floorPlanReportQuerySchema, REQUEST_SOURCE.QUERY),
  getFloorPlanReportController,
);

// Sales → Performance report (per-user metrics by role/user, optional list)
router.get(
  "/sales/performance",
  requirePermission(MODULES.REPORT_SALES, ACTIONS.READ),
  validateRequest(performanceReportQuerySchema, REQUEST_SOURCE.QUERY),
  getPerformanceReportController,
);

// Sales → No Action Leads report (fixed columns, Include On Hold toggle)
router.get(
  "/sales/no-action",
  requirePermission(MODULES.REPORT_SALES, ACTIONS.READ),
  validateRequest(noActionReportQuerySchema, REQUEST_SOURCE.QUERY),
  getNoActionReportController,
);

// Workflow → Workflow Status report (dynamic task columns + customization).
// Scoped under the construction/job report permission.
router.get(
  "/workflow/status/columns",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  getWorkflowColumnsController,
);

router.put(
  "/workflow/status/columns",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.UPDATE),
  validateRequest(saveReportColumnsSchema, REQUEST_SOURCE.BODY),
  saveWorkflowColumnsController,
);

router.get(
  "/workflow/status",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(workflowStatusQuerySchema, REQUEST_SOURCE.QUERY),
  getWorkflowStatusReportController,
);

// Maintenance → summary (per job) + detailed (per request).
// Scoped under the construction report permission (post-handover warranty).
router.get(
  "/maintenance/summary",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(maintenanceSummaryQuerySchema, REQUEST_SOURCE.QUERY),
  getMaintenanceSummaryReportController,
);

router.get(
  "/maintenance/detailed",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(maintenanceDetailedQuerySchema, REQUEST_SOURCE.QUERY),
  getMaintenanceDetailedReportController,
);

// Job → core list reports (guarded by the construction/job report permission)
router.get(
  "/job/no-action",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(noActionJobsQuerySchema, REQUEST_SOURCE.QUERY),
  getNoActionJobsReportController,
);

router.get(
  "/job/status",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(jobStatusReportQuerySchema, REQUEST_SOURCE.QUERY),
  getJobStatusReportController,
);

// Job → Milestone Task/Checklist status. Window defaults to
// Settings → Job → Settings (`milestone_status_check_days`).
router.get(
  "/job/milestone-status",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(milestoneStatusReportQuerySchema, REQUEST_SOURCE.QUERY),
  getMilestoneStatusReportController,
);

router.get(
  "/job/customer-status",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(customerStatusQuerySchema, REQUEST_SOURCE.QUERY),
  getCustomerStatusReportController,
);

router.get(
  "/job/contract",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(contractReportQuerySchema, REQUEST_SOURCE.QUERY),
  getContractReportController,
);

router.get(
  "/job/extension-notice",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(extensionNoticeQuerySchema, REQUEST_SOURCE.QUERY),
  getExtensionNoticeReportController,
);

// Job → financial. Guarded by the financial report permission.
router.get(
  "/job/invoice-payment",
  requirePermission(MODULES.REPORT_FINANCIAL, ACTIONS.READ),
  validateRequest(invoicePaymentQuerySchema, REQUEST_SOURCE.QUERY),
  getInvoicePaymentReportController,
);

router.get(
  "/job/cost-summary",
  requirePermission(MODULES.REPORT_FINANCIAL, ACTIONS.READ),
  validateRequest(costSummaryQuerySchema, REQUEST_SOURCE.QUERY),
  getCostSummaryReportController,
);

router.get(
  "/job/land-title-forecast",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(landTitleForecastQuerySchema, REQUEST_SOURCE.QUERY),
  getLandTitleForecastReportController,
);

router.get(
  "/job/survey",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(surveyReportQuerySchema, REQUEST_SOURCE.QUERY),
  getSurveyReportController,
);

router.get(
  "/job/variation",
  requirePermission(MODULES.REPORT_CONSTRUCTION, ACTIONS.READ),
  validateRequest(variationReportQuerySchema, REQUEST_SOURCE.QUERY),
  getVariationReportController,
);

export default router;
