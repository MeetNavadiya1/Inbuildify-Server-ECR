import express from "express";

const router = express.Router();
import { getConditions } from "./condition.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.get("/conditions", getConditions);

export default router;
