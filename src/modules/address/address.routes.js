import express from "express";

const router = express.Router();
import { createAddress } from "./address.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { createAddressSchema } from "./address.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.post(
  "/",
  validateRequest(createAddressSchema, REQUEST_SOURCE.BODY),
  createAddress,
);

export default router;
