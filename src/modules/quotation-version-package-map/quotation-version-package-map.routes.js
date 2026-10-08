import express from "express";

const router = express.Router();

// import authMiddleware from "../../middleware/authMiddleware.js";
// import roleMiddleware from "../../middleware/roleMiddleware.js";
// import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
// import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
// import { REQUEST_SOURCE } from "../../config/constants.js";
// import {
//   createPackageMapSchema,
//   getPackageMapsByVersionSchema,
//   deletePackageMapParamsSchema,
// } from "./quotation-version-package-map.validation.js";
// import packageMapController from "./quotation-version-package-map.controller.js";

// router.use(authMiddleware);
// router.use(roleMiddleware);

// router.post(
//   "/",
//   camelToSnakeMiddleware,
//   validateRequest(createPackageMapSchema, REQUEST_SOURCE.BODY),
//   packageMapController.createPackageMap,
// );

// router.get(
//   "/:quotation_version_id",
//   validateRequest(getPackageMapsByVersionSchema, REQUEST_SOURCE.PARAMS),
//   packageMapController.getPackagesByVersionId,
// );

// router.delete(
//   "/:id",
//   validateRequest(deletePackageMapParamsSchema, REQUEST_SOURCE.PARAMS),
//   packageMapController.deletePackageMap,
// );

export default router;
