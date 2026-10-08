import { Op } from "sequelize";
import db from "../config/database/models/postgre-models/index.js";
import { DRIVE_FILE_MAPPING } from "../constants/driveFile.js";

/**
 * The one place a `drive` folder row is looked up or created.
 *
 * Every report helper used to carry its own `Drive.findOrCreate` on
 * (name, parent_id, company_id, builder_id), and the sample-data clone carried a
 * fifth with a slightly different `where`. Nothing in the database enforced that
 * key, and `findOrCreate` is only atomic when a unique constraint backs it — so
 * the same folder was created over and over:
 *
 *   • two writers at once (a colour PDF and a compaction PDF for the same
 *     company, the sample-data import running its passes) each SELECT inside
 *     their own transaction, neither sees the other's uncommitted INSERT, and
 *     both insert. This is the pair of rows with the same timestamp.
 *   • a folder sitting in Trash is invisible to a paranoid find, so the next
 *     write creates a live twin beside it and the account ends up with both.
 *   • the report helpers stamped `builder_id` from whichever lead happened to
 *     trigger the first PDF, while the importer stamped the target account's —
 *     so the same bucket existed once per builder, and a Company Administrator
 *     (no builder_id, so no builder filter on the listing) saw every copy.
 *
 * This resolver fixes all three: it locks on the folder's identity before it
 * looks, reuses a trashed row instead of twinning it, and treats the generated
 * report buckets as company-level. The partial unique index added in migration
 * 20260811120000 is the actual guarantee — the lock only avoids most conflicts,
 * and a lost race falls back to re-reading the winner.
 */

/**
 * The buckets the report helpers create on demand (Colour Selection Reports,
 * Compaction Reports, …). They describe a kind of document, not a builder's
 * workspace, so they are stamped company-level (builder_id NULL) and shared —
 * `driveTenantWhere` is what keeps them visible to builder-scoped users.
 */
export const SYSTEM_FOLDER_NAMES = new Set(Object.values(DRIVE_FILE_MAPPING.FOLDERS));

/** Stands in for NULL when building the lock key — NULLs are not comparable. */
const NIL = "00000000-0000-0000-0000-000000000000";

/** Folder names are stored trimmed and compared case-insensitively. */
export const normalizeFolderName = (name) => String(name ?? "").trim();

/**
 * Whether this folder belongs to the company rather than to one builder.
 * Only the generated buckets at the drive root qualify — an entity's Documents
 * tree (reference_id set) and anything a user made keep the builder they were
 * created under.
 */
export const isSystemFolder = (name, { parentId = null, referenceId = null } = {}) =>
  !parentId && !referenceId && SYSTEM_FOLDER_NAMES.has(normalizeFolderName(name));

/**
 * `isSystemFolder` for a Drive row rather than loose arguments — the report
 * buckets at the drive root, which the report helpers file PDFs into by name.
 *
 * A folder in an entity's Documents tree is deliberately NOT one of these: the
 * job and lead trees are built from real Drive rows that people create and
 * upload into (getJobDocuments marks every one of them `isSystem: false`), and
 * the buckets shown alongside them there — Quotation, Variations, Compaction
 * Report — are computed per request and have no row at all.
 *
 * Ancestors are not consulted here; `findSystemFolderAncestor` and the in-memory
 * walk in the move-targets listing are what apply this down a chain.
 */
export const isSystemFolderRow = (folder) =>
  isSystemFolder(folder?.name, {
    parentId: folder?.parent_id,
    referenceId: folder?.reference_id,
  });

/**
 * The first system folder on a folder's chain — itself, or the bucket it sits
 * inside — or null when a user made every folder from here to the drive root.
 *
 * The chain is walked rather than the folder alone because being system-owned is
 * inherited: a folder somebody created inside "Compaction Reports" is still part
 * of that bucket, and a document filed there is still one the app maintains.
 *
 * @param {?string} folderId  null (the drive root) is never system-owned
 * @param {?string} companyId tenant bound; a folder outside it reads as absent
 * @returns {Promise<null|object>} the offending Drive row, so a caller can name
 *          it in the message it shows.
 */
export async function findSystemFolderAncestor(folderId, companyId) {
  const { Drive } = db.sequelize.models;

  let currentId = folderId;
  // The same depth guard the permission resolver uses; a parent cycle would
  // otherwise spin here.
  for (let depth = 0; currentId && depth < 50; depth += 1) {
    const folder = await Drive.findOne({
      where: { drive_id: currentId, ...(companyId ? { company_id: companyId } : {}) },
      attributes: ["drive_id", "name", "parent_id", "reference_id"],
      paranoid: false,
    });
    if (!folder) {
      return null;
    }
    if (isSystemFolderRow(folder)) {
      return folder;
    }
    currentId = folder.parent_id;
  }
  return null;
}

/**
 * The identity two rows must share to be the same folder.
 *
 * Field for field, this is `drive_folder_active_unique` (migration
 * 20260811120000) — and it has to stay that way. The importer briefly added
 * `sample_data_owner_id` here so each person could hold their own seeded copy,
 * the way the Settings masters do. The index was never widened to match, so the
 * second person to import into a company looked for a folder under their own id,
 * found nothing, inserted, and hit the company-wide key on a bucket a colleague's
 * import (or a report helper, which stamps no owner at all) had already created:
 *
 *   Validation error [23505] table=drive constraint=drive_folder_active_unique
 *
 * The recovery below re-reads through the same owner-scoped filter, so it missed
 * the winner too and rethrew — taking the whole import transaction with it.
 *
 * Widening the index was the wrong way to settle it. The folder tree is company
 * infrastructure, not seeded content: the report helpers file real quotation and
 * compaction PDFs into these same buckets, so a bucket owned by one person would
 * put a colleague's genuine documents somewhere they cannot see. One folder per
 * name per place, attributed to whoever imported first, is what the rest of the
 * S Drive already assumes — see `cloneDriveFolders` and `OWNER_SCOPED_MODELS`.
 */
const identityOf = ({ name, parentId, companyId, builderId, referenceId, referenceType }) => ({
  company_id: companyId ?? null,
  builder_id: builderId ?? null,
  parent_id: parentId ?? null,
  reference_id: referenceId ?? null,
  reference_type: referenceType ?? null,
  name: normalizeFolderName(name),
});

/** The advisory-lock key for an identity — must match it field for field. */
const lockKeyOf = (identity) =>
  [
    identity.company_id ?? NIL,
    identity.builder_id ?? NIL,
    identity.parent_id ?? NIL,
    identity.reference_id ?? NIL,
    identity.reference_type ?? "",
    identity.name.toLowerCase(),
  ].join("|");

/**
 * Every row matching an identity, trashed ones included, live first and oldest
 * first. `paranoid: false` is the point: a bucket in Trash is still that bucket,
 * and skipping it is what produced the twin.
 */
async function findFolders(identity, transaction) {
  const { Drive } = db.sequelize.models;
  const { sequelize } = db;
  const { name, ...columns } = identity;

  const rows = await Drive.findAll({
    where: {
      ...columns,
      [Op.and]: [
        sequelize.where(
          sequelize.fn("lower", sequelize.fn("btrim", sequelize.col("name"))),
          name.toLowerCase(),
        ),
      ],
    },
    paranoid: false,
    transaction,
  });

  return rows.sort((a, b) => {
    const trashed = Number(Boolean(a.deleted_at)) - Number(Boolean(b.deleted_at));
    if (trashed !== 0) {
      return trashed;
    }
    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
  });
}

/**
 * Resolve a drive folder, creating it only when it genuinely does not exist.
 *
 * @param {object}  args
 * @param {string}  args.name            folder name; trimmed before storing
 * @param {?string} args.parentId        parent folder, NULL at the drive root
 * @param {?string} args.companyId
 * @param {?string} args.builderId       ignored for system buckets, see above
 * @param {?string} args.referenceId     entity the folder belongs to, if any
 * @param {?string} args.referenceType
 * @param {?string} args.createdBy       stamped on creation only
 * @param {object}  args.defaults        extra columns applied on creation only
 * @param {boolean} args.restoreTrashed  pull a matching folder out of Trash
 *   rather than leaving it there (default). The sample-data clone passes false
 *   when its source folder is itself trashed — that copy is meant to stay in
 *   Trash, and restoring it would put a demo folder in someone's My Drive.
 * @param {?object} args.transaction
 * @returns {Promise<object>} the Drive instance
 */
export async function findOrCreateDriveFolder({
  name,
  parentId = null,
  companyId = null,
  builderId = null,
  referenceId = null,
  referenceType = null,
  createdBy = null,
  defaults = {},
  restoreTrashed = true,
  transaction = null,
}) {
  const { Drive } = db.sequelize.models;

  const folderName = normalizeFolderName(name);
  if (!folderName) {
    throw new Error("findOrCreateDriveFolder: name is required");
  }

  const identity = identityOf({
    name: folderName,
    parentId,
    companyId,
    // A generated bucket belongs to the company; anything else keeps its builder.
    builderId: isSystemFolder(folderName, { parentId, referenceId }) ? null : builderId,
    referenceId,
    referenceType,
  });

  const localTransaction = !transaction ? await db.sequelize.transaction() : null;
  const t = transaction || localTransaction;

  try {
    // Serialize writers against this identity. `SELECT ... FOR UPDATE` cannot
    // lock a row that does not exist yet, so this is a transaction-scoped
    // advisory lock keyed by the identity instead: the second writer blocks
    // here until the first commits, then finds the row below.
    await db.sequelize.query(
      "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
      { replacements: { key: lockKeyOf(identity) }, transaction: t },
    );

    const reuse = async () => {
      const [found] = await findFolders(identity, t);
      if (found?.deleted_at && restoreTrashed) {
        await found.restore({ transaction: t });
      }
      return found || null;
    };

    let folder = await reuse();

    if (!folder) {
      try {
        // SAVEPOINT: if a writer outside this helper won the race, the unique
        // index rejects our INSERT and only the savepoint rolls back, leaving
        // the caller's transaction usable so we can re-read the winner.
        folder = await db.sequelize.transaction({ transaction: t }, (savepoint) =>
          Drive.create(
            {
              created_by: createdBy,
              updated_by: createdBy,
              // Identity last: `defaults` carries presentation (is_starred,
              // sort_order, deleted_at), never the tenant or the name. A caller
              // spreading a source row in cannot redirect the folder it just
              // asked for — which is how the clone paths went wrong before.
              ...defaults,
              ...identity,
            },
            { transaction: savepoint },
          ),
        );
      } catch (error) {
        if (error?.name !== "SequelizeUniqueConstraintError") {
          throw error;
        }
        folder = await reuse();
        if (!folder) {
          throw error;
        }
      }
    }

    if (localTransaction) {
      await localTransaction.commit();
    }
    return folder;
  } catch (error) {
    if (localTransaction) {
      await localTransaction.rollback();
    }
    throw error;
  }
}

export default findOrCreateDriveFolder;
