import express from "express";

const router = express.Router();

import { getCompany, upsertCompany } from "./company.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import { REQUEST_SOURCE } from "../../config/constants.js";
import { upsertCompanySchema } from "./company.validation.js";
import { createUpload, handleMulterError } from "../../utils/s3Upload.js";
import {
  scopeBuilder,
  requirePermission,
  MODULES,
  ACTIONS,
} from "../../middleware/rbac/index.js";

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(scopeBuilder);

const upload = createUpload("company");

// Reading your OWN company (branding/identity context) stays open to any
// authenticated user — the matrix's company restriction targets management
// (edit/create), enforced on the upsert below. scopeBuilder still narrows scope.
router.get("/", getCompany);

router.post(
  "/",
  requirePermission(MODULES.COMPANY, ACTIONS.UPDATE),
  upload.fields([
    { name: "emailSignatureLogo", maxCount: 1 },
    { name: "companyLogo", maxCount: 1 },
  ]),
  handleMulterError,
  (req, res, next) => {
    if (!req.body.address) {
      const address = {};
      for (const key in req.body) {
        const match = key.match(/^address\[(\w+)\]$/);
        if (match) {
          address[match[1]] = req.body[key];
          delete req.body[key];
        }
      }
      if (Object.keys(address).length > 0) req.body.address = address;
    }
    if (typeof req.body.address === "string") {
      try {
        req.body.address = JSON.parse(req.body.address);
      } catch {
        return res.status(400).json({ message: "Invalid address format" });
      }
    }
    next();
  },
  camelToSnakeMiddleware,
  validateRequest(upsertCompanySchema, REQUEST_SOURCE.FORM_DATA),
  upsertCompany,
);

router.patch(
  "/:id",
  upload.fields([
    { name: "emailSignatureLogo", maxCount: 1 },
    { name: "companyLogo", maxCount: 1 },
  ]),
  handleMulterError,
  (req, res, next) => {
    // Parse address if it's a string in form data
    if (req.body.address && typeof req.body.address === "string") {
      try {
        req.body.address = JSON.parse(req.body.address);
      } catch {
        return res.status(400).json({ message: "Invalid address format" });
      }
    }
    next();
  },
  camelToSnakeMiddleware,
  validateRequest(upsertCompanySchema, REQUEST_SOURCE.FORM_DATA),
  upsertCompany,
);

export default router;
