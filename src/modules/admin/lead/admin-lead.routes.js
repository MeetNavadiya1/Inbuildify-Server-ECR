import express from "express";

import { listLeads, getLeadStats, listClients } from "./admin-lead.controller.js";
import { listLeadsSchema, listClientsSchema, leadStatsSchema } from "./admin-lead.validation.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import { requireAdminPermission, ADMIN_PERMISSIONS } from "../../../middleware/adminPermissionMiddleware.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";

export const leadRouter = express.Router();

leadRouter.use(requireAdminPermission(ADMIN_PERMISSIONS.LEAD_READ));

leadRouter.get(
  "/stats",
  validateRequest(leadStatsSchema, REQUEST_SOURCE.QUERY),
  getLeadStats,
);

leadRouter.get(
  "/",
  validateRequest(listLeadsSchema, REQUEST_SOURCE.QUERY),
  listLeads,
);

export const clientRouter = express.Router();

clientRouter.get(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.CLIENT_READ),
  validateRequest(listClientsSchema, REQUEST_SOURCE.QUERY),
  listClients,
);

export default { leadRouter, clientRouter };
