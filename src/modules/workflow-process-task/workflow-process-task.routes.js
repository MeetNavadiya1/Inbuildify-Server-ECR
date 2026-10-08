import express from "express";

const router = express.Router();
import { getAllWorkFlowProcessTask, deleteWorkFlowProcessTask } from "./workflow-process-task.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { getAllWorkFlowProcessTaskSchema, deleteWorkFlowProcessTaskSchema } from "./workflow-process-task.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.get("/", validateRequest(getAllWorkFlowProcessTaskSchema, REQUEST_SOURCE.QUERY), getAllWorkFlowProcessTask);
router.delete("/:action_id", validateRequest(deleteWorkFlowProcessTaskSchema, REQUEST_SOURCE.PARAMS), deleteWorkFlowProcessTask);

export default router;
