import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import db from "../../config/database/models/postgre-models/index.js";
import {
  createDocumentCommonFolderService,
  getAllDocumentCommonFoldersService,
  deleteDocumentCommonFolderService,
  updateDocumentCommonFolderService,
  seedDefaultDocumentFoldersService,
} from "./document-common-folder.service.js";

// 20 default document category folders for the customer drive
const DEFAULT_FOLDERS = [
  { name: "Contracts & Agreements",  sort_order: 1 },
  { name: "Quotations & Pricing",    sort_order: 2 },
  { name: "Engineering Reports",     sort_order: 3 },
  { name: "Floor Plans",             sort_order: 4 },
  { name: "Facade & Elevation",      sort_order: 5 },
  { name: "Site Photos",             sort_order: 6 },
  { name: "Permits & Approvals",     sort_order: 7 },
  { name: "Invoices & Payments",     sort_order: 8 },
  { name: "Inspection Reports",      sort_order: 9 },
  { name: "Soil & Survey Reports",   sort_order: 10 },
  { name: "Insurance Documents",     sort_order: 11 },
  { name: "Variation Orders",        sort_order: 12 },
  { name: "Correspondence",          sort_order: 13 },
  { name: "Customer Identity",       sort_order: 14 },
  { name: "Land & Title Documents",  sort_order: 15 },
  { name: "Colour Selections",       sort_order: 16 },
  { name: "Handover Documents",      sort_order: 17 },
  { name: "Warranty Documents",      sort_order: 18 },
  { name: "OHS & Safety",            sort_order: 19 },
  { name: "Miscellaneous",           sort_order: 20 },
];

// ─── SEED DEFAULTS ────────────────────────────────────────────────────────────

export async function seedDefaultFolders(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const createdBy = req.user?.users_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 400, "Invalid user context. Missing builder or company ID.");
    }

    const { DocumentCommonFolder } = db.sequelize.models;
    const where = builderId ? { builder_id: builderId } : { company_id: companyId };

    // Find which default folders already exist (case-insensitive)
    const existing = await DocumentCommonFolder.findAll({ where, attributes: ["name"] });
    const existingNames = new Set(existing.map(f => f.name.toLowerCase().trim()));

    const toCreate = DEFAULT_FOLDERS.filter(f => !existingNames.has(f.name.toLowerCase().trim()));

    if (toCreate.length > 0) {
      const rows = toCreate.map(f => ({
        ...(builderId ? { builder_id: builderId } : { company_id: companyId }),
        created_by: createdBy,
        updated_by: createdBy,
        name: f.name,
        sort_order: f.sort_order,
        notify: false,
        share_to_customer: false,
        is_locked: false,
      }));
      await DocumentCommonFolder.bulkCreate(rows);
    }

    // Return the full updated list
    const all = await DocumentCommonFolder.findAll({ where, order: [["sort_order", "ASC"], ["name", "ASC"]] });
    return successResponse(res, all, `${toCreate.length} default folder(s) created. ${existingNames.size} already existed.`);
  } catch (error) {
    console.error("Error seeding default folders:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

export async function createDocumentCommonFolder(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const createdBy = req.user?.users_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 400, "Invalid user context. Missing builder or company ID.");
    }

    const {
      name,
      sort_order,
      notify,
      share_to_customer,
      is_locked,
      role_ids,
      user_ids,
    } = req.body;

    const result = await createDocumentCommonFolderService({
      builderId,
      companyId,
      createdBy,
      name,
      sort_order,
      notify,
      share_to_customer,
      is_locked,
      role_ids,
      user_ids,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Document common folder created successfully.");
  } catch (error) {
    console.error("Error creating document common folder:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

// ─── SEED DEFAULTS ────────────────────────────────────────────────────────────

export async function seedDefaultDocumentFolders(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const createdBy = req.user?.users_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 400, "Invalid user context. Missing builder or company ID.");
    }

    const result = await seedDefaultDocumentFoldersService({ builderId, companyId, createdBy });
    return successResponse(res, result.message, result);
  } catch (error) {
    console.error("Error seeding default document folders:", error);
    return handleControllerError(res, error, error.message || "Failed to seed defaults");
  }
}

// ─── GET ALL ──────────────────────────────────────────────────────────────────

export async function getAllDocumentCommonFolders(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 400, "Invalid user context. Missing builder or company ID.");
    }

    const result = await getAllDocumentCommonFoldersService({ builderId, companyId });

    return successResponse(
      res,
      result.data,
      "Document common folders with subfolders fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching document common folders:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function deleteDocumentCommonFolder(req, res) {
  try {
    const { document_common_folder_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!document_common_folder_id) {
      return errorResponse(res, 400, "Document common folder ID is required.");
    }

    if (!builderId && !companyId) {
      return errorResponse(res, 400, "Invalid user context. Missing builder or company ID.");
    }

    const result = await deleteDocumentCommonFolderService({
      document_common_folder_id,
      builderId,
      companyId,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, null, "Document common folder deleted successfully.");
  } catch (error) {
    console.error("Error deleting document common folder:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function updateDocumentCommonFolder(req, res) {
  try {
    const { document_common_folder_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const updatedBy = req.user?.users_id;

    if (!document_common_folder_id) {
      return errorResponse(res, 400, "Document common folder ID is required.");
    }

    if (!builderId && !companyId) {
      return errorResponse(res, 400, "Invalid user context. Missing builder or company ID.");
    }

    const {
      name,
      sort_order,
      notify,
      share_to_customer,
      is_locked,
      role_ids,
      user_ids,
    } = req.body;

    const result = await updateDocumentCommonFolderService({
      document_common_folder_id,
      builderId,
      companyId,
      updatedBy,
      name,
      sort_order,
      notify,
      share_to_customer,
      is_locked,
      role_ids,
      user_ids,
    });

    if (result.error) {
      return errorResponse(res, result.error.status, result.error.message);
    }

    return successResponse(res, result.data, "Document common folder updated successfully.");
  } catch (error) {
    console.error("Error updating document common folder:", error);
    return errorResponse(res, 500, "Internal server error.", error.message);
  }
}
