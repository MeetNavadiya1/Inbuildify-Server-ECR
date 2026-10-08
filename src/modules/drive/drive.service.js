import db from "../../config/database/models/postgre-models/index.js";
import { uploadFile, deleteObject, deleteObjects, generatePresignedDownloadUrl } from "../../service/s3.service.js";
import { Op } from "sequelize";
import { v4 as uuidv4 } from "uuid";
import { scheduleThumbnailGeneration } from "./drive-thumbnail.service.js";
import { buildFileName, ensureUniqueDriveFileName } from "../../service/fileNaming.service.js";
import { documentTypeLabelOf, documentTypeOf } from "../../constants/driveFile.js";
import { buildFileScopeWhere, buildFolderScopeWhere, hasFullDriveAccess, canAccessFolder } from "./drive.scope.js";
// drive.permissions.js reads drive.scope.js and the models only — no cycle back
// into this file.
import { hasAtLeast, resolvePermission } from "./drive.permissions.js";
import {
  findOrCreateDriveFolder,
  findSystemFolderAncestor,
  isSystemFolderRow,
} from "../../helper/driveFolder.helper.js";
import { isPdfEditable, getPdfTypeTag } from "../../utils/pdfEdit.js";
import { isDocumentEditingAllowed } from "../../utils/documentEdit.js";
import { DRIVE_ACTIONS, recordDriveActivity } from "../../helper/driveActivity.helper.js";

/**
 * AND the caller's drive access scope into a base `where`.
 *
 * buildFileScopeWhere / buildFolderScopeWhere return null for full-access roles
 * (Super Admin, Company Admin variants), meaning "no extra restriction" — so
 * passing null here is a no-op and those roles keep the whole company drive.
 * For every other role the returned fragment narrows the query to their own
 * leads/jobs, uploads and shares, applied by the database on the same query.
 */
const withScope = (base, scope) => (scope ? { [Op.and]: [base, scope] } : base);

/**
 * The tenant predicate for a drive listing.
 *
 * A builder sees their own rows *and* the ones stamped to no builder at all: the
 * generated report buckets belong to the company, not to whichever lead
 * triggered the first PDF (see driveFolder.helper). Matching the builder
 * strictly hid those buckets from every builder — which is how the company ended
 * up with one copy of "Compaction Reports" per builder, all of them visible at
 * once to a Company Administrator, who has no builder_id and so no filter.
 *
 * This is the same rule `buildFileScopeWhere` already applies to files.
 */
const tenantWhere = (companyId, builderId) => ({
  company_id: companyId,
  ...(builderId ? { [Op.or]: [{ builder_id: builderId }, { builder_id: null }] } : {}),
});

/**
 * Re-throw a folder write as a duplicate-name error the caller can show.
 *
 * The "does this name already exist" checks below all read before they write,
 * so two requests can pass the same check at once. `drive_folder_active_unique`
 * is what actually stops the pair — this turns its violation into the same
 * message the read-check produces, instead of a raw Postgres error.
 */
const rethrowDuplicateFolder = (error, message) => {
  if (error?.name !== "SequelizeUniqueConstraintError") throw error;
  throw new Error(message);
};

/**
 * Whether a person put this document here, as opposed to the app writing it.
 *
 * `documentTypeOf` answers "upload" for exactly that: the reference-less files
 * of the global drive, and the Job/Lead Documents uploads. Everything else it
 * classifies is a rendering of a record — a quotation report, a compaction PDF,
 * a colour schedule, a variation invoice — which its generator files by type and
 * re-writes whenever the record changes. Reusing that taxonomy keeps the answer
 * in one place: a new generated document type is classified there and is
 * un-movable here without a second list to remember.
 */
const isHandUploadedDocument = (file) =>
  documentTypeOf(file?.reference_type, file?.sub_reference_type) === "upload";

/** file reference_type → the reference_type its tree's folders carry. */
const FOLDER_REFERENCE_TYPES = { LeadDocument: "Lead", JobDocument: "Job" };

/**
 * The folder identity a document's destination has to share: its own entity's
 * Documents tree, or the global drive for a document that belongs to no entity.
 */
const documentTreeOf = (file) => {
  const referenceType = FOLDER_REFERENCE_TYPES[file?.reference_type] || null;
  return {
    referenceType,
    referenceId: referenceType ? file.reference_id : null,
  };
};

/**
 * Total bytes held by every folder in the company, including its whole subtree.
 *
 * Two queries for the entire tree followed by a bottom-up roll-up in memory —
 * asking the database per folder would mean one round-trip per row in the
 * listing. Trashed files are excluded (default paranoid scope), so emptying
 * Trash does not change the number a folder reports.
 */
export const getFolderSizeMap = async (companyId, builderId) => {
  const { Drive, DriveFile } = db.sequelize.models;
  const scope = tenantWhere(companyId, builderId);

  const [folders, fileTotals] = await Promise.all([
    Drive.findAll({ where: scope, attributes: ["drive_id", "parent_id"], raw: true }),
    DriveFile.findAll({
      where: scope,
      attributes: ["folder_id", [db.sequelize.fn("SUM", db.sequelize.col("size")), "total"]],
      group: ["folder_id"],
      raw: true
    })
  ]);

  // Bytes sitting directly in each folder
  const ownBytes = new Map();
  fileTotals.forEach(row => {
    if (row.folder_id) ownBytes.set(row.folder_id, Number(row.total) || 0);
  });

  const childIds = new Map();
  folders.forEach(f => {
    const siblings = childIds.get(f.parent_id) || [];
    siblings.push(f.drive_id);
    childIds.set(f.parent_id, siblings);
  });

  const totals = new Map();
  const inProgress = new Set();
  const resolve = (driveId) => {
    if (totals.has(driveId)) return totals.get(driveId);
    // A parent cycle would otherwise recurse forever
    if (inProgress.has(driveId)) return 0;
    inProgress.add(driveId);
    let sum = ownBytes.get(driveId) || 0;
    for (const child of childIds.get(driveId) || []) sum += resolve(child);
    inProgress.delete(driveId);
    totals.set(driveId, sum);
    return sum;
  };
  folders.forEach(f => resolve(f.drive_id));

  return totals;
};

// --- Folder Services ---

export const createFolderService = async (folderData) => {
  const { Drive } = db.sequelize.models;
  
  const whereClause = {
    name: folderData.name,
    parent_id: folderData.parent_id || null,
    company_id: folderData.company_id
  };
  
  if (folderData.reference_id) {
    whereClause.reference_id = folderData.reference_id;
  } else {
    whereClause.reference_id = null;
  }

  // Check for duplicate name in the same parent folder
  const existingFolder = await Drive.findOne({
    where: whereClause
  });

  if (existingFolder) {
    throw new Error("A folder with this name already exists in this location.");
  }

  // Create folder
  let folder;
  try {
    folder = await Drive.create(folderData);
  } catch (error) {
    rethrowDuplicateFolder(error, "A folder with this name already exists in this location.");
  }

  const { DriveActivityLog } = db.sequelize.models;
  if (DriveActivityLog) {
    await DriveActivityLog.create({
      company_id: folderData.company_id, user_id: folderData.created_by,
      action: "CREATE", entity_type: "FOLDER", entity_id: folder.drive_id, entity_name: folder.name
    }).catch(e => console.error("Error logging activity", e));
  }

  return folder;
};

export const getFolderContentsService = async (folderId, companyId, builderId, user = null) => {
  const { Drive, DriveFile } = db.sequelize.models;
  const [folderScope, fileScope] = await Promise.all([
    buildFolderScopeWhere(user),
    buildFileScopeWhere(user),
  ]);

  // Retrieve child folders
  const folders = await Drive.findAll({
    where: withScope({
      parent_id: folderId || null,
      ...tenantWhere(companyId, builderId)
    }, folderScope),
    order: [["name", "ASC"]]
  });

  // Retrieve files within the folder
  const files = await DriveFile.findAll({
    where: withScope({
      folder_id: folderId || null,
      ...tenantWhere(companyId, builderId)
    }, fileScope),
    include: [{ model: db.sequelize.models.Users, as: "uploadedByUser", attributes: ["name"] }],
    order: [["original_name", "ASC"]]
  });

  // One check for the whole listing: every file below shares this folder, so
  // whether they can be moved out of it is one question, not one per row. The
  // root (no folderId) is never system-owned.
  const inSystemFolder = Boolean(await findSystemFolderAncestor(folderId, companyId));

  const sizeMap = await getFolderSizeMap(companyId, builderId);
  const settings = await db.sequelize.models.GeneralSettings.findOne({
    where: { company_id: companyId }
  });
  const editablePdfTypes = settings?.editable_pdf_types || [];
  // The types an administrator has turned editing off for. A blocklist, so an
  // empty one means nothing is restricted — see documentEditPermission.helper.js.
  const blockedTypes = settings?.non_editable_document_types || [];

  const formattedFolders = folders.map(f => ({
    id: f.drive_id,
    type: 'folder',
    name: f.name,
    parent_id: f.parent_id,
    is_starred: f.is_starred,
    // Lets the UI badge rows the sample-data seeder created
    is_sample_data: Boolean(f.is_sample_data),
    // Everything inside the folder, however deep
    size: sizeMap.get(f.drive_id) || 0,
    // Whether Move applies to this row. A subfolder is never a system bucket
    // itself — those sit at a tree's root — so the only question left is whether
    // an app-owned folder is above it, which is what moveFolderService checks.
    // A folder in a lead's or job's tree moves within that tree, so it qualifies.
    can_move: !inSystemFolder,
    created_at: f.created_at,
    updated_at: f.updated_at
  }));

  const formattedFiles = files.map(f => ({
    id: f.file_id,
    type: 'file',
    name: f.original_name,
    file_extension: f.file_extension,
    size: f.size,
    mime_type: f.mime_type,
    url: f.s3_key, // The frontend usually resolves s3_key to a real URL or we can provide it
    parent_id: f.folder_id,
    is_starred: f.is_starred,
    // Lets the UI badge rows the sample-data seeder created
    is_sample_data: Boolean(f.is_sample_data),
    is_editable: isPdfEditable(f, editablePdfTypes, blockedTypes),
    // Whether this document may be edited at all — the Admin → Document
    // Management switch. Distinct from `is_editable` above, which only says whether a
    // generated PDF offers the edit-the-record form.
    editing_allowed: isDocumentEditingAllowed(f, blockedTypes),
    pdf_type: getPdfTypeTag(f),
    // Whether Move applies to this row at all: a document a person uploaded,
    // sitting somewhere a person may take it from. Both halves are what
    // moveFileService checks, so the row menu never offers an action that would
    // only be refused.
    can_move: !inSystemFolder && isHandUploadedDocument(f),
    created_at: f.created_at,
    updated_at: f.updated_at,
    uploaded_by_name: f.uploadedByUser?.name || null,
  }));

  return {
    folders: formattedFolders,
    files: formattedFiles,
    items: [...formattedFolders, ...formattedFiles] // Combined for easy tree UI rendering
  };
};

/**
 * The folders a document may be moved into: every folder in the caller's drive
 * that a user created, flattened and labelled with its path.
 *
 * The generated report buckets and the entity Documents trees are left out, and
 * so is anything nested inside one — the same rule moveFileService enforces, so
 * the picker cannot offer a destination the move would then refuse. "My Drive"
 * (the root) is not in this list: it is not a folder row, and the client offers
 * it separately.
 *
 * Ancestry is judged against every folder in the tenant, not only the ones the
 * caller can see. A restricted user reaches their own folders and nothing else,
 * so the bucket above one of them would be invisible here — and a subfolder of
 * "Compaction Reports" would look like a plain folder of their own.
 */
export const getMoveTargetFoldersService = async (companyId, builderId, user = null) => {
  const { Drive } = db.sequelize.models;
  // The global drive only. A job's or lead's folders live in that entity's tree,
  // which its Documents tab already holds in full and offers from there — and a
  // document cannot cross from one tree to the other anyway.
  const scope = { ...tenantWhere(companyId, builderId), reference_id: null };

  const all = await Drive.findAll({
    where: scope,
    attributes: ["drive_id", "name", "parent_id", "reference_id"],
    order: [["name", "ASC"]],
    raw: true,
  });

  // null from buildFolderScopeWhere means "no extra restriction" — a full-access
  // role keeps every folder in the tenant.
  const folderScope = await buildFolderScopeWhere(user);
  const reachable = folderScope
    ? new Set(
      (
        await Drive.findAll({
          where: withScope(scope, folderScope),
          attributes: ["drive_id"],
          raw: true,
        })
      ).map((f) => f.drive_id),
    )
    : null;

  const byId = new Map(all.map((f) => [f.drive_id, f]));

  /** Walk to the drive root; true if any folder on the way is the app's. */
  const isSystemOwned = (folder) => {
    let current = folder;
    for (let depth = 0; current && depth < 50; depth += 1) {
      if (isSystemFolderRow(current)) {
        return true;
      }
      current = current.parent_id ? byId.get(current.parent_id) : null;
    }
    return false;
  };

  /** "Projects / 2026 / Permits" — what the picker shows instead of a bare name. */
  const pathOf = (folder) => {
    const parts = [];
    let current = folder;
    for (let depth = 0; current && depth < 50; depth += 1) {
      parts.unshift(current.name);
      current = current.parent_id ? byId.get(current.parent_id) : null;
    }
    return parts;
  };

  return all
    .filter((f) => !isSystemOwned(f))
    .filter((f) => !reachable || reachable.has(f.drive_id))
    .map((f) => {
      const parts = pathOf(f);
      return {
        id: f.drive_id,
        type: "folder",
        name: f.name,
        path: parts.join(" / "),
        // How far in to indent the row; the path is already in the label.
        depth: parts.length - 1,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
};

export const getRootFoldersService = async (companyId, builderId, referenceId = null, referenceType = null, user = null) => {
  const { Drive, DocumentCommonFolder } = db.sequelize.models;

  const whereClause = {
    parent_id: null,
    ...tenantWhere(companyId, builderId)
  };

  const isEntityTree = Boolean(referenceId && referenceType);
  if (isEntityTree) {
    whereClause.reference_id = referenceId;
    whereClause.reference_type = referenceType;
  } else {
    whereClause.reference_id = null;
  }

  // The global drive root is the company's private tree — restricted roles get
  // only folders they own or that were shared with them. The entity tree
  // (a job's / lead's Documents tab) is deliberately NOT scoped here: it is
  // already bounded to one reference_id, and the caller's right to open that
  // job or lead is enforced by that module's own guard. Scoping it would hide
  // the auto-generated common folders, which nobody "created".
  const folderScope = isEntityTree ? null : await buildFolderScopeWhere(user);

  let folders = await Drive.findAll({
    where: withScope(whereClause, folderScope),
    order: [["name", "ASC"]]
  });

  // Auto-generate common folders for a Job if none exist.
  //
  // Two tabs opening the job at once both saw an empty tree and both ran the
  // bulkCreate below, which is one of the ways a job ended up with every folder
  // twice. Each folder now goes through the shared resolver: it locks on the
  // folder's identity first, so the second caller finds what the first created
  // instead of inserting its own.
  if (folders.length === 0 && referenceId && referenceType === 'job') {
    const commonFolders = await DocumentCommonFolder.findAll({
      where: { company_id: companyId, ...(builderId ? { builder_id: builderId } : {}) },
      order: [["sort_order", "ASC"]]
    });

    if (commonFolders.length > 0) {
      for (const cf of commonFolders) {
        await findOrCreateDriveFolder({
          name: cf.name,
          companyId,
          builderId,
          referenceId,
          referenceType,
          createdBy: user?.users_id || null,
        });
      }
      folders = await Drive.findAll({
        where: whereClause,
        order: [["name", "ASC"]]
      });
    }
  }

  const sizeMap = await getFolderSizeMap(companyId, builderId);

  return folders.map(f => ({
    id: f.drive_id,
    type: 'folder',
    name: f.name,
    parent_id: f.parent_id,
    // Without this the star never survives a refetch of the Drive root
    is_starred: f.is_starred,
    // Lets the UI badge rows the sample-data seeder created
    is_sample_data: Boolean(f.is_sample_data),
    // Everything inside the folder, however deep
    size: sizeMap.get(f.drive_id) || 0,
    // At a tree's root the generated buckets are the rows themselves, so it is
    // the row that is asked here. A folder in an entity's tree moves within that
    // tree — see moveFolderService, which is what enforces the boundary.
    can_move: !isSystemFolderRow(f),
    created_at: f.created_at,
    updated_at: f.updated_at
  }));
};

export const renameFolderService = async (folderId, newName, companyId, userId) => {
  const { Drive } = db.sequelize.models;

  const folder = await Drive.findOne({
    where: { drive_id: folderId, company_id: companyId }
  });

  if (!folder) {
    throw new Error("Folder not found or unauthorized.");
  }

  const whereClause = {
    name: newName,
    parent_id: folder.parent_id,
    company_id: companyId
  };

  if (folder.reference_id) {
    whereClause.reference_id = folder.reference_id;
  } else {
    whereClause.reference_id = null;
  }

  // Check for duplicates
  const existingFolder = await Drive.findOne({
    where: whereClause
  });

  if (existingFolder && existingFolder.drive_id !== folderId) {
    throw new Error("A folder with this name already exists in this location.");
  }

  folder.name = newName;
  folder.updated_by = userId;
  try {
    await folder.save();
  } catch (error) {
    rethrowDuplicateFolder(error, "A folder with this name already exists in this location.");
  }

  const { DriveActivityLog } = db.sequelize.models;
  if (DriveActivityLog) {
    await DriveActivityLog.create({
      company_id: companyId, user_id: userId,
      action: "RENAME", entity_type: "FOLDER", entity_id: folderId, entity_name: newName
    }).catch(e => console.error("Error logging activity", e));
  }

  return folder;
};

export const deleteFolderService = async (folderId, companyId) => {
  const { Drive, DriveFile } = db.sequelize.models;
  const transaction = await db.sequelize.transaction();

  try {
    // paranoid: false — a folder already in Trash is deleted permanently instead
    const folder = await Drive.findOne({
      where: { drive_id: folderId, company_id: companyId },
      paranoid: false,
      transaction
    });

    if (!folder) {
      throw new Error("Folder not found or unauthorized.");
    }

    const isPermanent = Boolean(folder.deleted_at);

    // Recursively find all child folder IDs
    // (when purging, trashed descendants must be included as well)
    const getAllChildFolderIds = async (parentId) => {
      const children = await Drive.findAll({
        where: { parent_id: parentId, company_id: companyId },
        attributes: ['drive_id'],
        paranoid: !isPermanent,
        transaction
      });
      let ids = children.map(c => c.drive_id);
      for (const child of children) {
        ids = ids.concat(await getAllChildFolderIds(child.drive_id));
      }
      return ids;
    };

    const childFolderIds = await getAllChildFolderIds(folderId);
    const allFolderIds = [folderId, ...childFolderIds];

    // Get S3 keys before deleting
    const filesToDelete = await DriveFile.findAll({
      where: { folder_id: allFolderIds },
      attributes: ['file_id', 's3_key'],
      paranoid: !isPermanent,
      transaction
    });
    const s3Keys = filesToDelete.map(f => f.s3_key).filter(Boolean);

    if (isPermanent) {
      // Historical version objects would otherwise be orphaned in S3
      // (their rows cascade away with the file row).
      const { DriveFileVersion } = db.sequelize.models;
      if (DriveFileVersion && filesToDelete.length > 0) {
        const versions = await DriveFileVersion.findAll({
          where: { file_id: filesToDelete.map(f => f.file_id) },
          attributes: ['s3_key'],
          transaction
        });
        s3Keys.push(...versions.map(v => v.s3_key).filter(Boolean));
      }
    }

    // Delete files in all these folders
    await DriveFile.destroy({
      where: { folder_id: allFolderIds },
      force: isPermanent,
      transaction
    });

    // Delete all the folders
    await Drive.destroy({
      where: { drive_id: allFolderIds },
      force: isPermanent,
      transaction
    });

    await transaction.commit();

    // S3 objects are kept on soft delete so the folder stays restorable
    if (isPermanent && s3Keys.length > 0) {
      await deleteObjects(s3Keys).catch(e => console.error("[Drive] S3 purge failed:", e));
    }

    const { DriveActivityLog } = db.sequelize.models;
    if (DriveActivityLog) {
      await DriveActivityLog.create({
        company_id: companyId, user_id: null,
        action: isPermanent ? "DELETE_PERMANENT" : "DELETE",
        entity_type: "FOLDER", entity_id: folderId, entity_name: folder.name
      }).catch(e => console.error("Error logging activity", e));
    }
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

// --- File Services ---

export const uploadFileService = async (file, metadata) => {
  const { DriveFile } = db.sequelize.models;

  const ext = file.originalname.substring(file.originalname.lastIndexOf("."));
  // The administrator-configured format (Admin → Integration → File Naming)
  // names the file; the UUID segment keeps the S3 key collision-proof.
  const namedFile = await buildFileName({
    companyId: metadata.company_id,
    builderId: metadata.builder_id,
    leadId: metadata.lead_id,
    originalName: file.originalname,
    mimeType: file.mimetype,
    extension: ext,
  });
  const uniqueFileName = await ensureUniqueDriveFileName(namedFile);
  const s3Key = `drive/${metadata.company_id}/${uuidv4()}/${uniqueFileName}`;

  // 1. Upload to S3
  const uploadResult = await uploadFile(s3Key, file.buffer, file.mimetype);
  
  if (!uploadResult.success) {
    throw new Error("Failed to upload file to S3");
  }

  // 2. Save metadata in DB. The reference_* / lead_id fields default to null
  // for ordinary Drive uploads; callers that scope a file to an entity (e.g.
  // a Job's Documents tree) pass them so aggregators like getJobDocuments can
  // surface the file.
  const newFile = await DriveFile.create({
    folder_id: metadata.folder_id,
    company_id: metadata.company_id,
    builder_id: metadata.builder_id,
    uploaded_by: metadata.uploaded_by,
    lead_id: metadata.lead_id ?? null,
    reference_id: metadata.reference_id ?? null,
    reference_type: metadata.reference_type ?? null,
    sub_reference_type: metadata.sub_reference_type ?? null,
    original_name: file.originalname,
    file_name: uniqueFileName,
    s3_key: s3Key,
    file_extension: ext,
    mime_type: file.mimetype,
    size: file.size
  });

  // An upload has no "before" — the document did not exist. The new name is
  // recorded as the value so a later rename reads as a change from it.
  await recordDriveActivity({
    companyId: metadata.company_id,
    actor: metadata.uploaded_by,
    action: DRIVE_ACTIONS.UPLOAD,
    entityId: newFile.file_id,
    entityName: newFile.original_name,
    newValue: newFile.original_name,
  });

  // Fire-and-forget thumbnail generation — never blocks the upload response
  setImmediate(() => {
    scheduleThumbnailGeneration(file.buffer, file.mimetype, newFile.file_id, metadata.company_id)
      .catch(e => console.error("[Thumbnail] Async generation error:", e));
  });

  return newFile;
};

export const getFilesService = async (folderId, companyId, user = null) => {
  const { DriveFile } = db.sequelize.models;

  const base = { company_id: companyId };
  if (folderId) {
    base.folder_id = folderId === "root" ? null : folderId;
  }
  const where = withScope(base, await buildFileScopeWhere(user));

  const files = await DriveFile.findAll({
    where,
    order: [["created_at", "DESC"]]
  });

  return files;
};

export const renameFileService = async (fileId, newName, companyId, userId = null) => {
  const { DriveFile } = db.sequelize.models;

  const file = await DriveFile.findOne({
    where: { file_id: fileId, company_id: companyId }
  });

  if (!file) {
    throw new Error("File not found or unauthorized.");
  }

  // The old name, before it is gone. A rename entry that records only the new
  // name cannot answer the one question it is ever asked — what was this called
  // before? — which is what made the old log useless for tracing a document.
  const previousName = file.original_name;

  file.original_name = newName;
  await file.save();

  await recordDriveActivity({
    companyId,
    // The caller has always known who did this; the entry simply never asked
    // for it, and every rename in the log reads as if nobody did it.
    actor: userId,
    action: DRIVE_ACTIONS.RENAME,
    entityId: fileId,
    entityName: newName,
    oldValue: previousName,
    newValue: newName,
  });

  return file;
};

export const deleteFileService = async (fileId, companyId, userId) => {
  const { DriveFile, DriveFileVersion } = db.sequelize.models;

  // paranoid: false — a file already in Trash is deleted permanently instead
  const file = await DriveFile.findOne({
    where: { file_id: fileId, company_id: companyId },
    paranoid: false
  });

  if (!file) {
    throw new Error("File not found or unauthorized.");
  }

  const isPermanent = Boolean(file.deleted_at);

  if (isPermanent) {
    // Purge S3 objects for the live file and every historical version.
    // The drive_file_versions FK cascades, so those rows go with the file row.
    const keys = [file.s3_key];
    if (DriveFileVersion) {
      const versions = await DriveFileVersion.findAll({
        where: { file_id: fileId },
        attributes: ["s3_key"]
      });
      keys.push(...versions.map(v => v.s3_key));
    }
    const s3Keys = keys.filter(Boolean);
    if (s3Keys.length > 0) {
      await deleteObjects(s3Keys).catch(e => console.error("[Drive] S3 purge failed:", e));
    }
    await file.destroy({ force: true });
  } else {
    await file.destroy();
  }

  await recordDriveActivity({
    companyId,
    actor: userId,
    action: isPermanent ? DRIVE_ACTIONS.DELETE_PERMANENT : DRIVE_ACTIONS.DELETE,
    entityId: fileId,
    entityName: file.original_name,
    details: isPermanent
      ? "The document and every stored version of it were removed. This cannot be undone."
      : "Moved to trash. It can be restored from there.",
  });
};

/**
 * A presigned URL for one drive file.
 *
 * `disposition` decides what the browser does with it, because the two actions
 * on a row want opposite things from the same object:
 *
 *   - "inline" (the default) leaves S3's own headers alone. This is what the
 *     document viewer fetches, and what a link in an email needs — a PDF opens
 *     in the browser's viewer instead of dropping into the downloads folder.
 *   - "attachment" makes S3 send Content-Disposition, so Download saves the file
 *     under its real name. Without it, Download on a PDF merely displayed it,
 *     which is the one thing View is already for.
 *
 * The name sent is `original_name` — what the user called the document — rather
 * than the storage name, which carries the configured naming format and a uuid.
 */
export const getDownloadUrlService = async (fileId, companyId, { disposition } = {}) => {
  const { DriveFile } = db.sequelize.models;
  // paranoid: false so files sitting in Trash can still be downloaded
  const file = await DriveFile.findOne({ where: { file_id: fileId, company_id: companyId }, paranoid: false });
  if (!file) throw new Error("File not found");

  const result = await generatePresignedDownloadUrl(
    file.s3_key,
    undefined,
    disposition === "attachment"
      ? file.original_name || file.file_name || undefined
      : undefined,
  );
  if (!result.success) throw new Error("Failed to generate download URL");

  return result.url;
};

/**
 * Move one document into another folder.
 *
 * Only folders a user made take part, at both ends, and only a document a
 * person uploaded may travel between them. Three separate things enforce that,
 * because a "system folder" means something different in each of the two trees
 * this endpoint serves:
 *
 *  1. `isHandUploadedDocument` — a generated document stays where it is. A
 *     quotation report, a compaction PDF, a variation invoice: each is a
 *     rendering of a record, filed by the generator that wrote it, and both the
 *     lead/job trees and the drive place it by its type rather than by its
 *     folder. Moving one would either be undone by the next run or would take
 *     the document out of the bucket its screen reads.
 *  2. `findSystemFolderAncestor` — the generated buckets in the global drive
 *     (Compaction Reports, Quotation Reports, …) are real folder rows, so both
 *     ends are checked against them, inherited down the chain: a folder created
 *     inside one is no way around it.
 *  3. The tree check — a document may only be filed within its own Documents
 *     tree. A lead's document dropped into a job's folder would show up under
 *     that job, and under another lead's folder it would show under that lead.
 *
 * The buckets in a job's or lead's tree (Quotation, Variations, Compaction
 * Report) need no check of their own: they are computed per request and have no
 * folder row, so "Destination folder not found" is already the answer.
 *
 * A tree's root — `newFolderId` of "root", or null — is a valid destination
 * either way. It is where an ordinary upload lands when no folder is chosen.
 *
 * @param {?object} user the caller, for the destination's permission check;
 *        omitted only by internal callers that have already authorised one.
 */
export const moveFileService = async (fileId, newFolderId, companyId, userId, user = null) => {
  const { Drive, DriveFile } = db.sequelize.models;
  const file = await DriveFile.findOne({ where: { file_id: fileId, company_id: companyId } });
  if (!file) throw new Error("File not found");

  if (!isHandUploadedDocument(file)) {
    throw new Error(
      "This document is generated and filed by the app, so it stays in its own folder.",
    );
  }

  // Where it was, before the row is changed. Read by name for the same reason
  // the destination is: an id in an audit entry is not an answer.
  const previousFolder = file.folder_id
    ? await Drive.findOne({
      where: { drive_id: file.folder_id, company_id: companyId },
      attributes: ["drive_id", "name"],
    })
    : null;
  const previousFolderName = previousFolder?.name || "the Documents root";

  const sourceSystemFolder = await findSystemFolderAncestor(file.folder_id, companyId);
  if (sourceSystemFolder) {
    throw new Error(
      `"${sourceSystemFolder.name}" is filed by the app, so the documents in it cannot be moved.`,
    );
  }

  const tree = documentTreeOf(file);
  const destFolderId = newFolderId === "root" ? null : newFolderId;
  let destFolderName = null;
  if (destFolderId) {
    const folder = await Drive.findOne({ where: { drive_id: destFolderId, company_id: companyId }});
    if (!folder) throw new Error("Destination folder not found");

    if (
      (folder.reference_id || null) !== tree.referenceId ||
      (folder.reference_type || null) !== tree.referenceType
    ) {
      throw new Error(
        "A document can only be moved into a folder of the same Documents tree.",
      );
    }

    const destSystemFolder = await findSystemFolderAncestor(destFolderId, companyId);
    if (destSystemFolder) {
      throw new Error(
        `"${destSystemFolder.name}" is filed by the app. Documents can only be moved into folders you created.`,
      );
    }

    // The global drive resolves a share level per folder, so filing into one is
    // an EDIT there. An entity's tree does not — getRootFoldersService leaves it
    // unscoped on purpose, and the right to file into a job's or lead's folder
    // is the right to open that job or lead, which the caller proved by reaching
    // this document at all.
    if (!folder.reference_id && user) {
      const permission = await resolvePermission(userId, companyId, "FOLDER", destFolderId, user);
      if (!hasAtLeast(permission, "EDIT")) {
        throw new Error("You need edit access on the destination folder.");
      }
    }

    destFolderName = folder.name;
  }

  file.folder_id = destFolderId;
  await file.save();

  // Folder names rather than ids: an audit entry reading "moved to folder
  // 8f3c…" tells the reader nothing they can act on.
  await recordDriveActivity({
    companyId,
    actor: userId,
    action: DRIVE_ACTIONS.MOVE,
    entityId: file.file_id,
    entityName: file.original_name,
    oldValue: previousFolderName,
    newValue: destFolderId ? destFolderName : "My Drive (root)",
  });

  return file;
};

/**
 * File a folder under another folder, or at the drive root.
 *
 * Which folders may take part is the same question `moveFileService` answers for
 * a document, and the answers have to agree — the picker is filled from one list
 * for both:
 *
 *  1. The folder must be one a person created. A generated report bucket is
 *     found again by name at its own place in the tree, so moving it would send
 *     the next report somewhere nobody is looking, and a folder created inside
 *     one inherits that.
 *  2. It stays in its own tree. A folder in a lead's Documents tab may be filed
 *     under another of that lead's folders, exactly as a document may — but not
 *     into a job's tree or the global drive, where it would appear under a record
 *     it has nothing to do with. The buckets a tree computes per request
 *     (Quotation, Variations, Compaction Report) have no folder row at all, so
 *     "Destination folder not found" already answers for them.
 *  3. Filing into the destination is a write to it — EDIT, like every other.
 *  4. A folder cannot land in itself or in its own subtree, which would take the
 *     branch off the tree with it.
 *
 * @param {?object} user the caller, for the destination's permission check;
 *        omitted only by internal callers that have already authorised one.
 */
export const moveFolderService = async (folderId, newParentId, companyId, userId, user = null) => {
  const { Drive } = db.sequelize.models;
  const folder = await Drive.findOne({ where: { drive_id: folderId, company_id: companyId }});
  if (!folder) throw new Error("Folder not found");

  const sourceSystemFolder = await findSystemFolderAncestor(folderId, companyId);
  if (sourceSystemFolder) {
    throw new Error(
      sourceSystemFolder.drive_id === folder.drive_id
        ? `"${folder.name}" is filed by the app, so it stays where it is.`
        : `"${sourceSystemFolder.name}" is filed by the app, so the folders in it cannot be moved.`,
    );
  }

  // Where it was, before the row is changed — by name, because an id in an audit
  // entry is not an answer.
  const previousParent = folder.parent_id
    ? await Drive.findOne({
      where: { drive_id: folder.parent_id, company_id: companyId },
      attributes: ["drive_id", "name"],
    })
    : null;
  const previousParentName = previousParent?.name || "My Drive (root)";

  // "root", "" and null all mean the drive root, which the schema allows and the
  // picker offers as "My Drive".
  const destParentId = !newParentId || newParentId === "root" ? null : newParentId;
  if (destParentId === folderId) throw new Error("Cannot move a folder into itself");

  let destParentName = null;
  if (destParentId) {
    const destFolder = await Drive.findOne({ where: { drive_id: destParentId, company_id: companyId }});
    if (!destFolder) throw new Error("Destination folder not found");

    if (
      (destFolder.reference_id || null) !== (folder.reference_id || null) ||
      (destFolder.reference_type || null) !== (folder.reference_type || null)
    ) {
      throw new Error(
        "A folder can only be moved within the Documents tree it belongs to.",
      );
    }

    const destSystemFolder = await findSystemFolderAncestor(destParentId, companyId);
    if (destSystemFolder) {
      throw new Error(
        `"${destSystemFolder.name}" is filed by the app. Folders can only be moved into folders you created.`,
      );
    }

    // Same split moveFileService makes: the global drive resolves a share level
    // per folder, so filing into one is an EDIT there. An entity's tree does not
    // — the right to file into a job's or lead's folder is the right to open
    // that record, which the caller proved by reaching this folder at all.
    if (!destFolder.reference_id && user) {
      const permission = await resolvePermission(userId, companyId, "FOLDER", destParentId, user);
      if (!hasAtLeast(permission, "EDIT")) {
        throw new Error("You need edit access on the destination folder.");
      }
    }

    const getAllChildFolderIds = async (parentId) => {
      const children = await Drive.findAll({ where: { parent_id: parentId, company_id: companyId }, attributes: ['drive_id'] });
      let ids = children.map(c => c.drive_id);
      for (const child of children) {
        ids = ids.concat(await getAllChildFolderIds(child.drive_id));
      }
      return ids;
    };
    const childIds = await getAllChildFolderIds(folderId);
    if (childIds.includes(destParentId)) throw new Error("Cannot move a folder into its own subfolder");

    destParentName = destFolder.name;
  }

  // Excluding the folder itself, or a move that changes nothing — asking for the
  // parent it is already under — would report a name clash with itself.
  const duplicate = await Drive.findOne({
    where: {
      name: folder.name,
      parent_id: destParentId,
      company_id: companyId,
      drive_id: { [Op.ne]: folderId },
    },
  });
  if (duplicate) throw new Error("A folder with this name already exists in the destination");

  folder.parent_id = destParentId;
  try {
    await folder.save();
  } catch (error) {
    rethrowDuplicateFolder(error, "A folder with this name already exists in the destination");
  }

  await recordDriveActivity({
    companyId,
    actor: userId,
    action: DRIVE_ACTIONS.MOVE,
    entityType: "FOLDER",
    entityId: folder.drive_id,
    entityName: folder.name,
    oldValue: previousParentName,
    newValue: destParentId ? destParentName : "My Drive (root)",
  });

  return folder;
};

export const searchDriveService = async (query, companyId, user = null) => {
  const { Drive, DriveFile } = db.sequelize.models;
  const [folderScope, fileScope] = await Promise.all([
    buildFolderScopeWhere(user),
    buildFileScopeWhere(user),
  ]);

  const folders = await Drive.findAll({
    where: withScope({ name: { [Op.iLike]: `%${query}%` }, company_id: companyId }, folderScope),
    order: [["name", "ASC"]]
  });
  const files = await DriveFile.findAll({
    where: withScope({ original_name: { [Op.iLike]: `%${query}%` }, company_id: companyId }, fileScope),
    include: [{ model: db.sequelize.models.Users, as: "uploadedByUser", attributes: ["name"] }],
    order: [["original_name", "ASC"]]
  });

  const settings = await db.sequelize.models.GeneralSettings.findOne({
    where: { company_id: companyId }
  });
  const editablePdfTypes = settings?.editable_pdf_types || [];
  // The types an administrator has turned editing off for. A blocklist, so an
  // empty one means nothing is restricted — see documentEditPermission.helper.js.
  const blockedTypes = settings?.non_editable_document_types || [];

  const formattedFolders = folders.map(f => ({
    id: f.drive_id, type: 'folder', name: f.name, parent_id: f.parent_id,
    is_starred: f.is_starred, created_at: f.created_at, updated_at: f.updated_at
  }));
  const formattedFiles = files.map(f => ({
    id: f.file_id, type: 'file', name: f.original_name, file_extension: f.file_extension,
    size: f.size, mime_type: f.mime_type, url: f.s3_key, parent_id: f.folder_id,
    is_starred: f.is_starred,
    is_editable: isPdfEditable(f, editablePdfTypes, blockedTypes),
    // Whether this document may be edited at all — the Admin → Document
    // Management switch. Distinct from `is_editable` above, which only says whether a
    // generated PDF offers the edit-the-record form.
    editing_allowed: isDocumentEditingAllowed(f, blockedTypes),
    pdf_type: getPdfTypeTag(f),
    created_at: f.created_at,
    updated_at: f.updated_at,
    uploaded_by_name: f.uploadedByUser?.name || null,
  }));

  return { items: [...formattedFolders, ...formattedFiles] };
};

// --- STAGE A Enhancements ---

/**
 * Trash is the owner's bin, not a shared one.
 *
 * includeShares: false is the difference — a deleted item is listed for whoever
 * owns it (and the company-wide administrators, for whom both builders return
 * null and impose no restriction), never for the people it happened to be
 * shared with. They lost sight of it when it was deleted, and restoring it is
 * the owner's call: see clearSharesOnRestore for what that restore hands back.
 */
export const getTrashService = async (companyId, user = null) => {
  const { Drive, DriveFile } = db.sequelize.models;
  const [folderScope, fileScope] = await Promise.all([
    buildFolderScopeWhere(user, { includeShares: false }),
    buildFileScopeWhere(user, { includeShares: false }),
  ]);

  const folders = await Drive.findAll({
    where: withScope({ company_id: companyId, deleted_at: { [Op.not]: null } }, folderScope),
    paranoid: false,
    order: [["deleted_at", "DESC"]]
  });
  const files = await DriveFile.findAll({
    where: withScope({ company_id: companyId, deleted_at: { [Op.not]: null } }, fileScope),
    include: [{ model: db.sequelize.models.Users, as: "uploadedByUser", attributes: ["name"] }],
    paranoid: false,
    order: [["deleted_at", "DESC"]]
  });

  const settings = await db.sequelize.models.GeneralSettings.findOne({
    where: { company_id: companyId }
  });
  const editablePdfTypes = settings?.editable_pdf_types || [];
  // The types an administrator has turned editing off for. A blocklist, so an
  // empty one means nothing is restricted — see documentEditPermission.helper.js.
  const blockedTypes = settings?.non_editable_document_types || [];

  const formattedFolders = folders.map(f => ({
    id: f.drive_id, type: 'folder', name: f.name, parent_id: f.parent_id,
    is_starred: f.is_starred, created_at: f.created_at, updated_at: f.updated_at, deleted_at: f.deleted_at
  }));
  const formattedFiles = files.map(f => ({
    id: f.file_id, type: 'file', name: f.original_name, file_extension: f.file_extension,
    size: f.size, mime_type: f.mime_type, url: f.s3_key, parent_id: f.folder_id,
    is_starred: f.is_starred,
    is_editable: isPdfEditable(f, editablePdfTypes, blockedTypes),
    // Whether this document may be edited at all — the Admin → Document
    // Management switch. Distinct from `is_editable` above, which only says whether a
    // generated PDF offers the edit-the-record form.
    editing_allowed: isDocumentEditingAllowed(f, blockedTypes),
    pdf_type: getPdfTypeTag(f),
    created_at: f.created_at,
    updated_at: f.updated_at,
    deleted_at: f.deleted_at,
    uploaded_by_name: f.uploadedByUser?.name || null,
  }));

  return { items: [...formattedFolders, ...formattedFiles] };
};

/**
 * Drop every share on a restored item, so it comes back belonging to its owner
 * alone and Manage Access starts empty.
 *
 * Restoring is the owner taking the item back: whoever could reach it before it
 * was deleted — including whoever asked for the deletion — has to be given
 * access again deliberately. For a folder that covers the whole subtree, since
 * a direct share on a child would otherwise keep handing it out on its own.
 *
 * Deleting share rows is only half of it: an item inside a shared folder has no
 * share row at all and is reachable through the folder's. `inherit_shares` is
 * the other half — see setInheritsShares.
 *
 * @returns {Promise<number>} how many share rows were removed.
 */
const clearSharesOnRestore = async ({ companyId, folderIds = [], fileIds = [], transaction }) => {
  const { DriveShare } = db.sequelize.models;
  const clauses = [];
  if (folderIds.length) clauses.push({ entity_type: "FOLDER", entity_id: folderIds });
  if (fileIds.length) clauses.push({ entity_type: "FILE", entity_id: fileIds });
  if (!clauses.length) return 0;

  return DriveShare.destroy({
    where: { company_id: companyId, [Op.or]: clauses },
    transaction,
  });
};

/**
 * Cut a restored item off from the shares on the folders above it.
 *
 * Deleting share rows cannot make a file inside a shared folder private: it has
 * none of its own — the folder's share is what reaches it. So the item carries
 * `inherit_shares = false` instead, and the resolver and the listing scope both
 * stop climbing at it. The folder stays shared with everyone it was shared
 * with; this one item does not come back with it.
 *
 * Only the restored item is marked. A folder's children keep inheriting from
 * the folder, which is now private itself, so the whole subtree goes with it.
 */
const setInheritsShares = async ({ entityType, entityId, transaction }) => {
  const { Drive, DriveFile } = db.sequelize.models;
  if (entityType === "FOLDER") {
    await Drive.update({ inherit_shares: false }, { where: { drive_id: entityId }, transaction });
  } else {
    await DriveFile.update({ inherit_shares: false }, { where: { file_id: entityId }, transaction });
  }
};

export const restoreFolderService = async (folderId, companyId, userId) => {
  const { Drive, DriveFile, DriveActivityLog } = db.sequelize.models;
  const folder = await Drive.findOne({
    where: { drive_id: folderId, company_id: companyId },
    paranoid: false
  });

  if (!folder || !folder.deleted_at) {
    throw new Error("Folder not found in trash.");
  }

  const transaction = await db.sequelize.transaction();
  try {
    // 1. If any parent folders are soft-deleted, restore them recursively first
    const restoreDeletedParents = async (parentFolder) => {
      if (!parentFolder) return;
      if (parentFolder.deleted_at) {
        try {
          await parentFolder.restore({ transaction });
        } catch (error) {
          rethrowDuplicateFolder(
            error,
            `Cannot restore parent folder "${parentFolder.name}" because a folder with the same name already exists. Rename the existing one, then try again.`
          );
        }
      }
      if (parentFolder.parent_id) {
        const grandparent = await Drive.findOne({
          where: { drive_id: parentFolder.parent_id, company_id: companyId },
          paranoid: false,
          transaction
        });
        if (grandparent) {
          await restoreDeletedParents(grandparent);
        }
      }
    };

    if (folder.parent_id) {
      const parent = await Drive.findOne({
        where: { drive_id: folder.parent_id, company_id: companyId },
        paranoid: false,
        transaction
      });
      if (parent) {
        await restoreDeletedParents(parent);
      }
    }

    // Restore the folder. A live folder may have taken this name while it sat
    // in Trash — the unique index catches that rather than letting the drive
    // end up with the pair, so say which name is in the way.
    try {
      await folder.restore({ transaction });
    } catch (error) {
      rethrowDuplicateFolder(
        error,
        `A folder named "${folder.name}" already exists in that location. Rename it, then restore this one.`,
      );
    }

    // Recursively find all child folder IDs that were deleted at the same time (optional, but good practice)
    // For simplicity, we just restore all children that have deletedAt NOT NULL.
    const getAllChildFolderIds = async (parentId) => {
      const children = await Drive.findAll({
        where: { parent_id: parentId, company_id: companyId },
        attributes: ['drive_id'],
        paranoid: false,
        transaction
      });
      let ids = children.map(c => c.drive_id);
      for (const child of children) {
        ids = ids.concat(await getAllChildFolderIds(child.drive_id));
      }
      return ids;
    };

    const childFolderIds = await getAllChildFolderIds(folderId);
    const allFolderIds = [folderId, ...childFolderIds];

    // Read before restoring: the same set either way (restore does not move
    // anything), and it is what the share cleanup below is keyed on.
    const subtreeFiles = await DriveFile.findAll({
      where: { folder_id: allFolderIds },
      attributes: ["file_id"],
      paranoid: false,
      transaction,
    });

    try {
      await Drive.restore({ where: { drive_id: allFolderIds }, transaction });
    } catch (error) {
      rethrowDuplicateFolder(
        error,
        "A sub-folder of this one clashes with a folder that already exists. Rename the existing one, then restore.",
      );
    }

    try {
      await DriveFile.restore({ where: { folder_id: allFolderIds }, transaction });
    } catch (error) {
      if (error?.name === "SequelizeUniqueConstraintError") {
        throw new Error(
          "A file in this folder clashes with a newer version of the same document. Remove the newer one, then restore."
        );
      }
      throw error;
    }

    // Back in the owner's hands, shared with nobody — see clearSharesOnRestore.
    const sharesCleared = await clearSharesOnRestore({
      companyId,
      folderIds: allFolderIds,
      fileIds: subtreeFiles.map(f => f.file_id),
      transaction,
    });
    // …and out of reach of the share on whatever folder it sits in.
    await setInheritsShares({ entityType: "FOLDER", entityId: folderId, transaction });

    await transaction.commit();

    if (DriveActivityLog) {
      await DriveActivityLog.create({
        company_id: companyId, user_id: userId,
        action: "RESTORE", entity_type: "FOLDER", entity_id: folderId, entity_name: folder.name
      }).catch(e => console.error("Error logging activity", e));
    }
    return { item: folder, sharesCleared };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const restoreFileService = async (fileId, companyId, userId) => {
  const { Drive, DriveFile } = db.sequelize.models;
  const file = await DriveFile.findOne({
    where: { file_id: fileId, company_id: companyId },
    paranoid: false
  });

  if (!file || !file.deleted_at) {
    throw new Error("File not found in trash.");
  }

  const transaction = await db.sequelize.transaction();
  try {
    const restoreDeletedParents = async (parentFolder) => {
      if (!parentFolder) return;
      if (parentFolder.deleted_at) {
        try {
          await parentFolder.restore({ transaction });
        } catch (error) {
          rethrowDuplicateFolder(
            error,
            `Cannot restore parent folder "${parentFolder.name}" because a folder with the same name already exists. Rename the existing one, then try again.`
          );
        }
      }
      if (parentFolder.parent_id) {
        const grandparent = await Drive.findOne({
          where: { drive_id: parentFolder.parent_id, company_id: companyId },
          paranoid: false,
          transaction
        });
        if (grandparent) {
          await restoreDeletedParents(grandparent);
        }
      }
    };

    if (file.folder_id) {
      const parent = await Drive.findOne({
        where: { drive_id: file.folder_id, company_id: companyId },
        paranoid: false,
        transaction
      });
      if (parent) {
        await restoreDeletedParents(parent);
      }
    }

    try {
      await file.restore({ transaction });
    } catch (error) {
      if (error?.name === "SequelizeUniqueConstraintError") {
        throw new Error(
          "This file clashes with a newer version of the same document. Remove the newer one, then restore."
        );
      }
      throw error;
    }

    // Only this file's own shares. A parent folder restored above came back as
    // the container this file needs, not as the thing being restored, so its
    // sharing is left as the owner set it.
    const sharesCleared = await clearSharesOnRestore({
      companyId,
      fileIds: [fileId],
      transaction,
    });
    // The one that matters for a file in a shared folder: it has no share of
    // its own, so this is what stops the folder's share reaching it again.
    await setInheritsShares({ entityType: "FILE", entityId: fileId, transaction });

    await transaction.commit();

    await recordDriveActivity({
      companyId,
      actor: userId,
      action: DRIVE_ACTIONS.RESTORE,
      entityId: fileId,
      entityName: file.original_name,
      details: sharesCleared
        ? `Restored from trash. ${sharesCleared} share${sharesCleared === 1 ? "" : "s"} were cleared and have to be granted again.`
        : "Restored from trash.",
    });
    return { item: file, sharesCleared };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

export const emptyTrashService = async (companyId, userId) => {
  const { Drive, DriveFile, DriveActivityLog } = db.sequelize.models;

  const filesToDelete = await DriveFile.findAll({
    where: { company_id: companyId, deleted_at: { [Op.not]: null } },
    attributes: ['s3_key', 'file_id'],
    paranoid: false
  });
  
  const s3Keys = filesToDelete.map(f => f.s3_key);
  if (s3Keys.length > 0) {
    await deleteObjects(s3Keys);
  }

  await DriveFile.destroy({
    where: { company_id: companyId, deleted_at: { [Op.not]: null } },
    force: true
  });
  await Drive.destroy({
    where: { company_id: companyId, deleted_at: { [Op.not]: null } },
    force: true
  });

  if (DriveActivityLog) {
    await DriveActivityLog.create({
      company_id: companyId, user_id: userId,
      action: "EMPTY_TRASH", entity_type: "FOLDER", entity_name: "Trash"
    }).catch(e => console.error("Error logging activity", e));
  }
};

export const toggleStarFolderService = async (folderId, companyId) => {
  const { Drive } = db.sequelize.models;
  const folder = await Drive.findOne({ where: { drive_id: folderId, company_id: companyId } });
  if (!folder) throw new Error("Folder not found.");
  
  folder.is_starred = !folder.is_starred;
  await folder.save();
  return folder;
};

export const toggleStarFileService = async (fileId, companyId) => {
  const { DriveFile } = db.sequelize.models;
  const file = await DriveFile.findOne({ where: { file_id: fileId, company_id: companyId } });
  if (!file) throw new Error("File not found.");
  
  file.is_starred = !file.is_starred;
  await file.save();
  return file;
};

export const getStarredService = async (companyId, user = null) => {
  const { Drive, DriveFile } = db.sequelize.models;
  const [folderScope, fileScope] = await Promise.all([
    buildFolderScopeWhere(user),
    buildFileScopeWhere(user),
  ]);

  const folders = await Drive.findAll({
    where: withScope({ company_id: companyId, is_starred: true }, folderScope),
    order: [["name", "ASC"]]
  });
  const files = await DriveFile.findAll({
    where: withScope({ company_id: companyId, is_starred: true }, fileScope),
    include: [{ model: db.sequelize.models.Users, as: "uploadedByUser", attributes: ["name"] }],
    order: [["original_name", "ASC"]]
  });

  const settings = await db.sequelize.models.GeneralSettings.findOne({
    where: { company_id: companyId }
  });
  const editablePdfTypes = settings?.editable_pdf_types || [];
  // The types an administrator has turned editing off for. A blocklist, so an
  // empty one means nothing is restricted — see documentEditPermission.helper.js.
  const blockedTypes = settings?.non_editable_document_types || [];

  const formattedFolders = folders.map(f => ({
    id: f.drive_id, type: 'folder', name: f.name, parent_id: f.parent_id,
    is_starred: f.is_starred, created_at: f.created_at, updated_at: f.updated_at
  }));
  const formattedFiles = files.map(f => ({
    id: f.file_id, type: 'file', name: f.original_name, file_extension: f.file_extension,
    is_starred: f.is_starred, size: f.size, mime_type: f.mime_type, url: f.s3_key, parent_id: f.folder_id,
    is_editable: isPdfEditable(f, editablePdfTypes, blockedTypes),
    // Whether this document may be edited at all — the Admin → Document
    // Management switch. Distinct from `is_editable` above, which only says whether a
    // generated PDF offers the edit-the-record form.
    editing_allowed: isDocumentEditingAllowed(f, blockedTypes),
    pdf_type: getPdfTypeTag(f),
    created_at: f.created_at, updated_at: f.updated_at,
    uploaded_by_name: f.uploadedByUser?.name || null,
  }));

  return { items: [...formattedFolders, ...formattedFiles] };
};

export const getRecentFilesService = async (companyId, user = null) => {
  const { DriveFile, Leads } = db.sequelize.models;
  const fileScope = await buildFileScopeWhere(user);
  const files = await DriveFile.findAll({
    where: withScope({ company_id: companyId }, fileScope),
    include: [{ model: db.sequelize.models.Users, as: "uploadedByUser", attributes: ["name"] }],
    order: [["created_at", "DESC"]],
    limit: 20
  });

  // Resolve the customer (lead) each file belongs to, for display. Generated
  // reports and lead/job uploads carry the denormalised lead_id; a direct Lead
  // reference covers the rest. One batched lookup for the whole page.
  const leadIdOf = (f) =>
    f.lead_id ||
    (f.reference_type === "Lead" || f.reference_type === "LeadDocument" ? f.reference_id : null);

  const leadIds = [...new Set(files.map(leadIdOf).filter(Boolean))];
  const leadMap = new Map();
  if (leadIds.length && Leads) {
    const leads = await Leads.findAll({
      where: { leads_id: { [Op.in]: leadIds } },
      attributes: ["leads_id", "name", "reference_number"],
    });
    for (const l of leads) {
      leadMap.set(l.leads_id, { name: l.name || null, reference: l.reference_number || null });
    }
  }

  const settings = await db.sequelize.models.GeneralSettings.findOne({
    where: { company_id: companyId }
  });
  const editablePdfTypes = settings?.editable_pdf_types || [];
  // The types an administrator has turned editing off for. A blocklist, so an
  // empty one means nothing is restricted — see documentEditPermission.helper.js.
  const blockedTypes = settings?.non_editable_document_types || [];

  const formattedFiles = files.map(f => {
    const customer = leadMap.get(leadIdOf(f)) || null;
    return {
      id: f.file_id, type: 'file', name: f.original_name, file_extension: f.file_extension,
      is_starred: f.is_starred, size: f.size, mime_type: f.mime_type, url: f.s3_key, parent_id: f.folder_id,
      customer_name: customer?.name || null, customer_reference: customer?.reference || null,
      document_type_label: documentTypeLabelOf(f.reference_type, f.sub_reference_type),
      is_editable: isPdfEditable(f, editablePdfTypes, blockedTypes),
      // Whether this document may be edited at all — the Admin → Document
      // Management switch. Distinct from `is_editable` above, which only says whether a
      // generated PDF offers the edit-the-record form.
      editing_allowed: isDocumentEditingAllowed(f, blockedTypes),
      pdf_type: getPdfTypeTag(f),
      created_at: f.created_at, updated_at: f.updated_at,
      uploaded_by_name: f.uploadedByUser?.name || null,
    };
  });

  return { items: formattedFiles };
};

export const getStorageStatsService = async (companyId, user = null) => {
  const { DriveFile } = db.sequelize.models;
  // Counted over the same scope the listings use, so the totals a restricted
  // role sees match the files they can actually open.
  const where = withScope({ company_id: companyId }, await buildFileScopeWhere(user));
  const sum = await DriveFile.sum('size', { where });
  const count = await DriveFile.count({ where });
  return { total_bytes: sum || 0, total_files: count };
};

export const getFolderBreadcrumbsService = async (folderId, companyId, user = null) => {
  const { Drive } = db.sequelize.models;
  const breadcrumbs = [];
  let currentId = folderId;

  while (currentId) {
    const folder = await Drive.findOne({ where: { drive_id: currentId, company_id: companyId } });
    if (!folder) break;
    breadcrumbs.unshift({ id: folder.drive_id, name: folder.name });
    currentId = folder.parent_id;
  }

  // Someone who was shared a nested folder gets the trail from that folder
  // down, not the names of the ancestors above it — those are folders they
  // cannot open, so a crumb pointing at one would only 403. Access down a
  // shared branch is contiguous, so the first reachable crumb starts the trail.
  if (user && !(await hasFullDriveAccess(user))) {
    let firstReachable = breadcrumbs.length;
    for (let i = 0; i < breadcrumbs.length; i++) {
      if (await canAccessFolder(user, breadcrumbs[i].id)) {
        firstReachable = i;
        break;
      }
    }
    return { breadcrumbs: breadcrumbs.slice(firstReachable) };
  }

  return { breadcrumbs };
};
