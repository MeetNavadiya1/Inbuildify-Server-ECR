import express from "express";

const router = express.Router();

import { getSalesProcessStageFunctionalities } from "./sales-process-stage-functionality.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.get(
  "/",
  getSalesProcessStageFunctionalities,
);

export default router;
