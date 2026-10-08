import express from "express";

const router = express.Router();

import {
  createLead,
  getAllLeads,
  getLeadById,
  updateLead,
  deleteLead,
  getLeadStats,
  getSalesDashboard,
  updateLeadStatus,
  assignLead,
  forceCreateLead,
  convertLeadToOpportunity,
  removeHLPackage,
  getAllLeadActions,
  getLeadActivityLog,
  createPublicLead,
  getLeadDocuments,
} from "./leads.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createLeadSchema,
  getLeadByIdSchema,
  updateLeadSchema,
  updateLeadStatusSchema,
  assignLeadSchema,
  getAllLeadsQuerySchema,
  convertLeadToOpportunitySchema,
  removeHLPackageSchema,
  getLeadActivityLogQuerySchema,
  // createPublicLeadSchema,
} from "./leads.validation.js";
// The landing enquiry is captured as a `landing_lead`, not a CRM lead, so it
// validates against that module's schema — builder_id is no longer required.
import { captureLandingLeadSchema } from "../landing-lead/landing-lead.validation.js";
import { validateExternalToken } from "../../middleware/externalAuthMiddleware.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

// Public route - Protected by Landing Page auth token validation
router.post(
  "/public/create",
  validateExternalToken("landing"),
  camelToSnakeMiddleware,
  // validateRequest(createPublicLeadSchema, REQUEST_SOURCE.BODY),
  validateRequest(captureLandingLeadSchema, REQUEST_SOURCE.BODY),
  createPublicLead,
);

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
// Phase 2 — resolve req.user.role_name + req.scope for every authenticated
// lead route. Enforcement is per-route via requirePermission below; row-level
// scoping (Sales Exec → assigned, Agent → own) is applied in the service.
router.use(scopeBuilder);

router.post(
  "/",
  requirePermission(MODULES.LEAD, ACTIONS.CREATE),
  validateRequest(createLeadSchema, REQUEST_SOURCE.BODY),
  createLead,
);

// Force create a new lead (skip email duplicate check)
router.post(
  "/force",
  requirePermission(MODULES.LEAD, ACTIONS.CREATE),
  validateRequest(createLeadSchema, REQUEST_SOURCE.BODY),
  forceCreateLead,
);

// Get all leads with filtering and pagination
router.get(
  "/",
  requirePermission(MODULES.LEAD, ACTIONS.READ),
  validateRequest(getAllLeadsQuerySchema, REQUEST_SOURCE.QUERY),
  getAllLeads,
);

// Get lead statistics
router.get("/stats", requirePermission(MODULES.LEAD, ACTIONS.READ), getLeadStats);

// Get sales dashboard aggregated data
router.get("/sales-dashboard", requirePermission(MODULES.LEAD, ACTIONS.READ), getSalesDashboard);

// Get lead activity log
router.get(
  "/:leads_id/activity-log",
  requirePermission(MODULES.LEAD, ACTIONS.READ),
  validateRequest(getLeadByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(getLeadActivityLogQuerySchema, REQUEST_SOURCE.QUERY),
  getLeadActivityLog,
);

// Get lead by ID
router.get(
  "/:leads_id",
  requirePermission(MODULES.LEAD, ACTIONS.READ),
  validateRequest(getLeadByIdSchema, REQUEST_SOURCE.PARAMS),
  getLeadById,
);

// Update lead
router.put(
  "/:leads_id",
  requirePermission(MODULES.LEAD, ACTIONS.UPDATE),
  validateRequest(getLeadByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateLeadSchema, REQUEST_SOURCE.BODY),
  updateLead,
);

// Update lead status
router.patch(
  "/:leads_id/status",
  requirePermission(MODULES.LEAD, ACTIONS.UPDATE),
  validateRequest(getLeadByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateLeadStatusSchema, REQUEST_SOURCE.BODY),
  updateLeadStatus,
);

// Assign lead to user
router.put(
  "/:leads_id/assign",
  requirePermission(MODULES.LEAD, ACTIONS.UPDATE),
  validateRequest(getLeadByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(assignLeadSchema, REQUEST_SOURCE.BODY),
  assignLead,
);

// Delete lead
router.delete(
  "/:leads_id",
  requirePermission(MODULES.LEAD, ACTIONS.DELETE),
  validateRequest(getLeadByIdSchema, REQUEST_SOURCE.PARAMS),
  deleteLead,
);

// Convert lead to opportunity — creates an opportunity, so guard on OPPORTUNITY.
router.post(
  "/:leads_id/convert",
  requirePermission(MODULES.OPPORTUNITY, ACTIONS.CREATE),
  validateRequest(getLeadByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(convertLeadToOpportunitySchema, REQUEST_SOURCE.BODY),
  convertLeadToOpportunity,
);
router.delete(
  "/:leads_id/hl-package",
  requirePermission(MODULES.LEAD, ACTIONS.UPDATE),
  validateRequest(getLeadByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(removeHLPackageSchema, REQUEST_SOURCE.BODY),
  removeHLPackage,
);

router.get(
  "/activity-log/:leads_id",
  requirePermission(MODULES.LEAD, ACTIONS.READ),
  validateRequest(getLeadByIdSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(getLeadActivityLogQuerySchema, REQUEST_SOURCE.QUERY),
  getLeadActivityLog,
);

// Get all lead actions (notes, tasks, appointments, sms)
router.get(
  "/:leads_id/actions",
  requirePermission(MODULES.LEAD, ACTIONS.READ),
  validateRequest(getLeadByIdSchema, REQUEST_SOURCE.PARAMS),
  getAllLeadActions,
);

// Get all documents for a lead, grouped into a folder hierarchy
router.get(
  "/:leads_id/documents",
  requirePermission(MODULES.LEAD, ACTIONS.READ),
  validateRequest(getLeadByIdSchema, REQUEST_SOURCE.PARAMS),
  getLeadDocuments,
);

export default router;
