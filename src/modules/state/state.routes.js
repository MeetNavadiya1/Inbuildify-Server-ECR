import express from "express";

const router = express.Router();
import { getState, getAllStates } from "./state.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { getStateSchema } from "./state.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.get("/", getAllStates);
router.get("/:country_id", validateRequest(getStateSchema, REQUEST_SOURCE.PARAMS), getState);

export default router;
