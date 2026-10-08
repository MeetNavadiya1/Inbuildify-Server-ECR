import express from "express";

const router = express.Router();

import {
  createDocumentFileNamingRule,
  getAllDocumentFileNamingRules,
  deleteDocumentFileNamingRule,
  updateDocumentFileNamingRule,
  getNamingFormat,
  createNamingFormat,
} from "./document-file-naming-rule.controller.js";
import {
  createDocumentFileNamingRuleSchema,
  getAllDocumentFileNamingRulesSchema,
  deleteDocumentFileNamingRuleSchema,
  updateDocumentFileNamingRuleParamsSchema,
  updateDocumentFileNamingRuleSchema,
  updateNamingFormatSchema,
} from "./document-file-naming-rule.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createDocumentFileNamingRuleSchema, REQUEST_SOURCE.BODY),
  createDocumentFileNamingRule,
);

router.get(
  "/",
  validateRequest(getAllDocumentFileNamingRulesSchema, REQUEST_SOURCE.QUERY),
  getAllDocumentFileNamingRules,
);

router.delete(
  "/:document_file_naming_rule_id",
  validateRequest(deleteDocumentFileNamingRuleSchema, REQUEST_SOURCE.PARAMS),
  deleteDocumentFileNamingRule,
);

router.put(
  "/:document_file_naming_rule_id",
  validateRequest(
    updateDocumentFileNamingRuleParamsSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  validateRequest(updateDocumentFileNamingRuleSchema, REQUEST_SOURCE.BODY),
  updateDocumentFileNamingRule,
);

router.post(
  "/naming-format",
  validateRequest(updateNamingFormatSchema, REQUEST_SOURCE.BODY),
  createNamingFormat,
);

router.get(
  "/naming-format",
  getNamingFormat,
);

export default router;
