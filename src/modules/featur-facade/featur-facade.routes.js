import express from "express";
import {
    getFeatureFacade,
    getManagedFeatureFacade,
    createFeatureFacade,
    getFeatureFacadeById,
    updateFeatureFacade,
    deleteFeatureFacade,
} from "./featur-facade.controller.js";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { validateRequest } from "../../middleware/validateRequestMiddleware.js";
import {
    createFeatureFacadeSchema,
    updateFeatureFacadeSchema,
    getFeatureFacadeByIdSchema,
    getFeatureFacadeSchema,
} from "./featur-facade.validation.js";
import { REQUEST_SOURCE } from "../../config/constants.js";

const router = express.Router();

router.get(
    "/",
    camelToSnakeMiddleware,
    validateRequest(getFeatureFacadeSchema, REQUEST_SOURCE.QUERY),
    getFeatureFacade
);

// Must stay above "/:id" — registered after it, Express would match "manage" as
// an id and the UUID rule would reject it. Auth is applied inline because the
// router-level `router.use(authMiddleware)` below sits after the public routes.
router.get(
    "/manage",
    authMiddleware,
    roleMiddleware,
    camelToSnakeMiddleware,
    validateRequest(getFeatureFacadeSchema, REQUEST_SOURCE.QUERY),
    getManagedFeatureFacade
);

//not used
router.get(
    "/:id",
    camelToSnakeMiddleware,
    validateRequest(getFeatureFacadeByIdSchema, REQUEST_SOURCE.PARAMS),
    getFeatureFacadeById
);

router.use(authMiddleware);
router.use(roleMiddleware);

router.post(
    "/",
    camelToSnakeMiddleware,
    validateRequest(createFeatureFacadeSchema, REQUEST_SOURCE.BODY),
    createFeatureFacade
);


router.put(
    "/:id",
    camelToSnakeMiddleware,
    validateRequest(getFeatureFacadeByIdSchema, REQUEST_SOURCE.PARAMS),
    validateRequest(updateFeatureFacadeSchema, REQUEST_SOURCE.BODY),
    updateFeatureFacade
);

router.delete(
    "/delete/:id",
    camelToSnakeMiddleware,
    validateRequest(getFeatureFacadeByIdSchema, REQUEST_SOURCE.PARAMS),
    deleteFeatureFacade
);

export default router;
