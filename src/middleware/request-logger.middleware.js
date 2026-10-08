import crypto from "crypto";

import logger from "../utils/logger.js";

export const requestLogger = (req, res, next) => {
  const requestId =
    req.headers["x-request-id"] || crypto.randomUUID();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  const startTime = Date.now();

  logger.info("Incoming Request", {
    requestId,
    method: req.method,
    url: req.originalUrl,
    path: req.path,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    contentType: req.get("content-type"),
  });

  res.on("finish", () => {
    const durationMs = Date.now() - startTime;

    const logData = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
    };

    if (res.statusCode >= 500) {
      logger.error("Request Failed", logData);
    } else if (res.statusCode >= 400) {
      logger.warn("Request Failed", logData);
    } else {
      logger.info("Request Completed", logData);
    }
  });

  next();
};