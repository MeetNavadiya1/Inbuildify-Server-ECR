import winston from "winston";
import util from "util";
import { env } from "../config/env.config.js";

const redactFormat = winston.format((info) => {
  const sensitiveKeys = ["authorization", "password", "token", "secret", "jwt"];

  const redact = (obj) => {
    if (typeof obj !== "object" || obj === null) {
      if (typeof obj === "string") {
        return obj.replace(/Bearer\s+[A-Za-z0-9\-._~+\/]+=*/gi, "Bearer [MASKED]");
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(redact);
    }
    const newObj = {};
    for (const key in obj) {
      if (sensitiveKeys.some((sKey) => key.toLowerCase().includes(sKey))) {
        newObj[key] = "[MASKED]";
      } else {
        newObj[key] = redact(obj[key]);
      }
    }
    return newObj;
  };

  const redactedInfo = redact(info);
  Object.assign(info, redactedInfo);
  return info;
});

const devFormat = winston.format.combine(
  redactFormat(),
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = "";
    // Filter out internal Winston Symbol properties to prevent leaking unredacted data in Symbol(splat)
    const cleanMeta = {};
    for (const key of Object.keys(meta)) {
      cleanMeta[key] = meta[key];
    }
    if (Object.keys(cleanMeta).length) {
      metaStr = `\n${util.inspect(cleanMeta, { depth: null, colors: true, compact: false })}`;
    }
    // If message is empty, don't leave a trailing space after the level label
    const msg = message ? ` ${message}` : "";
    return `[${timestamp}] ${level}:${msg}${metaStr}`;
  }),
);

const prodFormat = winston.format.combine(
  redactFormat(),
  winston.format.timestamp(),
  winston.format.json(),
);

const logger = winston.createLogger({
  level: env.NODE_ENV === "development" ? "debug" : "info",
  transports: [
    new winston.transports.Console({
      format: devFormat,
    }),
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      format: prodFormat,
    }),
    new winston.transports.File({
      filename: "logs/combined.log",
      format: prodFormat,
    }),
  ],
});

export default logger;
