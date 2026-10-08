import express from "express";

const router = express.Router();

import {
  getFunctionalities,
  getFunctionalitiesByScreen,
} from "./functionality.controller.js";
import {
  getFunctionalitiesSchema,
  getFunctionalitiesByScreenSchema,
} from "./functionality.validation.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);


router.get("/", getFunctionalities);

router.get(
  "/:screenId",
  validateRequest(getFunctionalitiesByScreenSchema, REQUEST_SOURCE.PARAMS),
  getFunctionalitiesByScreen,
);


export default router;
