import express from "express";

const router = express.Router();

import { getConstructionEtsRechargeSettings, updateConstructionEtsRechargeSettings } from "./construction-ets-recharge.controller.js";
import { updateConstructionEtsRechargeSettingsSchema } from "./construction-ets-recharge.validation.js";
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
  getConstructionEtsRechargeSettings,
);

router.put(
  "/",
  validateRequest(updateConstructionEtsRechargeSettingsSchema, REQUEST_SOURCE.BODY),
  updateConstructionEtsRechargeSettings,
);

export default router;
