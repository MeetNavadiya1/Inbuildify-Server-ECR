import express from "express";

const router = express.Router();
import { getCities } from "./city.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { getCitiesSchema } from "./city.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.get("/", validateRequest(getCitiesSchema, REQUEST_SOURCE.QUERY), getCities);

export default router;
