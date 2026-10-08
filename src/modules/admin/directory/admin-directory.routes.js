import express from "express";

import { listContractors, listSuppliers } from "./admin-directory.controller.js";
import { listContractorsSchema, listSuppliersSchema } from "./admin-directory.validation.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import { requireAdminPermission, ADMIN_PERMISSIONS } from "../../../middleware/adminPermissionMiddleware.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";

export const contractorRouter = express.Router();

contractorRouter.get(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.CONTRACTOR_READ),
  validateRequest(listContractorsSchema, REQUEST_SOURCE.QUERY),
  listContractors,
);

export const supplierRouter = express.Router();

supplierRouter.get(
  "/",
  requireAdminPermission(ADMIN_PERMISSIONS.SUPPLIER_READ),
  validateRequest(listSuppliersSchema, REQUEST_SOURCE.QUERY),
  listSuppliers,
);

export default { contractorRouter, supplierRouter };
