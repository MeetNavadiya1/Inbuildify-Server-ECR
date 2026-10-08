import express from "express";

const router = express.Router();

import {
  createMasterFacade,
  getMasterFacades,
  getMasterFacadeById,
  updateMasterFacade,
  deleteMasterFacade,
  toggleMasterFacadeCollab,
  getPublicCollabFacades,
} from "./master-facade.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";
import {
  createMasterFacadeSchema,
  getMasterFacadeByIdSchema,
  getMasterFacadesSchema,
  updateMasterFacadeParamsSchema,
  updateMasterFacadeSchema,
  deleteMasterFacadeSchema,
} from "./master-facade.validation.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

// Public API
router.get(
  "/public-collab",
  getPublicCollabFacades,
);

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

const upload = createUpload("facade");

router.post(
  "/",
  requirePermission(MODULES.FACADE, ACTIONS.CREATE),
  upload.single("image"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(createMasterFacadeSchema, REQUEST_SOURCE.FORM_DATA),
  createMasterFacade,
);

router.get(
  "/",
  requirePermission(MODULES.FACADE, ACTIONS.READ),
  camelToSnakeMiddleware,
  validateRequest(getMasterFacadesSchema, REQUEST_SOURCE.QUERY),
  getMasterFacades,
);

router.get(
  "/:id",
  requirePermission(MODULES.FACADE, ACTIONS.READ),
  camelToSnakeMiddleware,
  validateRequest(getMasterFacadeByIdSchema, REQUEST_SOURCE.PARAMS),
  getMasterFacadeById,
);

router.put(
  "/toggle-collab/:id",
  requirePermission(MODULES.FACADE, ACTIONS.UPDATE),
  camelToSnakeMiddleware,
  validateRequest(getMasterFacadeByIdSchema, REQUEST_SOURCE.PARAMS),
  toggleMasterFacadeCollab,
);

router.put(
  "/:facade_id",
  requirePermission(MODULES.FACADE, ACTIONS.UPDATE),
  upload.single("image"),
  handleMulterError,
  camelToSnakeMiddleware,
  validateRequest(updateMasterFacadeParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateMasterFacadeSchema, REQUEST_SOURCE.FORM_DATA),
  updateMasterFacade,
);

router.delete(
  "/:facade_id",
  requirePermission(MODULES.FACADE, ACTIONS.DELETE),
  camelToSnakeMiddleware,
  validateRequest(deleteMasterFacadeSchema, REQUEST_SOURCE.PARAMS),
  deleteMasterFacade,
);

export default router;
