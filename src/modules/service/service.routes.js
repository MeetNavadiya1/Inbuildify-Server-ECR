import express from "express";

const router = express.Router();
import { createService, getServices, getServiceById, updateService, deleteService } from "./service.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
  createServiceSchema,
  getServiceByIdSchema,
  updateServiceParamsSchema,
  updateServiceSchema,
  deleteServiceSchema,
} from "./service.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);

router.post("/", validateRequest(createServiceSchema), createService);
router.get("/", getServices);
router.get("/:service_id", validateRequest(getServiceByIdSchema, REQUEST_SOURCE.PARAMS), getServiceById);
router.put("/:service_id", validateRequest(updateServiceParamsSchema, REQUEST_SOURCE.PARAMS), validateRequest(updateServiceSchema), updateService);
router.delete("/:service_id", validateRequest(deleteServiceSchema, REQUEST_SOURCE.PARAMS), deleteService);

export default router;
