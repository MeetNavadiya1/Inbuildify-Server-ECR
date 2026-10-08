import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import { getCache, setCache, deleteCacheByPrefix } from "../../service/redisCache.service.js";
import {
    FEATUR_FACADE_CACHE_PREFIX,
    getFeatureFacadeService,
    getManagedFeatureFacadeService,
    createFeatureFacadeService,
    getFeatureFacadeByIdService,
    updateFeatureFacadeService,
    deleteFeatureFacadeService,
} from "./featur-facade.service.js";

const CACHE_PREFIX = FEATUR_FACADE_CACHE_PREFIX;
const CACHE_TTL = 3600; // 1 hour
// The list is filtered by start_date/end_date against "now", so its cache key is
// bucketed by time — otherwise a facade whose window opens mid-TTL stays hidden
// (and one whose window closes keeps being served) until the entry expires.
//
// The same bucket is what paces the carousel's rotation between facades sharing
// a position (see `landing-rotation.js`). Those turns are 24/N hours long, so a
// bucket boundary is never more than five minutes late to one — the order turns
// a few minutes after the hour rather than on it, which nobody is watching for.
const LIST_CACHE_TTL = 300; // 5 minutes
const listCacheBucket = () => Math.floor(Date.now() / (LIST_CACHE_TTL * 1000));

/**
 * FETCH FEATURE FACADES
 */
export async function getFeatureFacade(req, res) {
    try {
        const { page = 1, limit = 25 } = req.query;
        const cacheKey = `${CACHE_PREFIX}list:page:${page}:limit:${limit}:t:${listCacheBucket()}`;

        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return successResponse(res, cachedData, "Feature Facade fetched successfully (cached).");
        }

        const result = await getFeatureFacadeService({
            page: parseInt(page),
            limit: parseInt(limit),
        });

        if (result instanceof Error) {
            return errorResponse(res, 500, result.message || "Internal Server Error");
        }

        const payload = keysToCamelCase(result);
        await setCache(cacheKey, payload, LIST_CACHE_TTL);

        return successResponse(
            res,
            payload,
            "Feature Facade fetched successfully."
        );
    } catch (error) {
        return handleControllerError(res, error, error.message || "Internal Server Error");
    }
}

/**
 * FETCH THE CALLER'S OWN FEATURE FACADES (admin)
 *
 * Unlike the public list this returns promotions outside their window too —
 * scheduled and expired — because the admin screen has to show a facade as
 * featured the moment it is scheduled, not once it goes live. Uncached on
 * purpose: it is read straight after every write.
 */
export async function getManagedFeatureFacade(req, res) {
    try {
        const { page = 1, limit = 25 } = req.query;

        const result = await getManagedFeatureFacadeService({
            builderId: req.user.builder_id,
            companyId: req.user.company_id,
            page: parseInt(page),
            limit: parseInt(limit),
        });

        return successResponse(
            res,
            keysToCamelCase(result),
            "Feature Facade fetched successfully."
        );
    } catch (error) {
        return handleControllerError(res, error, error.message || "Internal Server Error");
    }
}

/**
 * CREATE FEATURE FACADE
 */
export async function createFeatureFacade(req, res) {
    try {
        const {
            start_date,
            end_date,
            is_active,
            facade_id
        } = req.body;
        const builder_id = req.user.builder_id;
        const company_id = req.user.company_id;

        if (!builder_id) {
            return errorResponse(res, 400, "builder_id is required");
        }

        if (!company_id) {
            return errorResponse(res, 400, "company_id is required");
        }

        const result = await createFeatureFacadeService({
            builder_id,
            company_id,
            start_date,
            end_date,
            is_active,
            facade_id,
        });

        if (result instanceof Error) {
            return errorResponse(res, 400, result.message);
        }

        // Clear cache
        await deleteCacheByPrefix(CACHE_PREFIX);

        return successResponse(
            res,
            keysToCamelCase(result),
            "Feature Facade created successfully."
        );
    } catch (error) {
        return handleControllerError(res, error, error.message || "Internal Server Error");
    }
}

/**
 * GET FEATURE FACADE BY ID
 */
export async function getFeatureFacadeById(req, res) {
    try {
        const { id } = req.params;
        const builderId = req.user.builder_id;
        const companyId = req.user.company_id;

        if (!id) {
            return errorResponse(res, 400, "ID is required");
        }

        const cacheKey = `${CACHE_PREFIX}detail:id:${id}:builder:${builderId || "public"}:company:${companyId || "public"}`;
        const cachedData = await getCache(cacheKey);
        if (cachedData) {
            return successResponse(res, cachedData, "Feature Facade fetched successfully (cached).");
        }

        const result = await getFeatureFacadeByIdService({
            id,
            builderId,
            companyId,
        });

        const payload = keysToCamelCase(result);
        await setCache(cacheKey, payload, CACHE_TTL);

        return successResponse(
            res,
            payload,
            "Feature Facade fetched successfully."
        );
    } catch (error) {
        const statusCode = error.message === "Feature Facade not found" ? 404 : 500;
        return errorResponse(res, statusCode, error.message || "Internal Server Error");
    }
}

/**
 * UPDATE FEATURE FACADE
 */
export async function updateFeatureFacade(req, res) {
    try {
        const { id } = req.params;
        const builderId = req.user.builder_id;
        const companyId = req.user.company_id;
        const payload = req.body;

        if (!id) {
            return errorResponse(res, 400, "ID is required");
        }

        const result = await updateFeatureFacadeService({
            id,
            builderId,
            companyId,
            payload,
        });

        if (result instanceof Error) {
            const statusCode = result.message === "Feature Facade not found" ? 404 : 400;
            return errorResponse(res, statusCode, result.message);
        }

        // Clear cache
        await deleteCacheByPrefix(CACHE_PREFIX);

        return successResponse(
            res,
            keysToCamelCase(result),
            "Feature Facade updated successfully."
        );
    } catch (error) {
        return handleControllerError(res, error, error.message || "Internal Server Error");
    }
}

/**
 * DELETE FEATURE FACADE
 */
export async function deleteFeatureFacade(req, res) {
    try {
        const { id } = req.params;
        const builderId = req.user.builder_id;
        const companyId = req.user.company_id;

        if (!id) {
            return errorResponse(res, 400, "ID is required");
        }

        await deleteFeatureFacadeService({ id, builderId, companyId });

        // Clear cache
        await deleteCacheByPrefix(CACHE_PREFIX);

        return successResponse(res, null, "Feature Facade deleted successfully.");
    } catch (error) {
        const statusCode = error.message === "Feature Facade not found" ? 404 : 500;
        return errorResponse(res, statusCode, error.message || "Internal Server Error");
    }
}