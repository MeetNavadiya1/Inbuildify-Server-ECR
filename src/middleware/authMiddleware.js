import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.config.js";
import authService from "../modules/auth/auth.service.js";
import { errorResponse } from "../helper/response.js"; // Added here
import {
  runAsSampleDataViewer,
  runWithoutSampleData,
} from "../config/database/models/postgre-models/sampleDataFlag.js";
import { canViewSampleData } from "../constants/rbac.js";
import { getRoleNameById } from "../helper/rbac.helper.js";
import logger from "../utils/logger.js";

const JWT_SECRET = env.JWT.JWT_SECRET;

const handleTokenAuthorization = async (requestId, token, req, res, next) => {
  try {
    logger.info("🔄 Validating JWT token", { requestId });

    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.userId) {
      logger.warn("❌ Unauthorized: Invalid token", { requestId });
      return errorResponse(
        res,
        401,
        "Unauthorized: Invalid token or token not found",
      );
    }

    const userRecord = await authService.validateTokenAndUser(token, payload?.userId);

    if (!userRecord) {
      logger.warn("❌ Unauthorized: Invalid token", { requestId });
      return errorResponse(
        res,
        401,
        "Unauthorized: Invalid token or token not found",
      );
    }

    req.user = userRecord;
    // Add aliases for consistency across controllers
    req.user.user_id = userRecord.users_id;
    req.user.id = userRecord.users_id;
    req.user.access_token = token;

    // The user must belong to either a Builder (regular tenant user) or a
    // Company directly (Company Administrator created via /company-signup).
    if (!req.user || (!req.user.builder_id && !req.user.company_id)) {
      return errorResponse(
        res,
        401,
        "Unauthorized: User is not linked to a company or builder.",
      );
    }

    // Resolve company_id — prefer the direct link on the user, fall back to
    // looking it up from the builder.
    let resolvedCompanyId = req.user.company_id || null;
    if (!resolvedCompanyId && req.user.builder_id) {
      const company = await authService.getCompanyByBuilderId(req.user.builder_id);
      if (company) resolvedCompanyId = company.company_id;
    }

    // ✅ Detect create-company API
    // adjust path/method if needed
    const isCreateCompanyRequest =
      (req.method === "GET" && req.originalUrl.includes("/company")) ||
      (req.method === "POST" && req.originalUrl.includes("/company")) ||
      // Phase 3 onboarding endpoints — must remain reachable while the
      // company is still being set up (no company row yet, or flag false).
      req.originalUrl.includes("/company-onboarding") ||
      (req.method === "GET" && req.originalUrl.includes("/timezone")) ||
      (req.method === "POST" && req.originalUrl.includes("/address")) ||
      (req.method === "GET" && req.originalUrl.includes("/state")) ||
      (req.method === "GET" && req.originalUrl.includes("/country")) ||
      (req.method === "GET" && req.originalUrl.includes("/user/profile")) ||
      (req.method === "POST" && req.originalUrl.includes("/auth/logout"));

    // Everything downstream runs as this user for sample-data purposes: the demo
    // dataset is cloned per person, so a seeded row belongs to whoever imported
    // it and only they should see it. Without this the whole company got every
    // colleague's copy of the same demo leads and jobs listed side by side.
    // Wrapping `next()` is what carries the context through the rest of the
    // chain — the model hook it feeds is dozens of calls deep in the services.
    //
    // On top of that: the demo dataset is only shown to the people who
    // administer the account (see `canViewSampleData`). For everybody else it is
    // filtered out of every query rather than badged, which is the only thing
    // that reaches the places a badge never did — the job colour catalogue is
    // COPIED into each job, so a demo colour there is an ordinary row of that
    // job's own tree and no per-record marking kept it out of a consultant's
    // list. Resolved here rather than in `scopeBuilder` because the context has
    // to wrap `next()`, and scopeBuilder runs per-router, well after this.
    const roleName = await getRoleNameById(req.user.role_id);
    // scopeBuilder sets this again from the same cached lookup; having it early
    // means anything between here and there reads the same answer.
    req.user.role_name = roleName;

    // The viewer stays set underneath the exclusion rather than being replaced
    // by it. They are different questions — "which seeded rows are mine" and
    // "may I see seeded rows at all" — and the ownership one still has to be
    // answerable for anything that lifts the exclusion for its own bookkeeping.
    const seesSampleData = canViewSampleData(req.user, roleName);
    const asViewer = (fn) =>
      runAsSampleDataViewer(req.user.users_id, () =>
        seesSampleData ? fn() : runWithoutSampleData(fn),
      );

    if (!resolvedCompanyId) {
      if (isCreateCompanyRequest) {
        return asViewer(next);
      }
      return errorResponse(res, 404, "Company not found for this user.");
    }

    req.user.company_id = resolvedCompanyId;
    return asViewer(next);
  } catch (error) {
    logger.error(`⚠️ Authentication error: ${error.message || error}`, { requestId });

    if (error.custom) {
      return errorResponse(res, error.statusCode, error.message);
    }

    if (error.name === "TokenExpiredError") {
      return errorResponse(res, 401, "Unauthorized: Your token has expired");
    }
    return errorResponse(res, 401, `Unauthorized: ${error.message}`);
  }
};

const authMiddleware = (req, res, next) => {
  const requestId = uuidv4();
  
  const whitelist = ["host", "origin", "content-type", "x-real-ip", "x-forwarded-for"];
  const headers = {};
  for (const key of whitelist) {
    if (req.headers[key]) {
      headers[key] = req.headers[key];
    }
  }

  logger.info("Incoming Request", {
    requestId,
    Endpoint: req.path,
    Headers: headers,
  });

  try {
    const authorizationHeader = req.headers.authorization || "";

    if (!authorizationHeader) {
      logger.warn("❌ Unauthorized: No Authorization header or API Key provided", { requestId });
      return errorResponse(
        res,
        401,
        "Unauthorized: No Authorization header or API Key provided",
      );
    }

    const [scheme, token] = authorizationHeader.split(" ");
    if (scheme !== "Bearer" || !token || token === "undefined" || token === "null") {
      logger.warn("⚠️ Invalid authorization scheme or missing token", { requestId });
      return errorResponse(
        res,
        401,
        "Unauthorized: Invalid authorization scheme or no token provided.",
      );
    }
    return handleTokenAuthorization(requestId, token, req, res, next);
  } catch (error) {
    logger.error(`💥 Middleware error: ${error.message}`, { requestId });
    const message =
      error.name === "TokenExpiredError"
        ? "Unauthorized: Your token has expired"
        : `Unauthorized: ${error.message}`;
    return errorResponse(res, 401, message);
  }
};

export default authMiddleware;
