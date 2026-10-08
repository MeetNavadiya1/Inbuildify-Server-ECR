import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const SECRET = process.env.QUOTATION_HASH_SECRET || "inbuildify-quotation-hash-key-2024";

function getKey() {
  return crypto.scryptSync(SECRET, "qhash-salt", 32);
}

export function encodeQuotationHash(quotationId, leadId) {
  const payload = JSON.stringify({ quotationId, leadId });
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const combined = Buffer.concat([iv, encrypted]);
  // base64url encoding for URL safety
  return combined.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function decodeQuotationHash(hash) {
  const normalized = hash.replace(/-/g, "+").replace(/_/g, "/");
  const combined = Buffer.from(normalized, "base64");
  const iv = combined.subarray(0, 16);
  const encrypted = combined.subarray(16);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

export function encodeSignToken(envelopeId, signerEmail, signerName) {
  const payload = JSON.stringify({ envelopeId, signerEmail, signerName });
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const combined = Buffer.concat([iv, encrypted]);
  return combined.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function decodeSignToken(token) {
  const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
  const combined = Buffer.from(normalized, "base64");
  const iv = combined.subarray(0, 16);
  const encrypted = combined.subarray(16);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}
