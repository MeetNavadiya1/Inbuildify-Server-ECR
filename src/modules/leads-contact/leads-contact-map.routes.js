import express from "express";

const router = express.Router();

import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { createLeadContactMapSchema, getByLeadParamsSchema, deleteParamsSchema } from "./leads-contact-map.validation.js";
import controller from "./leads-Contact-map.controller.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.post(
  "/",
  camelToSnakeMiddleware,
  validateRequest(createLeadContactMapSchema, REQUEST_SOURCE.BODY),
  controller.createLeadContactMap,
);

router.get(
  "/:leads_id",
  validateRequest(getByLeadParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.getContactsByLeadId,
);

router.delete(
  "/:id",
  validateRequest(deleteParamsSchema, REQUEST_SOURCE.PARAMS),
  controller.deleteLeadContactMap,
);

export default router;
