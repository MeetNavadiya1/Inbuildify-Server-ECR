import crypto from "crypto";
import { env } from "../config/env.config.js";

const ALGORITHM = "aes-256-cbc";
const KEY = crypto.createHash("sha256").update(env.EMAIL.PASSWORD_SECRET).digest();
const IV_LENGTH = 16;

export function encrypt(plainText) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  return `${iv.toString("hex") }:${ encrypted}`;
}

export function decrypt(encryptedText) {
  const [ivHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
