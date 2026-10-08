import { randomUUID } from "crypto";

import { Op } from "sequelize";
import db from "../config/database/models/postgre-models/index.js";
import { copyS3Object } from "../utils/s3Upload.js";
import { ensureUniqueDriveFileName } from "../service/fileNaming.service.js";
import { findOrCreateDriveFolder } from "./driveFolder.helper.js";

/**
 * S Drive cloning for the sample-data importer.
 *
 * The importer already copies leads, quotations, jobs and the catalog, and
 * `cloneImageDriveFile` copies the images those rows point at. What it never
 * copied is the S Drive itself: the company folder tree (`drive` rows with
 * reference_id IS NULL) and the files sitting inside it (`drive_files` with a
 * folder_id). My Drive lists exactly those, which is why a freshly seeded
 * company saw folders — auto-created on demand by the report helpers — but
 * never a single file in them.
 *
 * Two passes, in this order:
 *   1. `cloneDriveFolders` — runs *before* the entity clone so the folder map
 *      exists while `cloneImageDriveFile` is filing images.
 *   2. `cloneDriveFiles`   — runs *last* so every entity id it has to remap
 *      (lead, property detail, quotation version, job) is already mapped.
 */

/** S3 objects are copied this many at a time; the import holds a PG transaction. */
const S3_COPY_CONCURRENCY = 10;

/** Rows are inserted in chunks of this size. */
const INSERT_CHUNK = 100;

/** A copy of `key` under a fresh, collision-proof name in the same prefix. */
const destinationKeyFor = (key, fileId) => {
  const slash = key.lastIndexOf("/");
  const prefix = slash >= 0 ? key.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? key.slice(slash + 1) : key;
  return `${prefix}${fileId}-${basename}`;
};

/**
 * Tenant filter for the source side. A folder created on demand by a report
 * helper takes `builder_id` from the lead behind the document and can end up
 * NULL, so matching the builder strictly would silently skip exactly the rows
 * this clone exists to carry. The company still bounds it to one tenant.
 */
const sourceTenantWhere = (companyId, builderId) => ({
  company_id: companyId,
  ...(builderId ? { [Op.or]: [{ builder_id: builderId }, { builder_id: null }] } : {}),
});

/** Run `worker` over `items` with a bounded number in flight. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * Clone the source company's My Drive folder tree into the target company.
 *
 * Only reference-less folders are cloned — an entity's Documents tree (a job's
 * or lead's folders) is auto-generated per entity and would need that entity's
 * id, which does not exist yet at this point in the import.
 *
 * Parents are created before children, and each folder goes through the shared
 * resolver (`findOrCreateDriveFolder`): a folder the target company already has
 * — typically created on demand by a report helper — is reused rather than
 * duplicated, and is deliberately NOT flagged, so the purge leaves it alone.
 *
 * Re-importing used to add a fresh copy of every bucket each time. The clone
 * matched on the target account's builder_id while the report helpers had
 * stamped whichever lead's builder came first, and a bucket already in Trash was
 * invisible to the paranoid find — so neither existing row was ever recognised.
 * The resolver settles both, and the partial unique index on `drive` is what
 * stops a concurrent pass from slipping a second row in behind it.
 *
 * @returns {Promise<Object>} source drive_id → target drive_id
 */
export async function cloneDriveFolders(
  { sourceCompanyId, sourceBuilderId, targetCompanyId, targetBuilderId, targetUserId },
  transaction,
) {
  const { Drive } = db.sequelize.models;

  const sourceFolders = await Drive.findAll({
    // where: {
    //   company_id: sourceCompanyId,
    //   ...(sourceBuilderId ? { builder_id: sourceBuilderId } : {}),
    //   reference_id: null,
    // },
    where: {
      ...sourceTenantWhere(sourceCompanyId, sourceBuilderId),
      reference_id: null,
    },
    order: [["sort_order", "ASC"], ["name", "ASC"]],
    // Trash included. Drive is paranoid, so the default scope reads only live
    // rows and the demo account's Trash never came across — the imported
    // company opened Settings → Documents → Trash on an empty screen, which
    // reads as a broken feature rather than as an empty bin. A trashed source
    // is cloned trashed, below.
    paranoid: false,
    transaction,
  });

  const childrenOf = new Map();
  for (const folder of sourceFolders) {
    const key = folder.parent_id || "__root__";
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(folder);
  }

  const folderMapping = {};

  const cloneLevel = async (parentKey, targetParentId) => {
    for (const folder of childrenOf.get(parentKey) || []) {
      const targetFolder = await findOrCreateDriveFolder({
        name: folder.name,
        parentId: targetParentId,
        companyId: targetCompanyId,
        builderId: targetBuilderId,
        createdBy: targetUserId,
        // A trashed source stays trashed on this side rather than reappearing in
        // My Drive as something nobody filed — so it must not pull a matching
        // folder back out of the target's Trash either.
        restoreTrashed: !folder.deleted_at,
        defaults: {
          is_starred: folder.is_starred,
          sort_order: folder.sort_order,
          deleted_at: folder.deleted_at || null,
          is_sample_data: true,
        },
        transaction,
      });

      folderMapping[folder.drive_id] = targetFolder.drive_id;
      await cloneLevel(folder.drive_id, targetFolder.drive_id);
    }
  };

  await cloneLevel("__root__", null);

  return folderMapping;
}

/**
 * Clone the files that live inside the cloned folders.
 *
 * Every id a file carries is remapped through `idMapping` (source row id →
 * cloned row id, collected by the importer as it goes). A file pointing at an
 * entity the importer does not clone — a building contract, a maintenance
 * attachment — keeps its content and its folder but loses the polymorphic
 * reference: nulling it is what makes it safe against
 * `drive_files_polymorphic_active_unique`, which only covers rows whose
 * reference is set. Dropping such a file instead would leave the folder empty,
 * which is the whole problem this pass exists to fix.
 *
 * Each clone gets its own S3 object, never a shared key — the purge deletes S3
 * objects by key, so a shared key would let one tenant's "Delete sample data"
 * destroy the master demo file for everyone.
 *
 * @param {Set<string>} skipSourceFileIds source file ids already cloned earlier
 *   in the import (by `cloneImageDriveFile`), which must not be cloned twice.
 * @returns {Promise<{created:number, skippedDuplicate:number, skippedCopyFailed:number}>}
 */
export async function cloneDriveFiles(
  {
    sourceCompanyId,
    sourceBuilderId,
    targetCompanyId,
    targetBuilderId,
    targetUserId,
    folderMapping = {},
    idMapping = {},
    skipSourceFileIds = new Set(),
  },
  transaction,
) {
  const { DriveFile } = db.sequelize.models;

  const sourceFolderIds = Object.keys(folderMapping);
  if (sourceFolderIds.length === 0) {
    return { created: 0, skippedDuplicate: 0, skippedCopyFailed: 0 };
  }

  const sourceFiles = await DriveFile.findAll({
    // where: {
    //   company_id: sourceCompanyId,
    //   ...(sourceBuilderId ? { builder_id: sourceBuilderId } : {}),
    //   folder_id: { [Op.in]: sourceFolderIds },
    // },
    where: {
      ...sourceTenantWhere(sourceCompanyId, sourceBuilderId),
      folder_id: { [Op.in]: sourceFolderIds },
    },
    order: [["created_at", "ASC"]],
    // Trash included, for the same reason the folders are — see cloneDriveFolders.
    paranoid: false,
    transaction,
  });

  if (sourceFiles.length === 0) {
    return { created: 0, skippedDuplicate: 0, skippedCopyFailed: 0 };
  }

  // Tuples the target company already holds, so a file the entity clone or a
  // model hook has already produced is not inserted a second time.
  const existing = await DriveFile.findAll({
    where: {
      company_id: targetCompanyId,
      reference_id: { [Op.ne]: null },
      reference_type: { [Op.ne]: null },
      sub_reference_type: { [Op.ne]: null },
    },
    attributes: ["reference_id", "reference_type", "sub_reference_type"],
    transaction,
    raw: true,
  });
  const takenTuples = new Set(
    existing.map((row) => `${row.reference_id}|${row.reference_type}|${row.sub_reference_type}`),
  );

  // A second identity, for the files the tuple above cannot speak for.
  //
  // That check needs a complete polymorphic reference, and a great many files do
  // not have one. A maintenance attachment carries no `sub_reference_type` at
  // all. A file whose reference cannot be remapped has its reference dropped
  // here on purpose (see `keepsReference` below). Either way the row arrives at
  // the guard with nothing to be recognised by, so the guard waves it through —
  // and a sync, which re-runs this whole pass over the same source files,
  // inserted another copy every single time. `ensureUniqueDriveFileName` then
  // filed them as `-2`, `-3`, `-4`, so nothing collided and nothing complained;
  // My Drive just filled up with the same quotation PDF over and over.
  //
  // So a file is also identified by what it is: the folder it lands in, the name
  // it came with, and its size. Scoped to this owner, because a seeded file is
  // cloned per person — a colleague's copy of the same document must not make
  // this person's copy look as though it were already here.
  //
  // Trash counts, deliberately. A copy the builder has thrown away is still a
  // copy, and handing back a document they went out of their way to bin is not
  // a favour.
  //
  // The trade this makes: two genuinely different documents that share a folder,
  // a name AND a byte count are treated as one, and only the first is copied.
  // Against a demo account that has none such, and a bug that multiplied every
  // unreferenced file by the number of syncs, that is the right way round.
  const contentKeyOf = (folderId, name, size) => `${folderId}|${name ?? ""}|${size ?? ""}`;

  const alreadyHere = await DriveFile.findAll({
    where: {
      company_id: targetCompanyId,
      folder_id: { [Op.in]: Object.values(folderMapping) },
      is_sample_data: true,
      sample_data_owner_id: targetUserId,
    },
    attributes: [
      "file_id", "folder_id", "original_name", "size",
      "reference_id", "reference_type", "sub_reference_id", "sub_reference_type",
      "deleted_at", "created_at",
    ],
    paranoid: false,
    transaction,
    raw: true,
  });

  // Which copy the repoint below lands on when an earlier run left several. A
  // live row beats a trashed one — that is the copy the record's gallery reads —
  // and among equals the oldest wins, which is the row migration
  // 20260818180000 keeps. Taking whichever came back last would repoint a copy
  // in Trash and leave the visible one naming a record that is gone.
  const takenContent = new Map();
  for (const row of alreadyHere) {
    const key = contentKeyOf(row.folder_id, row.original_name, row.size);
    const held = takenContent.get(key);
    if (!held) {
      takenContent.set(key, row);
      continue;
    }
    const heldTrashed = Boolean(held.deleted_at);
    const rowTrashed = Boolean(row.deleted_at);
    if (heldTrashed !== rowTrashed) {
      if (heldTrashed) takenContent.set(key, row);
      continue;
    }
    if (new Date(row.created_at || 0) < new Date(held.created_at || 0)) {
      takenContent.set(key, row);
    }
  }

  /**
   * Move an already-cloned document's polymorphic reference onto the record
   * this run mapped it to.
   *
   * Only ever tightens: a reference this run could not resolve is left alone
   * rather than nulled, because a stale pointer is still better than none, and
   * the run that CAN resolve it will correct it. A tuple another live row
   * already holds is refused — `drive_files_polymorphic_active_unique` would
   * reject it, and the file that holds it has the better claim.
   */
  const repointClone = async (row, next) => {
    if (!row.file_id) return;
    if (!next.referenceId || !next.referenceType) return;
    if (row.reference_id === next.referenceId && row.reference_type === next.referenceType) return;

    if (next.subReferenceType) {
      const tuple = `${next.referenceId}|${next.referenceType}|${next.subReferenceType}`;
      if (takenTuples.has(tuple)) return;
      takenTuples.add(tuple);
    }

    await DriveFile.update(
      {
        reference_id: next.referenceId,
        reference_type: next.referenceType,
        sub_reference_id: next.subReferenceId,
        sub_reference_type: next.subReferenceType,
        ...(next.leadId ? { lead_id: next.leadId } : {}),
      },
      // `paranoid: false`: the copy that is staying may be one the builder
      // binned, and Sequelize's default scope would silently skip it — leaving a
      // restored document naming a record that was thrown away two syncs ago.
      { where: { file_id: row.file_id }, paranoid: false, transaction },
    );

    row.reference_id = next.referenceId;
    row.reference_type = next.referenceType;
    row.sub_reference_id = next.subReferenceId;
    row.sub_reference_type = next.subReferenceType;
  };

  const batchNames = new Set();
  const payloads = [];
  let skippedDuplicate = 0;

  for (const source of sourceFiles) {
    if (!source.s3_key || skipSourceFileIds.has(source.file_id)) {
      skippedDuplicate += 1;
      continue;
    }

    const folderId = folderMapping[source.folder_id];
    if (!folderId) continue;

    const mappedReferenceId = source.reference_id ? idMapping[source.reference_id] || null : null;
    const keepsReference = Boolean(source.reference_id) === Boolean(mappedReferenceId);

    const referenceId = keepsReference ? mappedReferenceId : null;
    const referenceType = keepsReference ? source.reference_type : null;
    const subReferenceId = keepsReference && source.sub_reference_id
      ? idMapping[source.sub_reference_id] || null
      : null;
    const subReferenceType = keepsReference ? source.sub_reference_type : null;

    // `drive_files_polymorphic_active_unique` is partial on deleted_at IS NULL,
    // so a copy going straight to Trash cannot collide with anything and is not
    // checked against the tuples — checking it would drop the trashed copy of a
    // document the live one already claims, which is exactly the pair the demo
    // account is showing.
    const trashedAt = source.deleted_at || null;

    if (!trashedAt && referenceId && referenceType && subReferenceType) {
      const tuple = `${referenceId}|${referenceType}|${subReferenceType}`;
      if (takenTuples.has(tuple)) {
        skippedDuplicate += 1;
        continue;
      }
      takenTuples.add(tuple);
    }

    // The catch-all. Covers the rows the tuple check had nothing to say about,
    // and the source's own duplicates within this one batch.
    const identity = contentKeyOf(folderId, source.original_name, source.size);
    const alreadyCloned = takenContent.get(identity);
    if (alreadyCloned) {
      skippedDuplicate += 1;
      // Point the copy that is staying at whatever this run mapped its record
      // to. A sync rebuilds the job tree from scratch — the maintenance a site
      // photo hangs off is deleted and cloned afresh under a new id — so the
      // copy already here can be left naming a record that no longer exists.
      // Skipping without this would trade duplicated files in My Drive for a
      // maintenance whose photo gallery has quietly emptied, which is the same
      // bug wearing a different hat.
      await repointClone(alreadyCloned, {
        referenceId, referenceType, subReferenceId, subReferenceType,
        leadId: source.lead_id ? idMapping[source.lead_id] || null : null,
      });
      continue;
    }
    takenContent.set(identity, {
      file_id: null,
      reference_id: referenceId,
      reference_type: referenceType,
      sub_reference_id: subReferenceId,
      sub_reference_type: subReferenceType,
    });

    const fileId = randomUUID();
    // file_name is UNIQUE per company (migration 20260817170000), so the source
    // name has to be de-duplicated against this tenant's rows and this batch.
    // Before that key was scoped, every company after the first got the whole
    // demo file set renamed `-2`, `-3`, … against tenants it shares nothing with.
    const fileName = await ensureUniqueDriveFileName(source.file_name, {
      transaction,
      existingNames: batchNames,
      companyId: targetCompanyId,
    });
    batchNames.add(fileName);

    payloads.push({
      file_id: fileId,
      folder_id: folderId,
      company_id: targetCompanyId,
      builder_id: targetBuilderId,
      uploaded_by: targetUserId,
      lead_id: source.lead_id ? idMapping[source.lead_id] || null : null,
      reference_id: referenceId,
      reference_type: referenceType,
      sub_reference_id: subReferenceId,
      sub_reference_type: subReferenceType,
      original_name: source.original_name,
      file_name: fileName,
      s3_key: source.s3_key,
      thumbnail_s3_key: source.thumbnail_s3_key,
      thumbnail_status: source.thumbnail_status,
      file_extension: source.file_extension,
      mime_type: source.mime_type,
      size: source.size,
      is_starred: source.is_starred,
      sort_order: source.sort_order,
      // Keeps a trashed source in Trash on this side. bulkCreate writes the
      // column as given, so no restore/destroy round trip is needed.
      deleted_at: trashedAt,
      is_sample_data: true,
    });
  }

  await mapWithConcurrency(payloads, S3_COPY_CONCURRENCY, async (payload) => {
    const copiedKey = await copyS3Object(
      payload.s3_key,
      destinationKeyFor(payload.s3_key, payload.file_id),
    );
    payload.s3_key = copiedKey;

    if (copiedKey && payload.thumbnail_s3_key) {
      payload.thumbnail_s3_key = await copyS3Object(
        payload.thumbnail_s3_key,
        destinationKeyFor(payload.thumbnail_s3_key, payload.file_id),
      );
    }
  });

  const copied = payloads.filter((p) => p.s3_key);
  const skippedCopyFailed = payloads.length - copied.length;

  let created = 0;
  for (let i = 0; i < copied.length; i += INSERT_CHUNK) {
    const chunk = copied.slice(i, i + INSERT_CHUNK);
    try {
      // SAVEPOINT: a tuple a concurrent writer claimed in between rolls back to
      // here instead of poisoning the importer's transaction.
      await db.sequelize.transaction({ transaction }, (savepoint) =>
        DriveFile.bulkCreate(chunk, { transaction: savepoint }),
      );
      created += chunk.length;
    } catch (error) {
      if (error?.name !== "SequelizeUniqueConstraintError") throw error;
      for (const row of chunk) {
        try {
          await db.sequelize.transaction({ transaction }, (savepoint) =>
            DriveFile.create(row, { transaction: savepoint }),
          );
          created += 1;
        } catch (rowError) {
          if (rowError?.name !== "SequelizeUniqueConstraintError") throw rowError;
          skippedDuplicate += 1;
        }
      }
    }
  }

  return { created, skippedDuplicate, skippedCopyFailed };
}

/**
 * Drop the S Drive rows the importer created for this company.
 *
 * Files first, then folders deepest-first, so a parent never goes before its
 * children. A row still pinned by a foreign key (a seeded report a real
 * quotation now points at, a seeded folder holding a file the builder uploaded)
 * is skipped and reported rather than failing the whole purge — the same
 * contract the catalog purge uses.
 *
 * `ownerId` narrows this to one person's seeded rows — everyone under a company
 * shares its builder_id, so without it one user clearing their sample data took
 * their colleagues' demo documents with it. Null means the Company
 * Administrator's company-wide sweep.
 *
 * @returns {Promise<{removed:{driveFiles:number, driveFolders:number}, skipped:object[], s3Keys:string[]}>}
 *   `s3Keys` must be deleted from S3 by the caller once the transaction commits.
 */
export async function deleteSampleDriveData(companyId, builderId, ownerId, transaction) {
  const { Drive, DriveFile } = db.sequelize.models;
  const scope = {
    company_id: companyId,
    // The generated report buckets are company-level (builder_id NULL) — see
    // driveFolder.helper. Matching the builder strictly left every seeded one of
    // them behind, and the next import found them and had to make its own copy.
    ...(builderId ? { [Op.or]: [{ builder_id: builderId }, { builder_id: null }] } : {}),
    is_sample_data: true,
    ...(ownerId ? { sample_data_owner_id: ownerId } : {}),
  };

  const removed = { driveFiles: 0, driveFolders: 0 };
  const skipped = [];
  const s3Keys = [];

  const files = await DriveFile.findAll({
    where: scope,
    attributes: ["file_id", "original_name", "s3_key", "thumbnail_s3_key"],
    paranoid: false,
    transaction,
  });

  for (const file of files) {
    try {
      await db.sequelize.transaction({ transaction }, async (savepoint) => {
        await DriveFile.destroy({
          where: { file_id: file.file_id },
          force: true,
          transaction: savepoint,
        });
      });
      removed.driveFiles += 1;
      if (file.s3_key) s3Keys.push(file.s3_key);
      if (file.thumbnail_s3_key) s3Keys.push(file.thumbnail_s3_key);
    } catch (error) {
      skipped.push({
        type: "Drive file",
        name: file.original_name || file.file_id,
        reason: error?.parent?.detail || error?.message || "Still referenced by other records",
      });
    }
  }

  const folders = await Drive.findAll({
    where: scope,
    attributes: ["drive_id", "name", "parent_id"],
    paranoid: false,
    transaction,
  });

  // Deepest first: depth is how many hops the folder is from a root, walking
  // parent_id inside this set.
  const byId = new Map(folders.map((f) => [f.drive_id, f]));
  const depthOf = (folder) => {
    let depth = 0;
    let current = folder;
    while (current?.parent_id && byId.has(current.parent_id) && depth < 50) {
      current = byId.get(current.parent_id);
      depth += 1;
    }
    return depth;
  };
  const ordered = [...folders].sort((a, b) => depthOf(b) - depthOf(a));

  for (const folder of ordered) {
    // `paranoid: false` on both: dropping a folder cascades onto everything
    // filed under it, and something sitting in Trash is still something its
    // owner can restore. Counting only live rows would destroy it silently.
    const [liveFiles, liveChildren] = await Promise.all([
      DriveFile.count({ where: { folder_id: folder.drive_id }, paranoid: false, transaction }),
      Drive.count({ where: { parent_id: folder.drive_id }, paranoid: false, transaction }),
    ]);

    if (liveFiles > 0 || liveChildren > 0) {
      skipped.push({
        type: "Drive folder",
        name: folder.name,
        reason: "Still holds files or sub-folders that are not sample data",
      });
      continue;
    }

    try {
      await db.sequelize.transaction({ transaction }, async (savepoint) => {
        await Drive.destroy({
          where: { drive_id: folder.drive_id },
          force: true,
          transaction: savepoint,
        });
      });
      removed.driveFolders += 1;
    } catch (error) {
      skipped.push({
        type: "Drive folder",
        name: folder.name,
        reason: error?.parent?.detail || error?.message || "Still referenced by other records",
      });
    }
  }

  return { removed, skipped, s3Keys };
}
