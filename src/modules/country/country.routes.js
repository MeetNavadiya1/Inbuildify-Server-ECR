import express from "express";

const router = express.Router();
import { getCountries } from "./country.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.get("/", getCountries);

export default router;
