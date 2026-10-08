import express from "express";

const router = express.Router();

import {
  createSupplierContact,
  getAllSupplierContacts,
  deleteSupplierContact,
  updateSupplierContact,
} from "./supplier-contact.controller.js";
import {
  createSupplierContactSchema,
  getAllSupplierContactsSchema,
  deleteSupplierContactSchema,
  updateSupplierContactParamsSchema,
  updateSupplierContactSchema,
} from "./supplier-contact.validation.js";
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
  validateRequest(createSupplierContactSchema, REQUEST_SOURCE.BODY),
  createSupplierContact,
);

router.get(
  "/",
  validateRequest(getAllSupplierContactsSchema, REQUEST_SOURCE.QUERY),
  getAllSupplierContacts,
);

router.delete(
  "/:supplier_contact_id",
  validateRequest(deleteSupplierContactSchema, REQUEST_SOURCE.PARAMS),
  deleteSupplierContact,
);

router.put(
  "/:supplier_contact_id",
  validateRequest(updateSupplierContactParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateSupplierContactSchema, REQUEST_SOURCE.BODY),
  updateSupplierContact,
);

export default router;
