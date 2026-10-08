import express from "express";

const router = express.Router();

import {
  createUserGroup,
  getAllUserGroups,
  updateUserGroup,
  updateUserGroupIsActive,
} from "./user-group.controller.js";
import {
  createUserGroupSchema,
  getAllUserGroupSchema,
  updateUserGroupParamsSchema,
  updateUserGroupSchema,
} from "./user-group.validation.js";
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
  validateRequest(createUserGroupSchema, REQUEST_SOURCE.BODY),
  createUserGroup,
);

router.get(
  "/",
  validateRequest(getAllUserGroupSchema, REQUEST_SOURCE.QUERY),
  getAllUserGroups,
);

router.put(
  "/is-active/:user_group_id",
  validateRequest(updateUserGroupParamsSchema, REQUEST_SOURCE.PARAMS),
  updateUserGroupIsActive,
);

router.put(
  "/:user_group_id",
  validateRequest(updateUserGroupParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateUserGroupSchema, REQUEST_SOURCE.BODY),
  updateUserGroup,
);

export default router;
