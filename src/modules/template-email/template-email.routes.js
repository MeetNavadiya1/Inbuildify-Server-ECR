import express from "express";

const router = express.Router();

import {
  createTemplateEmail,
  updateTemplateEmail,
  deleteTemplateEmail,
  updateTemplateEmailIsActive,
  getTemplateEmails,
} from "./template-email.controller.js";
import {
  createTemplateEmailSchema,
  getAllTemplateEmailSchema,
  updateTemplateEmailParamsSchema,
  updateTemplateEmailSchem,
  deleteTemplateEmailSchema,
  updateTemplateEmailIsActiveSchema,
} from "./template-email.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);
router.use(scopeBuilder);

router.post(
  "/",
  requirePermission(MODULES.EMAIL_TEMPLATE, ACTIONS.CREATE),
  validateRequest(createTemplateEmailSchema, REQUEST_SOURCE.BODY),
  createTemplateEmail,
);

router.get(
  "/",
  requirePermission(MODULES.EMAIL_TEMPLATE, ACTIONS.READ),
  getTemplateEmails,
);

router.put(
  "/:id",
  requirePermission(MODULES.EMAIL_TEMPLATE, ACTIONS.UPDATE),
  validateRequest(updateTemplateEmailParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateTemplateEmailSchem, REQUEST_SOURCE.BODY),
  updateTemplateEmail,
);

router.delete(
  "/:template_email_id",
  requirePermission(MODULES.EMAIL_TEMPLATE, ACTIONS.DELETE),
  validateRequest(deleteTemplateEmailSchema, REQUEST_SOURCE.PARAMS),
  deleteTemplateEmail,
);

router.put(
  "/is-active/:id",
  requirePermission(MODULES.EMAIL_TEMPLATE, ACTIONS.UPDATE),
  validateRequest(updateTemplateEmailParamsSchema, REQUEST_SOURCE.PARAMS),
  updateTemplateEmailIsActive,
);
export default router;
