import express from "express";

const router = express.Router();

import {
  createBusinessContact,
  getBusinessContactsByLeadsId,
  updateBusinessContact,
  deleteBusinessContact,
} from "./business-contact.controller.js";
import {
  createBusinessContactSchema,
  getBusinessContactsByLeadsIdSchema,
  updateBusinessContactSchema,
  deleteBusinessContactSchema,
} from "./business-contact.validation.js";
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
  validateRequest(createBusinessContactSchema, REQUEST_SOURCE.BODY),
  createBusinessContact,
);


router.get(
  "/lead/:leads_id",
  validateRequest(getBusinessContactsByLeadsIdSchema, REQUEST_SOURCE.PARAMS),
  getBusinessContactsByLeadsId,
);

router.put(
  "/:business_contact_id",
  validateRequest(updateBusinessContactSchema, REQUEST_SOURCE.BODY),
  updateBusinessContact,
);

router.delete(
  "/:business_contact_id",
  validateRequest(deleteBusinessContactSchema, REQUEST_SOURCE.PARAMS),
  deleteBusinessContact,
);

export default router;
