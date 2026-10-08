import express from "express";
import authMiddleware from "../../middleware/authMiddleware.js";
import roleMiddleware from "../../middleware/roleMiddleware.js";
import camelToSnakeMiddleware from "../../middleware/caseConverterMiddleware.js";
import { env } from "../../config/env.config.js";

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware);
router.use(camelToSnakeMiddleware);

router.get("/app", (req, res) => {
  res.json({
    success: true,
    data: {
      defaultToEmail: env.EMAIL.DEFAULT_TO_EMAIL,
    },
  });
});

export default router;
