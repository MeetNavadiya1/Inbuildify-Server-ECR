import express from "express";

const router = express.Router();

import { getRoleTypes, getAllRoleTypes } from "./role-type.controller.js";
import {  getRoleTypeSchema, getAllRoletypeschema } from "./role-type.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get(
  "/",
  validateRequest(getRoleTypeSchema, REQUEST_SOURCE.QUERY),
  getRoleTypes,
);

router.get(
  "/all",
  validateRequest(getAllRoletypeschema, REQUEST_SOURCE.QUERY),
  getAllRoleTypes,
);

export default router;
