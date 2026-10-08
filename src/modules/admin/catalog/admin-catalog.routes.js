import express from "express";

import { listFacades, listDwellings } from "./admin-catalog.controller.js";
import { listFacadesSchema, listDwellingsSchema } from "./admin-catalog.validation.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import { requireAdminPermission, ADMIN_PERMISSIONS } from "../../../middleware/adminPermissionMiddleware.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";

export const facadeRouter = express.Router();

facadeRouter.get(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.FACADE_READ),
  validateRequest(listFacadesSchema, REQUEST_SOURCE.QUERY),
  listFacades,
);

export const dwellingRouter = express.Router();

dwellingRouter.get(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.DWELLING_READ),
  validateRequest(listDwellingsSchema, REQUEST_SOURCE.QUERY),
  listDwellings,
);

export default { facadeRouter, dwellingRouter };
