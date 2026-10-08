import express from "express";

import adminAuthRoutes from "./auth/admin-auth.routes.js";
import { leadRouter, clientRouter } from "./lead/admin-lead.routes.js";
import landingLeadRouter from "./landing-lead/admin-landing-lead.routes.js";
import signupRequestRouter from "./signup-request/admin-signup-request.routes.js";
import demoRequestRouter from "./demo-request/admin-demo-request.routes.js";
import builderRouter from "./builder/admin-builder.routes.js";
import { contractorRouter, supplierRouter } from "./directory/admin-directory.routes.js";
import { facadeRouter, dwellingRouter } from "./catalog/admin-catalog.routes.js";
import featuredFacadeRouter from "./featured-facade/admin-featured-facade.routes.js";
import blogRouter from "./blog/admin-blog.routes.js";
import adminAuthMiddleware from "../../middleware/adminAuthMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";

const router = express.Router();

router.use("/auth", adminAuthRoutes);

router.use(adminAuthMiddleware);
router.use(camelToSnakeMiddleware);

router.use("/leads", leadRouter);
router.use("/landing-leads", landingLeadRouter);
router.use("/signup-requests", signupRequestRouter);
router.use("/demo-requests", demoRequestRouter);
router.use("/builders", builderRouter);
router.use("/clients", clientRouter);
router.use("/contractors", contractorRouter);
router.use("/suppliers", supplierRouter);
router.use("/facades", facadeRouter);
router.use("/featured-facades", featuredFacadeRouter);
router.use("/dwellings", dwellingRouter);
router.use("/blog", blogRouter);

export default router;
