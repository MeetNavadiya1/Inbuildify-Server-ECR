import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { getPDFTypeKey, getDocumentSourceTag, isPdfEditable, isPdfFile } from "../../utils/pdfEdit.js";
import {
  DOCUMENT_FORMATS,
  DOCUMENT_TYPE_OPTIONS,
  MANAGED_EXTENSIONS,
  describeDocumentEditability,
  describeDocumentType,
  editorDependsOnContent,
  extensionOf,
  getDocumentTypeKey,
  hasEditorSupport,
  isManagedDocument,
} from "../../utils/documentEdit.js";
import { getDocumentEditPolicy } from "../../helper/documentEditPermission.helper.js";
import { generatePresignedDownloadUrl } from "../../service/s3.service.js";
import {
  DRIVE_ACTIONS,
  describeAction,
  recordDriveActivity,
} from "../../helper/driveActivity.helper.js";
import logger from "../../utils/logger.js";

/**
 * The switch's three states, in the words the history shows and the entry each
 * one writes.
 *
 * `null` is not "off" — it is "nobody has ruled on this", which behaves as on.
 * An audit that flattened the two would claim an administrator made a decision
 * they never made, so it gets its own label and its own action.
 */
const EDITABLE_STATES = {
  null: {
    label: "Default (on)",
    action: DRIVE_ACTIONS.EDITABLE_RESET,
    details: "Cleared back to the default, which is on.",
  },
  true: {
    label: "On",
    action: DRIVE_ACTIONS.EDITABLE_ON,
    details: "Users with edit access to this document can change it again.",
  },
  false: {
    label: "Off",
    action: DRIVE_ACTIONS.EDITABLE_OFF,
    details:
      "Users can view and download this document but not edit it. The save endpoint refuses it too.",
  },
};

/** The state entry for a switch value, treating undefined as "not ruled on". */
const editableState = (value) => EDITABLE_STATES[String(value ?? null)] ?? EDITABLE_STATES.null;

/**
 * Admin → Document → Document Management.
 *
 * One screen listing every document the tenant holds — PDFs, workbooks and Word
 * documents, uploaded or generated — with the switch that decides whether users
 * may edit it. The switch writes `drive_files.document_editable`;
 * `isDocumentEditingAllowed` reads it back, so turning it off greys the editor
 * out in the UI *and* refuses the save endpoint. See
 * `documentEditPermission.helper.js`.
 */

/**
 * Rows the screen manages: PDF, Excel and Word, by mime type or by extension.
 *
 * Built from `MANAGED_EXTENSIONS` rather than written out, so adding a format to
 * the editor list adds it here too instead of leaving the two to drift.
 */
const DOCUMENT_WHERE = {
  [Op.or]: [
    ...MANAGED_EXTENSIONS.flatMap((extension) => [
      { file_extension: { [Op.iLike]: `.${extension}` } },
      { file_extension: { [Op.iLike]: extension } },
      { original_name: { [Op.iLike]: `%.${extension}` } },
    ]),
    { mime_type: { [Op.iLike]: "application/pdf" } },
    { mime_type: { [Op.iLike]: "application/msword" } },
    { mime_type: { [Op.iLike]: "application/vnd.ms-excel" } },
    { mime_type: { [Op.iLike]: "application/vnd.openxmlformats-officedocument.%" } },
    { mime_type: { [Op.iLike]: "application/vnd.ms-excel.sheet.%" } },
  ],
};

/**
 * Tenant scope, matching the Drive's own rule: a builder sees their rows plus
 * the ones stamped to no builder, because the generated-report buckets belong to
 * the company rather than to whichever lead triggered the first document.
 */
const tenantWhere = (companyId, builderId) => ({
  company_id: companyId,
  ...(builderId ? { [Op.or]: [{ builder_id: builderId }, { builder_id: null }] } : {}),
});

const SORTABLE = {
  name: "original_name",
  createdAt: "created_at",
  updatedAt: "updated_at",
  size: "size",
};

/**
 * Turn a filter on a *derived* property into SQL.
 *
 * A document's business type and its source are computed by `getPDFTypeKey`
 * from `reference_type` + `sub_reference_type`. Re-implementing that in SQL
 * would make another copy of a classifier the codebase already has three of, and
 * they would drift.
 *
 * Instead the distinct reference pairs actually present in the tenant are read
 * first — a handful of rows, all low-cardinality strings — each is classified
 * with the real function, and the pairs that match become the WHERE clause. The
 * classifier stays the single source of truth and paging still happens in the
 * database rather than over a fetched-everything array.
 */
const loadReferencePairs = async (scopeWhere) => {
  const { DriveFile } = db.sequelize.models;

  const rows = await DriveFile.findAll({
    where: scopeWhere,
    attributes: ["reference_type", "sub_reference_type"],
    group: ["reference_type", "sub_reference_type"],
    raw: true,
    paranoid: false,
  });

  return rows.map((row) => ({
    reference_type: row.reference_type ?? null,
    sub_reference_type: row.sub_reference_type ?? null,
    key: getPDFTypeKey(row),
    tag: getDocumentSourceTag(row),
  }));
};

/** `[{reference_type, sub_reference_type}]` → an OR of exact-match clauses. */
const pairsToWhere = (pairs) => {
  if (!pairs.length) {
    // Nothing can match. `Op.and: []` would match everything, so say it plainly.
    return { file_id: null };
  }
  return {
    [Op.or]: pairs.map((pair) => ({
      reference_type: pair.reference_type === null ? { [Op.is]: null } : pair.reference_type,
      sub_reference_type:
        pair.sub_reference_type === null ? { [Op.is]: null } : pair.sub_reference_type,
    })),
  };
};

/** An extension or format filter → the rows that carry it. */
const formatWhere = (extensions) => ({
  [Op.or]: extensions.flatMap((extension) => [
    { file_extension: { [Op.iLike]: `.${extension}` } },
    { file_extension: { [Op.iLike]: extension } },
    { original_name: { [Op.iLike]: `%.${extension}` } },
  ]),
});

/**
 * Every managed document in the tenant, filtered and paged for the admin table.
 *
 * @param {Object} user - req.user
 * @param {Object} filters - req.query, post-middleware: { search, format, extension, source, editable, status, page, limit, sort_by, sort_order }
 */
export const listDocumentsService = async (user, filters = {}) => {
  const { DriveFile, Users, Drive } = db.sequelize.models;
  const companyId = user?.company_id;
  const builderId = user?.builder_id;

  if (!companyId) {
    return { items: [], page: 1, limit: 0, total: 0, totalPages: 0, counts: emptyCounts() };
  }

  const { editablePdfTypes, blockedTypes } = await getDocumentEditPolicy(companyId);

  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  // Composed with Op.and, not spread. Both halves key their clause on Op.or —
  // the tenant's "this builder or none", the format list's "any of these
  // extensions" — so spreading them into one object silently dropped whichever
  // came first, and the builder narrowing went with it.
  const scopeWhere = { [Op.and]: [tenantWhere(companyId, builderId), DOCUMENT_WHERE] };
  const conditions = [scopeWhere];

  // Trashed documents stay listed but are shown as such: one in the bin can be
  // restored, and its permission should be settable before it comes back.
  const status = filters.status || "active";
  if (status === "active") {
    conditions.push({ deleted_at: { [Op.is]: null } });
  } else if (status === "trashed") {
    conditions.push({ deleted_at: { [Op.not]: null } });
  }

  const search = (filters.search || "").trim();
  if (search) {
    conditions.push({
      [Op.or]: [
        { original_name: { [Op.iLike]: `%${search}%` } },
        { file_name: { [Op.iLike]: `%${search}%` } },
      ],
    });
  }

  // Format ("all spreadsheets") and extension (".xlsx only") are both offered —
  // the first is what an admin usually means, the second is there when they mean
  // one file type exactly.
  if (filters.extension && MANAGED_EXTENSIONS.includes(filters.extension)) {
    conditions.push(formatWhere([filters.extension]));
  } else if (filters.format && filters.format !== "all") {
    const extensions = MANAGED_EXTENSIONS.filter(
      (extension) => DOCUMENT_FORMATS[extension].format === filters.format,
    );
    conditions.push(extensions.length ? formatWhere(extensions) : { file_id: null });
  }

  const pairs = await loadReferencePairs(scopeWhere);

  if (filters.source === "generated" || filters.source === "uploaded") {
    conditions.push(pairsToWhere(pairs.filter((pair) => pair.tag === filters.source)));
  }

  // Editing is on unless an administrator switched it off, so "on" is
  // "not FALSE" — which has to include the NULL of every document nobody has
  // ruled on. `{ [Op.not]: false }` would drop those, NULL comparing to neither.
  const editableFilter = normalizeBoolean(filters.editable);
  if (editableFilter === true) {
    conditions.push({
      [Op.or]: [{ document_editable: true }, { document_editable: { [Op.is]: null } }],
    });
  } else if (editableFilter === false) {
    conditions.push({ document_editable: false });
  }

  // snake_case: `camelToSnakeMiddleware` has already rewritten the query keys by
  // the time the service sees them. The *values* are untouched, so the sort
  // target is still the camelCase name the SORTABLE map is keyed by.
  const sortColumn = SORTABLE[filters.sort_by] || "created_at";
  const sortOrder =
    String(filters.sort_order || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

  const { rows, count } = await DriveFile.findAndCountAll({
    where: { [Op.and]: conditions },
    include: [
      { model: Users, as: "uploadedByUser", attributes: ["users_id", "name"], required: false },
      { model: Drive, as: "folder", attributes: ["drive_id", "name"], required: false },
    ],
    order: [[sortColumn, sortOrder]],
    limit,
    offset,
    // Needed so `status: "trashed"`/"all" can see soft-deleted rows at all.
    paranoid: false,
    distinct: true,
  });

  const counts = await countDocuments(scopeWhere);

  return {
    items: rows.map((row) => serializeDocument(row, editablePdfTypes, blockedTypes)),
    page,
    limit,
    total: count,
    totalPages: Math.ceil(count / limit) || 0,
    counts,
  };
};

const emptyCounts = () => ({ total: 0, editable: 0, locked: 0, pdf: 0, spreadsheet: 0, word: 0 });

/** Headline numbers for the screen, counted in the database. */
const countDocuments = async (scopeWhere) => {
  const { DriveFile } = db.sequelize.models;
  const activeWhere = { [Op.and]: [scopeWhere, { deleted_at: { [Op.is]: null } }] };

  const byFormat = (format) => {
    const extensions = MANAGED_EXTENSIONS.filter(
      (extension) => DOCUMENT_FORMATS[extension].format === format,
    );
    return { [Op.and]: [activeWhere, formatWhere(extensions)] };
  };

  const [total, locked, pdf, spreadsheet, word] = await Promise.all([
    DriveFile.count({ where: activeWhere }),
    DriveFile.count({ where: { [Op.and]: [activeWhere, { document_editable: false }] } }),
    DriveFile.count({ where: byFormat("pdf") }),
    DriveFile.count({ where: byFormat("spreadsheet") }),
    DriveFile.count({ where: byFormat("word") }),
  ]);

  return { total, editable: total - locked, locked, pdf, spreadsheet, word };
};

/** "true"/"false"/true/false → boolean; anything else (incl. "all") → null. */
const normalizeBoolean = (value) => {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return null;
};

const serializeDocument = (row, editablePdfTypes, blockedTypes = []) => {
  const plain = typeof row.get === "function" ? row.get({ plain: true }) : row;
  const { editable, source } = describeDocumentEditability(plain, blockedTypes);
  const type = describeDocumentType(plain);
  const documentTypeKey = getDocumentTypeKey(plain);

  return {
    file_id: plain.file_id,
    name: plain.original_name,
    file_name: plain.file_name,
    folder_id: plain.folder_id,
    folder_name: plain.folder?.name || null,
    mime_type: plain.mime_type,
    extension: extensionOf(plain),
    // "pdf" | "spreadsheet" | "word", and the label to print.
    format: type?.format || null,
    format_label: type?.label || null,
    size: plain.size === null || plain.size === undefined ? null : Number(plain.size),
    // Whether the application produced this document or somebody uploaded it.
    source: getDocumentSourceTag(plain),
    pdf_type_key: getPDFTypeKey(plain),
    reference_type: plain.reference_type,
    sub_reference_type: plain.sub_reference_type,
    status: plain.deleted_at ? "trashed" : "active",
    is_sample_data: Boolean(plain.is_sample_data),
    // Last person to write the file's content — re-stamped on every new version,
    // so it names the owner/creator as far as the Drive knows one.
    owner_name: plain.uploadedByUser?.name || null,
    created_at: plain.created_at,
    updated_at: plain.updated_at,
    // The switch, and whether it reads that way because somebody set it or
    // because nobody has: "ON (default)" and "ON (set by an admin)" are the same
    // permission but not the same fact, and the column says which.
    is_editable: editable,
    editable_source: source,
    document_editable: plain.document_editable ?? null,
    document_editable_updated_at: plain.document_editable_updated_at || null,
    // Whether an in-app editor exists for this format at all. A locked document
    // and one nothing can open are both read-only for different reasons, and the
    // screen has to be able to say which.
    editor_supported: hasEditorSupport(plain),
    // ...and for .xls/.doc, whether that promise depends on what the file turns
    // out to be. The extension does not distinguish a true pre-2007 binary from
    // an OOXML file that was simply renamed, so the screen says so rather than
    // guessing.
    editor_depends_on_content: editorDependsOnContent(plain),
    // Whether this document ALSO offers the edit-the-record form, governed
    // separately by Admin → General → Editable PDF Configuration.
    //
    // PDFs only. `isPdfEditable` answers "true" for anything that is not a PDF —
    // its way of saying the question does not apply — and reporting that here
    // would claim a Word document offers a form that exists only for generated
    // PDFs.
    // A ternary, not `&&`: isPdfFile returns the operand it stopped on rather
    // than a boolean, so `&&` would put a null in a field the client reads as
    // yes/no.
    record_editable: isPdfFile(plain)
      ? isPdfEditable(plain, editablePdfTypes, blockedTypes)
      : false,
    // Which reference type this document belongs to, and whether that whole type
    // is turned off. Without it the screen can show a row as read-only but not
    // say why, and the administrator looks for a per-file switch that is not the
    // thing holding it.
    document_type_key: documentTypeKey,
    document_type_label:
      DOCUMENT_TYPE_OPTIONS.find((option) => option.key === documentTypeKey)?.label || null,
    type_editing_blocked: Array.isArray(blockedTypes) && blockedTypes.includes(documentTypeKey),
  };
};

/** One document's full detail, for the drawer, plus a link to view or download it. */
export const getDocumentDetailService = async (user, fileId) => {
  const { DriveFile, Users, Drive } = db.sequelize.models;

  const file = await DriveFile.findOne({
    where: { file_id: fileId, ...tenantWhere(user?.company_id, user?.builder_id) },
    include: [
      { model: Users, as: "uploadedByUser", attributes: ["users_id", "name"], required: false },
      { model: Drive, as: "folder", attributes: ["drive_id", "name"], required: false },
    ],
    paranoid: false,
  });

  if (!file) {
    const error = new Error("Document not found.");
    error.statusCode = 404;
    throw error;
  }

  const { editablePdfTypes, blockedTypes } = await getDocumentEditPolicy(user?.company_id);
  const detail = serializeDocument(file, editablePdfTypes, blockedTypes);

  // Short-lived signed links, so Preview and Download work from the admin screen
  // without exposing the bucket or a permanent URL.
  //
  // Two of them, because the two actions want opposite things from the same
  // object. `url` is inline: the viewer fetches it, and a PDF opened with it
  // renders instead of landing in the downloads folder. `download_url` carries
  // Content-Disposition, so Download saves the file under the name the user
  // knows it by. One link could not do both — a browser will not be talked out
  // of an attachment header, and `<a download>` is ignored cross-origin, which
  // is why Download here used to merely display a PDF.
  const sign = async (downloadFilename) => {
    try {
      const result = await generatePresignedDownloadUrl(file.s3_key, undefined, downloadFilename);
      return typeof result === "string" ? result : result?.url || null;
    } catch (error) {
      logger.error("[document-management] could not sign a download URL:", error);
      return null;
    }
  };

  const [url, downloadUrl] = await Promise.all([
    sign(undefined),
    sign(file.original_name || file.file_name || undefined),
  ]);

  return { ...detail, url, download_url: downloadUrl };
};

/**
 * Turn editing on or off for one document.
 *
 * `null` is accepted as well as true/false — it clears the row back to "nobody
 * has ruled on this", which reads as ON like every untouched document. The
 * screen only ever sends true/false; null exists so a mistaken lock can be
 * undone without leaving a decision behind that nobody made.
 */
export const setDocumentEditableService = async (user, fileId, editable) => {
  const { DriveFile, Users, Drive } = db.sequelize.models;
  const companyId = user?.company_id;

  const file = await DriveFile.findOne({
    where: { file_id: fileId, ...tenantWhere(companyId, user?.builder_id) },
    paranoid: false,
  });

  if (!file) {
    const error = new Error("Document not found.");
    error.statusCode = 404;
    throw error;
  }

  // Refuse formats the screen does not manage — storing a permission on a photo
  // would imply a restriction the screen never shows and nobody can lift.
  if (!isManagedDocument(file)) {
    const error = new Error("Editing permission applies to PDF, Excel and Word documents only.");
    error.statusCode = 400;
    throw error;
  }

  // Read the old value before the write — this is the one action on this screen
  // that changes what other people may do, and "it used to be on" is the whole
  // question when somebody asks why they can no longer edit a contract.
  const previous = file.document_editable;

  await file.update({
    document_editable: editable,
    document_editable_updated_by: editable === null ? null : user?.users_id || null,
    document_editable_updated_at: editable === null ? null : new Date(),
  });

  // Only the switch itself is a permission change worth an entry; setting it to
  // what it already was is not, and would bury the real decisions.
  if (previous !== editable) {
    const next = editableState(editable);
    await recordDriveActivity({
      companyId,
      actor: user,
      action: next.action,
      entityId: file.file_id,
      entityName: file.original_name,
      oldValue: editableState(previous).label,
      newValue: next.label,
      details: next.details,
    });
  }

  const { editablePdfTypes, blockedTypes } = await getDocumentEditPolicy(companyId);
  const fresh = await DriveFile.findOne({
    where: { file_id: fileId },
    include: [
      { model: Users, as: "uploadedByUser", attributes: ["users_id", "name"], required: false },
      { model: Drive, as: "folder", attributes: ["drive_id", "name"], required: false },
    ],
    paranoid: false,
  });

  return serializeDocument(fresh, editablePdfTypes, blockedTypes);
};

/**
 * One document's activity history, newest first.
 *
 * Answers the questions an audit gets asked — who, what, from what to what,
 * when, and under which role — for every change the system records against this
 * file: uploads, content saves, conversions, renames, moves, trash and restore,
 * and an administrator's editing switch.
 *
 * Reads through the same tenant guard as the detail endpoint rather than
 * querying the log directly: an activity row names a user and what they did, and
 * that is not something to hand out for a file the caller cannot otherwise see.
 *
 * The role shown is the one the actor held *at the time* where the row recorded
 * it, and falls back to their current role for rows written before the audit
 * columns existed — flagged as such, so nobody reads a present-day role as a
 * historical fact.
 */
export const getDocumentActivityService = async (user, fileId, { limit = 100, offset = 0 } = {}) => {
  const { DriveFile, DriveActivityLog, Users } = db.sequelize.models;

  const file = await DriveFile.findOne({
    where: { file_id: fileId, ...tenantWhere(user?.company_id, user?.builder_id) },
    attributes: ["file_id", "company_id", "original_name"],
    paranoid: false,
  });

  if (!file) {
    const error = new Error("Document not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!DriveActivityLog) return { items: [], total: 0, limit, offset };

  const { rows, count } = await DriveActivityLog.findAndCountAll({
    where: { entity_id: fileId, company_id: file.company_id },
    include: [
      {
        model: Users,
        as: "actor",
        attributes: ["users_id", "name", "email", "role_id"],
        required: false,
        include: [{ association: "role", attributes: ["role_id", "name"], required: false }],
      },
    ],
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  const items = rows.map((row) => {
    const plain = row.get({ plain: true });
    const recordedRole = plain.actor_role;
    const currentRole = plain.actor?.role?.name || null;

    return {
      log_id: plain.log_id,
      ...describeAction(plain.action),
      // "Someone" rather than "Unknown": a null user_id is a system action (a
      // scheduled purge, a seeded row), not a mystery.
      actor_name: plain.actor?.name || (plain.user_id ? "A removed user" : "System"),
      actor_id: plain.user_id,
      actor_role: recordedRole || currentRole,
      // The audit columns are newer than the table. Without this flag a role
      // filled in from the user's record today would read as what they held
      // when they acted, which is exactly the claim an audit must not make.
      actor_role_is_current: !recordedRole && Boolean(currentRole),
      old_value: plain.old_value,
      new_value: plain.new_value,
      details: plain.details,
      entity_name: plain.entity_name,
      created_at: plain.created_at,
    };
  });

  return { items, total: count, limit, offset };
};

export default {
  listDocumentsService,
  getDocumentDetailService,
  setDocumentEditableService,
  getDocumentActivityService,
};
