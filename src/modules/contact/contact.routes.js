import express from "express";

const router = express.Router();

import {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
  convertContactToUser,
} from "./contact.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import {
  createContactSchema,
  updateContactSchema,
  convertContactSchema,
  getContactsSchema,
} from "./contact.validation.js";

/* ============================================================
    CONTACT ROUTES
============================================================ */

/**
 * GET /contacts
 * List all contacts for the builder
 */
router.get(
  "/",
  camelToSnakeMiddleware,
  authMiddleware,
  roleMiddleware,
  validateRequest(getContactsSchema, REQUEST_SOURCE.QUERY),
  getContacts,
);

/**
 * GET /contacts/:contactId
 * View a single contact
 */
router.get(
  "/:contact_id",
  camelToSnakeMiddleware,
  authMiddleware,
  roleMiddleware,
  getContactById,
);

/**
 * POST /contacts
 * Create new contact
 */
router.post(
  "/",
  camelToSnakeMiddleware,
  authMiddleware,
  roleMiddleware,
  validateRequest(createContactSchema, REQUEST_SOURCE.BODY),
  createContact,
);

/**
 * PUT /contacts/:contactId
 * Update contact
 */
router.put(
  "/:contact_id",
  camelToSnakeMiddleware,
  authMiddleware,
  roleMiddleware,
  validateRequest(updateContactSchema, REQUEST_SOURCE.BODY),
  updateContact,
);

/**
 * DELETE /contacts/:contactId
 * Soft delete contact
 */
router.delete(
  "/:contact_id",
  camelToSnakeMiddleware,
  authMiddleware,
  roleMiddleware,
  deleteContact,
);

/**
 * POST /contacts/:contactId/convert-to-user
 * Convert contact → full user with login credentials
 */
router.post(
  "/:contact_id/convert-to-user",
  camelToSnakeMiddleware,
  authMiddleware,
  roleMiddleware,
  validateRequest(convertContactSchema, REQUEST_SOURCE.BODY),
  convertContactToUser,
);

export default router;
