import express from "express";
import { getBestFacades } from "./admin-facade.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { getUserRole } from "../../helper/common.js";

const router = express.Router();
router.get("/best-facades", authMiddleware, roleMiddleware(getUserRole('Super Admin')), getBestFacades);

export default router;
