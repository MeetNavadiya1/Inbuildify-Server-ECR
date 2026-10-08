import "./src/utils/overrideConsole.js";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

import { env } from "./src/config/env.config.js";
import { errorResponse } from "./src/helper/response.js";
import sampleDataFlagMiddleware from "./src/middleware/sampleDataFlagMiddleware.js";
import generateSwaggerSpec from "./src/config/swagger.js";
import routes from "./src/routes/index.js";

import { connectPostgre } from "./src/config/postgre.connect.js";
import logger from "./src/utils/logger.js";
import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";
import "./src/workers/commencementLetterWorker.js";
import "./src/workers/jobCompletionApprovalWorker.js";
import "./src/workers/colorEmailWorker.js";
import sampleDataQueue from "./src/queues/sampleDataQueue.js";

import emailQueue from "./src/queues/emailQueue.js";
import pdfQueue from "./src/queues/pdfQueue.js";
import jobAutomationQueue from "./src/workers/jobAutomationWorker.js";
import { warmupBrowser } from "./src/modules/quotation/pdf.service.js";

import passport from "passport";
import "./src/config/passport.config.js";

import { createHash, timingSafeEqual } from "node:crypto";
import { requestLogger } from "./src/middleware/request-logger.middleware.js";

const app = express();

app.use(
  cors({
    origin: "*",
    maxAge: 600,
  }),
);
app.use(express.json({
  limit: "25mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));

const PORT = Number(env.PORT) || 5000;
app.use(passport.initialize());

app.use(requestLogger)
app.use(sampleDataFlagMiddleware);

routes(app);

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/ops/queues");

createBullBoard({
  queues: [
    new BullAdapter(emailQueue),
    new BullAdapter(pdfQueue),
    new BullAdapter(jobAutomationQueue),
    new BullAdapter(sampleDataQueue),
  ],
  serverAdapter,
});

if (!process.env.OPS_USER || !process.env.OPS_PASSWORD) {
  console.warn("⚠️  OPS_USER / OPS_PASSWORD not set — /ops/queues and /api-docs are locked.");
}

const opsGuard = (req, res, next) => {
  const deny = () => {
    res.set("WWW-Authenticate", "Basic realm=\"ops\"");
    return res.status(401).end();
  };

  const { OPS_USER, OPS_PASSWORD } = process.env;
  if (!OPS_USER || !OPS_PASSWORD) {
    return deny();
  }

  const [scheme, encoded] = (req.headers.authorization || "").split(" ");
  if (scheme !== "Basic" || !encoded) {
    return deny();
  }

  const decoded = Buffer.from(encoded, "base64").toString();
  const separator = decoded.indexOf(":");
  if (separator === -1) {
    return deny();
  }

  const user = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);

  const digest = (value) => createHash("sha256").update(value).digest();
  const matches =
    timingSafeEqual(digest(user), digest(OPS_USER)) &&
    timingSafeEqual(digest(password), digest(OPS_PASSWORD));

  return matches ? next() : deny();
};

app.use("/ops/queues", opsGuard, serverAdapter.getRouter());

const swaggerSpec = generateSwaggerSpec(app);

app.use("/api-docs", opsGuard, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("*", (req, res) => {
  return errorResponse(
    res,
    404,
    "Please check endPoint, not any api of this route!",
  );
});

app.use((err, req, res, next) => {
  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) {
    return next(err);
  }
  return errorResponse(
    res,
    err.status || err.statusCode || 500,
    err.message || "Internal Server Error",
  );
});

connectPostgre()
  .then(() => {
    const server = app.listen(PORT, (err, res) => {
      if (!err) {
        logger.info(`server running on PORT ${PORT}...`);
        warmupBrowser();
      }

      console.log(`
  ░██           ░████████              ░██░██        ░██ ░██    ░████            
                ░██    ░██                ░██        ░██       ░██               
  ░██░████████  ░██    ░██  ░██    ░██ ░██░██  ░████████ ░██░████████ ░██    ░██ 
  ░██░██    ░██ ░████████   ░██    ░██ ░██░██ ░██    ░██ ░██   ░██    ░██    ░██ 
  ░██░██    ░██ ░██     ░██ ░██    ░██ ░██░██ ░██    ░██ ░██   ░██    ░██    ░██ 
  ░██░██    ░██ ░██     ░██ ░██   ░███ ░██░██ ░██   ░███ ░██   ░██    ░██   ░███ 
  ░██░██    ░██ ░█████████   ░█████░██ ░██░██  ░█████░██ ░██   ░██     ░█████░██ 
                                                                            ░██ 
                                                                      ░███████                                                                                     
      `);
    });

    server.on("error", (error) => {
      console.error(`Critical: could not bind port ${PORT}.`, error);
      process.exit(1);
    });
  })
  .catch((error) => {
    console.error("Critical: Could not connect to database. Server not started.", error);
    process.exit(1);
  });

const cleanupAndExit = async (err) => {
  if (err) {
    console.error("Unhandled error, shutting down:", err);
  }
  console.log("Gracefully closing Redis connections before exit...");
  try {
    await Promise.all([
      emailQueue.close(),
      pdfQueue.close(),
      jobAutomationQueue.close(),
    ]);
    console.log("Redis connections closed successfully.");
  } catch (error) {
    console.error("Error closing Redis connections:", error);
  }
  process.exit(err ? 1 : 0);
};

process.on("SIGINT", () => cleanupAndExit());
process.on("SIGTERM", () => cleanupAndExit());
process.on("SIGUSR2", () => cleanupAndExit());

process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught exception — shutting down:", err);
  cleanupAndExit(err);
});

process.on("unhandledRejection", (reason) => {
  // console.error("⚠️ Unhandled promise rejection — request failed, server still up:", reason);
});
