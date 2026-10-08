import express from "express";

import { adminLogin, adminMe, adminLogout } from "./admin-auth.controller.js";
import { adminLoginSchema } from "./admin-auth.validation.js";
import { validateRequest } from "../../../middleware/validateRequestMiddleware.js";
import adminAuthMiddleware from "../../../middleware/adminAuthMiddleware.js";
import camelToSnakeMiddleware from "../../../middleware/caseConverterMiddleware.js";
import { REQUEST_SOURCE } from "../../../config/constants.js";

const router = express.Router();

router.post(
  "/login",
  camelToSnakeMiddleware,
  validateRequest(adminLoginSchema, REQUEST_SOURCE.BODY),
  adminLogin,
);

router.use(adminAuthMiddleware);

router.get("/me", adminMe);
router.post("/logout", adminLogout);

export default router;
