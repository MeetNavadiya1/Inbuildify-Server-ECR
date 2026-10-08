import express from "express";

const router = express.Router();

import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";

router.use(authMiddleware);
router.use(roleMiddleware);

import { getJobProcessStageFunctionalities } from "./job-process-stage-functionality.controller.js";

router.get("/", getJobProcessStageFunctionalities);

export default router;
