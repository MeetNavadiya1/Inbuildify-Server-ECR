import jwt from "jsonwebtoken";
import { env } from "../config/env.config.js";

export function generateAccessToken(userId) {
  return jwt.sign({ userId }, env.JWT.JWT_SECRET, { expiresIn: "15m" });
}

export function generateRefreshToken(userId) {
  return jwt.sign({ userId }, env.JWT.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT.JWT_SECRET);
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, env.JWT.JWT_REFRESH_SECRET);
  } catch {
    return null;
  }
}
