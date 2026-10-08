import CryptoJS from "crypto-js";
import { env } from "../config/env.config.js";

const FIVE_MINUTES = 5 * 60 * 1000;

export function validateExternalToken(...args) {
  // If first argument is a string (e.g. "landing" or "external"), we return a middleware factory
  if (typeof args[0] === "string") {
    const actualType = args[0];
    return (req, res, next) => verifyTokenLogic(req, res, next, actualType);
  }
  
  // Otherwise, it was called directly as a middleware: (req, res, next)
  const [req, res, next] = args;
  return verifyTokenLogic(req, res, next, "external");
}

const verifyTokenLogic = (req, res, next, type) => {
  const token = req.headers["x-secure-access"] || req.headers["x-external-token"];

  if (!token) {
    return res.status(403).send("Invalid Token");
  }

  // Determine credentials based on type
  const secret = type === "landing" 
    ? env.LANDING_PAGE_SECRET 
    : env.EXTERNAL_API.SECRET;
    
  const secretText = type === "landing"
    ? env.LANDING_PAGE_SECRET_TEXT
    : env.EXTERNAL_API.SECRET_TEXT;

  try {
    const decryptedText = CryptoJS.AES
      .decrypt(token, secret)
      .toString(CryptoJS.enc.Utf8);

    if (!decryptedText) {
      return res.status(403).send("Invalid Token");
    }

    const [message, timestampStr] = decryptedText.split("|");

    const allowedMessages = [secretText, "ALLOW_ACCESS", "ALLOW_REPORT"];
    if (!allowedMessages.includes(message)) {
      return res.status(403).send("Invalid Token");
    }

    const tokenTimestamp = parseInt(timestampStr, 10);

    if (isNaN(tokenTimestamp) || Date.now() - tokenTimestamp > FIVE_MINUTES) {
      return res.status(403).send("Token has expired");
    }

    // Flag the request so downstream controllers can skip user-context checks
    // (external requests have no JWT, so req.user is undefined).
    req.isExternalRequest = true;
    return next();
  } catch {
    return res.status(403).send("Invalid Token");
  }
};

export default validateExternalToken;
