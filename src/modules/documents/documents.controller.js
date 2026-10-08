import * as documentsService from "./documents.service.js";
import * as userDocumentsService from "./documents.user.service.js";
import * as clientDocumentsService from "./documents.client.service.js";
import { getEntityAdapter } from "./documents.entities.js";
import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import jobService from "../job/job.service.js";
import leadsService from "../lead/leads.service.js";
import { getFolderContentsService } from "../drive/drive.service.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// entityType/entityId reach us either snake_cased on the body (POST, after
// camelToSnakeMiddleware) or camelCased on the query (GET). Read both defensively.
function readEntityInput(req) {
  const entityType = (
    req.body?.entity_type ??
    req.body?.entityType ??
    req.query?.entityType ??
    req.query?.entity_type ??
    ""
  )
    .toString()
    .toLowerCase();
  const entityId =
    req.body?.entity_id ??
    req.body?.entityId ??
    req.query?.entityId ??
    req.query?.entity_id ??
    null;
  return { entityType, entityId };
}

// ──────────────────────────────────────────────────────────────────────────────
//  POST /documents/folders — create a folder in an entity's document tree
// ──────────────────────────────────────────────────────────────────────────────
export async function createDocumentFolder(req, res) {
  try {
    const { entityType, entityId } = readEntityInput(req);
    const name = req.body.name ?? req.body.folder_name ?? req.body.folderName;
    const parentId = req.body.parent_id ?? req.body.parentId ?? null;

    const result = await documentsService.createFolder(
      { entityType, entityId, name, parentId },
      req.user,
    );

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("createDocumentFolder error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  POST /documents/files — upload a file into an entity's document tree
// ──────────────────────────────────────────────────────────────────────────────
export async function uploadDocument(req, res) {
  try {
    const { entityType, entityId } = readEntityInput(req);
    if (!req.file) return errorResponse(res, 400, "No file provided");

    const folderId = req.body.folder_id ?? req.body.folderId ?? null;

    const result = await documentsService.uploadFile(
      { entityType, entityId, folderId },
      req.file,
      req.user,
    );

    if (!result.success) {
      return errorResponse(res, result.statusCode || 400, result.message);
    }
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("uploadDocument error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /documents/my — the Contact's own documents (client dashboard). The
//  caller is always the subject; there is no user id to tamper with.
// ──────────────────────────────────────────────────────────────────────────────
export async function getMyDocuments(req, res) {
  try {
    const result = await clientDocumentsService.getMyDocuments(req.user, req.query);
    if (!result.success) {
      return handleControllerError(res, result, result.message);
    }
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getMyDocuments error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /documents/my/:fileId/view — short-lived link to open one of the
//  Contact's own documents (?download=true forces a save-to-disk).
// ──────────────────────────────────────────────────────────────────────────────
export async function getMyDocumentViewUrl(req, res) {
  try {
    const result = await clientDocumentsService.getMyDocumentViewUrl(req.user, req.params.fileId, {
      download: req.query.download === true,
    });
    if (!result.success) {
      return errorResponse(res, result.statusCode || 500, result.message);
    }
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getMyDocumentViewUrl error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /documents/all — one consolidated, flat list of every document the caller
//  can access, across all jobs / leads / the drive (ignores folder structure).
// ──────────────────────────────────────────────────────────────────────────────
export async function getAllDocuments(req, res) {
  try {
    const result = await documentsService.getAllDocuments(req.user, req.query);
    if (!result.success) {
      return handleControllerError(res, result, result.message);
    }
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getAllDocuments error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /documents/filter-options — dropdown data (builders, customers, projects,
//  document types) for the Documents filter bar, in one tenant-scoped call.
// ──────────────────────────────────────────────────────────────────────────────
export async function getFilterOptions(req, res) {
  try {
    const result = await documentsService.getFilterOptions(req.user);
    if (!result.success) {
      return handleControllerError(res, result, result.message);
    }
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getFilterOptions error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /documents/users — the users a documents browser can be pointed at, each
//  with how much work is attached to them.
// ──────────────────────────────────────────────────────────────────────────────
export async function getDocumentUsers(req, res) {
  try {
    const result = await userDocumentsService.listDocumentUsers(req.user, req.query);
    if (!result.success) {
      return handleControllerError(res, result, result.message);
    }
    return successResponse(res, result.data, result.message);
  } catch (error) {
    console.error("getDocumentUsers error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  GET /documents?entityType=&entityId= — read the document tree for an entity.
//  Delegates to the entity's existing aggregator so the read model stays the
//  single source of truth per entity.
// ──────────────────────────────────────────────────────────────────────────────
export async function getDocuments(req, res) {
  try {
    const { entityType, entityId } = readEntityInput(req);
    const adapter = getEntityAdapter(entityType);
    if (!adapter) return errorResponse(res, 400, "Unsupported or missing entity type");

    if (adapter.requiresEntityId && (!entityId || !UUID_RE.test(entityId))) {
      return errorResponse(res, 400, `Invalid ${adapter.label} ID format`);
    }

    // Every document belonging to a user, across all their leads and jobs.
    if (entityType === "user") {
      const result = await userDocumentsService.getUserDocuments(entityId, req.user);
      if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
      return successResponse(res, result.data, result.message);
    }

    // `view=user` re-points a job/lead request at the user those documents
    // belong to, so the per-entity Documents tabs can show the user's full set
    // without the client having to know who owns the job or lead.
    const view = (req.query.view ?? req.query.groupBy ?? "").toString().toLowerCase();
    // A job/lead with nobody attached yet falls through to its own tree
    // (result.noUser) instead of failing the tab.
    if (view === "user" && (entityType === "job" || entityType === "lead")) {
      const result = await userDocumentsService.getUserDocumentsForEntity(
        entityType,
        entityId,
        req.user,
      );
      if (result.success) return successResponse(res, result.data, result.message);
      if (!result.noUser) return errorResponse(res, result.statusCode || 404, result.message);
    }

    if (entityType === "job") {
      const result = await jobService.getJobDocuments(entityId, req.user);
      if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
      return successResponse(res, result.data, result.message);
    }

    if (entityType === "lead") {
      const result = await leadsService.getLeadDocuments(
        entityId,
        req.user?.builder_id,
        req.user?.company_id,
      );
      if (!result.success) return errorResponse(res, result.statusCode || 404, result.message);
      return successResponse(res, result.data, result.message);
    }

    // sdrive — return the root (or a specific folder's) contents.
    const rawFolderId = req.query.folderId ?? req.query.folder_id ?? null;
    const contents = await getFolderContentsService(
      rawFolderId && rawFolderId !== "root" ? rawFolderId : null,
      req.user?.company_id,
      req.user?.builder_id,
    );
    return successResponse(res, keysToCamelCase(contents), "Drive contents fetched successfully");
  } catch (error) {
    console.error("getDocuments error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}
