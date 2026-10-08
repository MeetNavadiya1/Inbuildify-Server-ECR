import express from "express";

import { listBuilders, getBuilder } from "./admin-builder.controller.js";
import { listBuildersSchema, builderIdSchema } from "./admin-builder.validation.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import { requireAdminPermission, ADMIN_PERMISSIONS } from "../../../middleware/adminPermissionMiddleware.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";

export const builderRouter = express.Router();

builderRouter.use(requireAdminPermission(ADMIN_PERMISSIONS.BUILDER_READ));

builderRouter.get(
  "/",
  validateRequest(listBuildersSchema, REQUEST_SOURCE.QUERY),
  listBuilders,
);

builderRouter.get(
  "/:company_id",
  validateRequest(builderIdSchema, REQUEST_SOURCE.PARAMS),
  getBuilder,
);

export default builderRouter;
