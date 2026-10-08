import express from "express";

const router = express.Router();

import {
  createUserPasswordHistory,
  getUserPasswordHistory,
  deleteUserPasswordHistory,
  getUserPasswordHistoryById,
  deleteUserPasswordHistoryByUserId,
} from "./user-password-history.controller.js";
import {
  createUserPasswordHistorySchema,
  getAllUserPasswordHistorySchema,
  deleteUserPasswordHistorySchema,
  getUserPasswordHistoryByIdSchema,
  deleteUserPasswordHistoryByUserIdSchema,
} from "./user-password-history.validation.js";
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
  validateRequest(createUserPasswordHistorySchema, REQUEST_SOURCE.BODY),
  createUserPasswordHistory,
);

router.get(
  "/",
  validateRequest(getAllUserPasswordHistorySchema, REQUEST_SOURCE.QUERY),
  getUserPasswordHistory,
);

router.delete(
  "/:id",
  validateRequest(deleteUserPasswordHistorySchema, REQUEST_SOURCE.PARAMS),
  deleteUserPasswordHistory,
),
router.get(
  "/:id",
  validateRequest(getUserPasswordHistoryByIdSchema, REQUEST_SOURCE.PARAMS),
  getUserPasswordHistoryById,
);

router.delete(
  "/user/:user_id",
  validateRequest(
    deleteUserPasswordHistoryByUserIdSchema,
    REQUEST_SOURCE.PARAMS,
  ),
  deleteUserPasswordHistoryByUserId,
);

export default router;
