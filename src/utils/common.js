import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import { env } from "../config/env.config.js";
import db from "../config/database/models/postgre-models/index.js";

import { ALLOWED_FILE_TYPES, ALLOWED_FILE_SIZE } from "../config/constants.js";

export const generateRequestId = () => {
  return uuidv4();
};

export const checkRequiredFields = (bodyFields, requiredFields) => {
  console.log(
    "🚀 ~ common.js:2 ~ checkRequiredFields ~ bodyFields:",
    bodyFields,
  );
  console.log(
    "🚀 ~ common.js:2 ~ checkRequiredFields ~ requiredFields:",
    requiredFields,
  );
  return requiredFields.every((field) => bodyFields.includes(field));
};

export const checkValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

const JWT_SECRET = env.JWT.JWT_SECRET;
const JWT_REFRESH_SECRET = env.JWT.JWT_REFRESH_SECRET;

export const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: env.JWT.JWT_SECRET_EXPIRATION || "1d",
  });
};

export const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, JWT_REFRESH_SECRET, {
    expiresIn: env.JWT.JWT_REFRESH_SECRET_EXPIRATION || "7d",
  });
};
export const decrypt = (encryptedText) => {
  if (encryptedText == null || encryptedText === "") {
    return "";
  }

  const buffer = Buffer.from(encryptedText, "base64");
  return buffer.toString("utf8");
};

export const encrypt = (text) => {
  if (text == null || text === "") {
    return "";
  }

  const buffer = Buffer.from(text, "utf8");
  return buffer.toString("base64");
};

function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, "_$1").toLowerCase();
}
function toCamelCase(str) {
  return str.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}

export function formatCamelCaseToReadable(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  return text
    .replace(/_/g, ' ') // Replace underscores with spaces
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between lowercase and uppercase
    .replace(/\b\w/g, str => str.toUpperCase()) // Capitalize first letter of each word
    .trim();
}

export function keysToSnakeCase(obj) {
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (obj !== null && typeof obj === "object" && typeof obj.toJSON === "function") {
    obj = obj.toJSON();
  }
  if (Array.isArray(obj)) {
    return obj.map(keysToSnakeCase);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        toSnakeCase(key),
        keysToSnakeCase(value),
      ]),
    );
  }
  return obj;
}

export function keysToCamelCase(obj) {
  if (obj instanceof Date) {
    return obj.toISOString();
  }
  if (obj !== null && typeof obj === "object" && typeof obj.toJSON === "function") {
    obj = obj.toJSON();
  }
  if (Array.isArray(obj)) {
    return obj.map(keysToCamelCase);
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        toCamelCase(key),
        keysToCamelCase(value),
      ]),
    );
  }
  return obj;
}

export function allowedFileData() {
  return {
    types: ALLOWED_FILE_TYPES,
    size: ALLOWED_FILE_SIZE,
  };
}

export const generateDynamicReferenceNumber = async ({
  prefix,
  tableName,
  user,
  column = "reference_no",
  padding = 4,
  includeYear = true,
  transaction = null,
}) => {
  if (!prefix || !tableName) {
    throw new Error("prefix and tableName are required");
  }

  const year = includeYear ? new Date().getFullYear().toString() : "";
  const base = `${prefix}${year}`;

  const where = [];
  const replacements = { base: `${base}%` };

  if (user?.company_id) {
    where.push(`company_id = :companyId`);
    replacements.companyId = user.company_id;
  }
  if (user?.builder_id) {
    where.push(`builder_id = :builderId`);
    replacements.builderId = user.builder_id;
  }

  where.push(`${column} LIKE :base`);

  const query = `
    SELECT MAX(${column}) AS max_ref
    FROM ${tableName}
    WHERE ${where.join(" AND ")}
  `;

  const rows = await db.sequelize.query(query, {
    replacements,
    type: db.Sequelize.QueryTypes.SELECT,
    transaction,
  });

  const last = rows[0]?.max_ref;
  const next = last ? parseInt(last.replace(base, ""), 10) + 1 : 1;

  return `${base}${String(next).padStart(padding, "0")}`;
};

export default {
  generateRequestId,
  checkRequiredFields,
  checkValidEmail,
  generateOtp,
  generateAccessToken,
  generateRefreshToken,
  decrypt,
  encrypt,
  keysToSnakeCase,
  keysToCamelCase,
  allowedFileData,
  generateDynamicReferenceNumber,
};
