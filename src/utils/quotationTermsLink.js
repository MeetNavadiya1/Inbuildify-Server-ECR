import crypto from "crypto";

import { env } from "../config/env.config.js";

/**
 * A new opaque public id for a terms document or a per-quotation snapshot.
 *
 * 32 hex chars from the CSPRNG. The token is the only thing guarding a terms
 * page, so it must not be guessable or derived from an id — 128 bits is well
 * past brute-forcing, and hex keeps it URL-safe with no escaping.
 *
 * It lives HERE, next to the link it goes into, because the format is not a
 * private detail of whoever mints one: `publicTokenParamsSchema` rejects
 * anything that is not exactly 32 hex characters before it reaches the database.
 * The sample-data importer minted `randomUUID()` instead — 36 characters with
 * dashes — so every link it wrote was refused by that check as an invalid terms
 * link, without ever being looked up. One generator, one format, one place to
 * change it.
 */
export const newPublicToken = () => crypto.randomBytes(16).toString("hex");

/**
 * Customer-facing Terms & Conditions link.
 *
 * Lives in its own util rather than in quotation-terms.service.js so the PDF
 * template (utils/template.js) can build the link without importing a service
 * that pulls in the whole Sequelize model index — the template is also loaded
 * by the queue workers, where that import chain is pure weight.
 *
 * FRONTEND_BASE_URL is the same base the quotation email links use, so the
 * terms page and the quotation view page always resolve to the same host.
 */
export const buildTermsUrl = (token) => {
  if (!token) return null;
  const base = (env.EMAIL?.FRONTEND_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/terms/${token}`;
};

export default { buildTermsUrl, newPublicToken };
