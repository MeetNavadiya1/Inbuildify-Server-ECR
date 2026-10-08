import express from "express";

const router = express.Router();

import {
  createAppointment,
  getAllAppointments,
  getAppointmentTabCounts,
  deleteAppointment,
  updateAppointment,
  searchUserBuilderTables,
  searchLeadsForLinkTo,
} from "./appointment.controller.js";
import {
  createAppointmentSchema,
  getAllAppointmentSchema,
  getAppointmentTabCountsSchema,
  deleteAppointmentSchema,
  updateAppointmentParamsSchema,
  updateAppointmentSchema,
} from "./appointment.validation.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.post(
  "/",
  validateRequest(createAppointmentSchema, REQUEST_SOURCE.BODY),
  createAppointment,
);
router.get(
  "/tab-counts",
  validateRequest(getAppointmentTabCountsSchema, REQUEST_SOURCE.QUERY),
  getAppointmentTabCounts,
);
router.get(
  "/",
  validateRequest(getAllAppointmentSchema, REQUEST_SOURCE.QUERY),
  getAllAppointments,
);

router.get("/search", searchUserBuilderTables);
router.get("/search-leads", searchLeadsForLinkTo);

router.delete(
  "/:appointment_id",
  validateRequest(deleteAppointmentSchema, REQUEST_SOURCE.PARAMS),
  deleteAppointment,
);

router.put(
  "/:appointment_id",
  validateRequest(updateAppointmentParamsSchema, REQUEST_SOURCE.PARAMS),
  validateRequest(updateAppointmentSchema, REQUEST_SOURCE.BODY),
  updateAppointment,
);

export default router;
