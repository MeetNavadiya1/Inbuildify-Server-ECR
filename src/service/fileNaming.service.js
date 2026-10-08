import { Op } from "sequelize";
import db from "../config/database/models/postgre-models/index.js";
import { runAcrossAllSampleDataOwners } from "../config/database/models/postgre-models/sampleDataFlag.js";
import {
  DEFAULT_FILE_NAME_FORMAT,
  FILE_NAME_TOKENS,
  FILE_TYPE_LABELS,
  FILE_TYPE_BY_SUB_REFERENCE,
  MAX_FILE_NAME_LENGTH,
} from "../constants/fileNaming.js";

/**
 * FileNamingService — the single place that turns an administrator-configured
 * naming format into a concrete file name.
 *
 * The format lives in `document_file_naming_format.naming_format`, scoped by
 * builder/company (Admin → Integration → File Naming). Every upload path in the
 * application reads it through this service before writing to S3, so a change in
 * the admin screen immediately governs every new photo, PDF, document, contract,
 * invoice and report.
 *
 * Layers, from pure to stateful:
 *   generateFileName(format, data, extension)  — pure, synchronous, testable
 *   getNamingFormat({ companyId, builderId })  — cached DB read of the format
 *   resolveNamingData({ …ids })                — fills tokens from the DB
 *   buildFileName(...) / buildStorageKey(...)  — the one-stop async entry points
 */

// ─── Token plumbing ──────────────────────────────────────────────────────────

// Tokens are matched loosely: "[Full Name]", "[full name]" and "[FullName]" all
// resolve to the same value, so an admin typing the token by hand still works.
const TOKEN_PATTERN = /\[([^\]]*)\]/g;

const normalizeTokenKey = (raw) => String(raw).toLowerCase().replace(/[^a-z0-9]/g, "");

// Each resolver reads both camelCase and snake_case so callers can hand over a
// payload in whichever convention their layer already uses.
const TOKEN_RESOLVERS = {
  fullname: (data) => data.fullName ?? data.full_name,
  address: (data) => data.address,
  referencenumber: (data) => data.referenceNumber ?? data.reference_number,
  createddate: (data) => data.createdDate ?? data.created_date,
  filetype: (data) => data.fileType ?? data.file_type,
};

// Canonical spelling of every token, keyed by its normalized form. Used to echo
// a token back to the administrator the way the Insert Personalization menu
// writes it, whatever casing or spacing they actually typed.
const CANONICAL_TOKENS = {
  fullname: FILE_NAME_TOKENS.FULL_NAME,
  address: FILE_NAME_TOKENS.ADDRESS,
  referencenumber: FILE_NAME_TOKENS.REFERENCE_NUMBER,
  createddate: FILE_NAME_TOKENS.CREATED_DATE,
  filetype: FILE_NAME_TOKENS.FILE_TYPE,
};

const TOKEN_LIST = Object.values(CANONICAL_TOKENS).join(", ");

/**
 * Validate an administrator-entered naming format.
 *
 * Enforced at save time only — `generateFileName` stays deliberately lenient so
 * formats stored before this validation existed still render instead of
 * breaking every upload for that builder.
 *
 * Rules:
 *   1. at least one token, so filenames actually differ from each other
 *   2. every `[...]` must be a real token, with balanced brackets
 *   3. no token used twice
 *   4. text between tokens limited to letters, digits, space, hyphen, underscore
 *
 * Token order is entirely up to the administrator — `[FileType]` included.
 *
 * @returns {{ valid: true, tokens: string[] }|{ valid: false, error: string }}
 */
export function validateNamingFormat(rawFormat) {
  const format = String(rawFormat ?? "").trim();

  if (!format) return { valid: false, error: "Naming format is required." };
  if (format.length > 255) {
    return { valid: false, error: "Naming format must be 255 characters or fewer." };
  }

  const tokens = [];
  let literals = "";

  for (let i = 0; i < format.length;) {
    const char = format[i];

    if (char === "]") {
      return { valid: false, error: "Unmatched \"]\". Every token must be written like [Full Name]." };
    }

    if (char === "[") {
      const close = format.indexOf("]", i + 1);
      if (close === -1) {
        return { valid: false, error: "Unclosed \"[\". Every token must be written like [Full Name]." };
      }

      const inner = format.slice(i + 1, close);
      if (inner.includes("[")) {
        return { valid: false, error: `"[${inner}]" is missing a "]" — tokens cannot be nested.` };
      }

      const canonical = CANONICAL_TOKENS[normalizeTokenKey(inner)];
      if (!canonical) {
        return { valid: false, error: `"[${inner}]" is not a personalization token. Available tokens: ${TOKEN_LIST}.` };
      }
      if (tokens.includes(canonical)) {
        return { valid: false, error: `${canonical} is used more than once. Each token can be used only once.` };
      }

      tokens.push(canonical);
      i = close + 1;
      continue;
    }

    literals += char;
    i += 1;
  }

  if (!tokens.length) {
    return { valid: false, error: `Add at least one personalization token, for example ${FILE_NAME_TOKENS.REFERENCE_NUMBER}.` };
  }

  const badChar = literals.match(/[^A-Za-z0-9 \-_]/);
  if (badChar) {
    return {
      valid: false,
      error: `"${badChar[0]}" is not allowed. Only letters, numbers, spaces, hyphens and underscores can separate tokens.`,
    };
  }

  return { valid: true, tokens };
}

/** `YYYY-MM-DD` in local time — stable and sortable inside a file name. */
export function formatNamingDate(value) {
  if (value instanceof Date) return formatDateParts(value);
  const date = value ? new Date(value) : new Date();
  return formatDateParts(date);
}

function formatDateParts(date) {
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Strip everything the admin screen forbids (`~ | @ # $ % ^ & * ( ) ; / < > ? ,
 * [ ] { } ' "` and the Windows-reserved `\ : *`), then collapse whitespace into
 * underscores. Disallowed characters become a space rather than being deleted so
 * "St.Kilda" reads as "St_Kilda", not "StKilda".
 */
export function sanitizeFileNameSegment(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/[^A-Za-z0-9 \-_]/g, " ")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[-_]{2,}/g, (run) => run[0])
    .replace(/^[-_]+|[-_]+$/g, "");
}

/** Normalize an extension to a leading-dot, character-safe form (or ""). */
export function normalizeExtension(extension) {
  if (!extension) return "";
  const cleaned = String(extension).trim().replace(/^\.+/, "").replace(/[^A-Za-z0-9]/g, "");
  return cleaned ? `.${cleaned}` : "";
}

/** Extension of an original upload name, e.g. "site plan.PDF" → ".PDF". */
export function extensionOf(originalName) {
  if (!originalName) return "";
  const dot = String(originalName).lastIndexOf(".");
  return dot > 0 ? normalizeExtension(String(originalName).slice(dot + 1)) : "";
}

/** `[FileType]` label: an explicit caller label wins, otherwise derive from MIME. */
export function resolveFileTypeLabel({ fileType, mimeType, originalName } = {}) {
  if (fileType) return fileType;

  const mime = String(mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return FILE_TYPE_LABELS.PHOTO;
  if (mime === "application/pdf") return FILE_TYPE_LABELS.PDF;
  if (mime.startsWith("video/")) return FILE_TYPE_LABELS.VIDEO;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv") {
    return FILE_TYPE_LABELS.SPREADSHEET;
  }
  if (mime.includes("word") || mime.startsWith("text/") || mime.includes("document")) {
    return FILE_TYPE_LABELS.DOCUMENT;
  }

  const ext = extensionOf(originalName).replace(".", "").toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext)) return FILE_TYPE_LABELS.PHOTO;
  if (ext === "pdf") return FILE_TYPE_LABELS.PDF;
  if (["doc", "docx", "txt", "rtf"].includes(ext)) return FILE_TYPE_LABELS.DOCUMENT;
  if (["xls", "xlsx", "csv"].includes(ext)) return FILE_TYPE_LABELS.SPREADSHEET;

  return FILE_TYPE_LABELS.FILE;
}

// Every multer uploader already declares a semantic S3 folder ("facade",
// "compaction_report", "job-invoices"), so the folder names the document type —
// which is what `[FileType]` should say. Without this the token fell back to the
// MIME type and a facade image was called "Photo".
//
// Only irregular folders need an entry; the rest are title-cased. `null` means
// the folder is too generic to be a type, so MIME detection still applies.
const FILE_TYPE_BY_FOLDER = {
  uploads: null,
  documents: null,
  pdfs: null,
  // The generic Drive tree — "drive/<company>/<uuid>/<name>" says nothing about
  // what the file is, so MIME detection has to decide.
  drive: null,
  "floor-plans": "Floor Plan",
  "quotation-reports": "Quotation",
  "quotation-structure-engineer-reports": "Structure Engineer Report",
  "quotation-custom-section": "Quotation Section",
  "job-invoices": "Invoice",
  "job-invoice-receipts": "Receipt",
  "job-variation": "Variation",
  "job-color-column-section": "Colour",
  "estate-document-image": "Estate Document",
  "estate-stage-attachments": "Estate Stage",
  "house-land-package-attachments": "House Land Package",
  "builder-logo": "Logo",
  "users/photo": "Profile Photo",
  "users/signature": "Signature",
  "pdf-template-assets": "Template Asset",
  "scheduler-email": "Scheduler Email",
  workflow_process: "Workflow Process",
  compaction_report: "Compaction Report",
};

/** "estate-document" → "Estate Document"; nested folders use the last segment. */
const titleCaseFolder = (folder) =>
  String(folder)
    .split("/")
    .pop()
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

/**
 * `[FileType]` label implied by an uploader's S3 folder, or undefined when the
 * folder is too generic to mean anything (then MIME detection takes over).
 */
export function fileTypeForFolder(folderName) {
  if (!folderName) return undefined;
  if (Object.prototype.hasOwnProperty.call(FILE_TYPE_BY_FOLDER, folderName)) {
    return FILE_TYPE_BY_FOLDER[folderName] || undefined;
  }
  return titleCaseFolder(folderName) || undefined;
}

/**
 * Same idea, but starting from a stored S3 key rather than the folder name the
 * uploader passed. Used when re-naming a file that is already in S3 (see
 * fileNameSync.service), where the uploader's folder argument is long gone.
 *
 * `buildStorageKey` writes `<folder>/<unique>/<name>`, but not every key is that
 * tidy — the Drive tree adds a company segment ("drive/<company>/<uuid>/<name>")
 * and a few folders are themselves nested ("users/photo"). So the leading
 * segments are matched against the explicit table longest-first, and only an
 * unrecognised folder falls through to title-casing.
 */
export function fileTypeForStorageKey(s3Key) {
  if (!s3Key) return undefined;
  const path = String(s3Key).replace(/^https?:\/\/[^/]+\//i, "").replace(/^\/+/, "");
  const segments = path.split("/").filter(Boolean);
  // Fewer than three segments means there is no folder at all — just a key.
  if (segments.length < 3) return undefined;

  // Everything before the `<unique>/<name>` tail is a candidate folder path.
  const candidates = segments.slice(0, -2);
  for (let take = Math.min(candidates.length, 2); take >= 1; take -= 1) {
    const folder = candidates.slice(0, take).join("/");
    if (Object.prototype.hasOwnProperty.call(FILE_TYPE_BY_FOLDER, folder)) {
      return FILE_TYPE_BY_FOLDER[folder] || undefined;
    }
  }

  // Unlisted folder: the first segment is the one every uploader names; the
  // deeper ones are ids and would title-case into gibberish.
  return fileTypeForFolder(candidates[0]);
}

// ─── The core: format + data → file name ─────────────────────────────────────

/**
 * Render an administrator-configured format into a file name.
 *
 * Unknown tokens and tokens with no value collapse to an empty string, and the
 * separators left stranded around them are folded away, so
 * `[Full Name]-[Address]-[Reference Number]` with no address yields
 * `John_Doe-REF001`, not `John_Doe--REF001`.
 *
 * @param {string} format     e.g. "[Full Name]-[Reference Number]-[FileType]"
 * @param {object} data       { fullName, address, referenceNumber, createdDate, fileType }
 * @param {string} extension  ".jpg" / "jpg" — preserved as given
 * @returns {string}          e.g. "John_Doe-REF001-Photo.jpg"
 */
export function generateFileName(format, data = {}, extension = "") {
  const effectiveFormat = String(format || "").trim() || DEFAULT_FILE_NAME_FORMAT;

  const tokenData = {
    ...data,
    createdDate: formatNamingDate(data.createdDate ?? data.created_date),
  };

  const rendered = effectiveFormat.replace(TOKEN_PATTERN, (_match, token) => {
    const resolver = TOKEN_RESOLVERS[normalizeTokenKey(token)];
    return resolver ? sanitizeFileNameSegment(resolver(tokenData)) : "";
  });

  const baseName = rendered
    // Drop anything disallowed that came from the format's literal text.
    .replace(/[^A-Za-z0-9 \-_]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    // Fold the separator runs left behind by empty tokens.
    .replace(/[-_]{2,}/g, (run) => run[0])
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, MAX_FILE_NAME_LENGTH);

  // Every token was empty (e.g. a brand-new lead with no reference number yet) —
  // an extension-only name would be unusable, so fall back to the file type.
  const safeBase = baseName || sanitizeFileNameSegment(tokenData.fileType) || "File";

  return `${safeBase}${normalizeExtension(extension)}`;
}

// ─── Format lookup (cached) ──────────────────────────────────────────────────

// The format changes once in a blue moon but is read on every single upload, so
// it is cached in-process. The TTL — not the explicit invalidation below — is
// what bounds staleness in the worker processes, which never see the admin save.
const FORMAT_CACHE_TTL_MS = 60 * 1000;
const formatCache = new Map();

const scopeKey = (companyId, builderId) => `${companyId || "-"}::${builderId || "-"}`;

/** Match the scoping used when the format is saved (builder OR company). */
const builderOrCompany = (builderId, companyId) => ({
  [Op.or]: [
    ...(builderId ? [{ builder_id: builderId }] : []),
    ...(companyId ? [{ company_id: companyId }] : []),
  ],
});

/**
 * The configured format for a builder/company, or DEFAULT_FILE_NAME_FORMAT when
 * none has been saved. Never throws — an unreachable database degrades to the
 * default rather than failing the upload.
 */
export async function getNamingFormat({ companyId = null, builderId = null } = {}) {
  if (!companyId && !builderId) return DEFAULT_FILE_NAME_FORMAT;

  const key = scopeKey(companyId, builderId);
  const cached = formatCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.format;

  let format = DEFAULT_FILE_NAME_FORMAT;
  try {
    const { DocumentFileNamingFormat } = db.sequelize.models;
    const record = await DocumentFileNamingFormat.findOne({
      where: builderOrCompany(builderId, companyId),
      attributes: ["naming_format"],
      order: [["createdAt", "DESC"]],
    });
    format = record?.naming_format?.trim() || DEFAULT_FILE_NAME_FORMAT;
  } catch (error) {
    console.error("[FileNaming] Could not read naming format, using default:", error.message);
  }

  formatCache.set(key, { format, expiresAt: Date.now() + FORMAT_CACHE_TTL_MS });
  return format;
}

/** Drop cached formats. Called when an administrator saves a new format. */
export function invalidateNamingFormatCache({ companyId, builderId } = {}) {
  if (!companyId && !builderId) {
    formatCache.clear();
    return;
  }
  // A scope key pairs one company with one builder; a save against either side
  // can affect any entry mentioning it, so clear every matching pair.
  for (const key of formatCache.keys()) {
    const [cachedCompany, cachedBuilder] = key.split("::");
    if ((companyId && cachedCompany === companyId) || (builderId && cachedBuilder === builderId)) {
      formatCache.delete(key);
    }
  }
}

// ─── Token data resolution ───────────────────────────────────────────────────

const addressOf = (propertyDetail) => {
  if (!propertyDetail) return "";
  const street = propertyDetail.address_line1 || propertyDetail.street || "";
  const parts = [
    propertyDetail.lot_number ? `Lot ${propertyDetail.lot_number}` : "",
    street,
    propertyDetail.city || "",
  ].filter(Boolean);
  return parts.join(" ") || propertyDetail.estate_name || "";
};

const leadInclude = (models) => [{
  model: models.PropertyDetail,
  as: "propertyDetail",
  attributes: ["lot_number", "street", "address_line1", "city", "estate_name"],
}];

/**
 * Fill in whatever token values the caller did not supply by walking to the
 * owning lead (directly, or via a job / quotation version).
 *
 * Values passed by the caller always win — a module that already has the lead
 * loaded should pass `fullName` / `address` / `referenceNumber` straight through
 * and skip the queries entirely.
 *
 * Never throws: a lookup failure yields empty tokens, which the format renders
 * as empty strings.
 */
export async function resolveNamingData({
  leadId = null,
  jobId = null,
  quotationVersionId = null,
  propertyDetailId = null,
  fullName,
  address,
  referenceNumber,
  createdDate,
  fileType,
  mimeType,
  originalName,
  transaction = null,
} = {}) {
  const resolved = {
    fullName: fullName || "",
    address: address || "",
    referenceNumber: referenceNumber || "",
    createdDate: createdDate || new Date(),
    fileType: resolveFileTypeLabel({ fileType, mimeType, originalName }),
  };

  const needsLookup = !resolved.fullName || !resolved.address || !resolved.referenceNumber;
  if (!needsLookup) return resolved;

  try {
    const models = db.sequelize.models;
    const { Leads, Job, Opportunity, QuotationVersion, Quotation, PropertyDetail } = models;
    // `hooks: false` skips the afterFind image-URL resolution on PropertyDetail —
    // it would fire an extra DriveFile query on every upload for nothing.
    const queryOptions = { transaction, hooks: false };

    let lead = null;

    if (leadId) {
      lead = await Leads.findByPk(leadId, {
        attributes: ["leads_id", "name", "reference_number"],
        include: leadInclude(models),
        ...queryOptions,
      });
    } else if (jobId) {
      const job = await Job.findByPk(jobId, {
        attributes: ["job_id", "reference_number"],
        include: [{
          model: Opportunity,
          as: "opportunity",
          attributes: ["opportunity_id"],
          include: [{
            model: Leads,
            as: "lead",
            attributes: ["leads_id", "name", "reference_number"],
            include: leadInclude(models),
          }],
        }],
        ...queryOptions,
      });
      // A job carries its own reference number — prefer it over the lead's.
      resolved.referenceNumber = resolved.referenceNumber || job?.reference_number || "";
      lead = job?.opportunity?.lead || null;
    } else if (quotationVersionId) {
      const version = await QuotationVersion.findByPk(quotationVersionId, {
        attributes: ["quotation_version_id"],
        include: [{
          model: Quotation,
          as: "quotation",
          attributes: ["quotation_id", "reference_number"],
          include: [{
            model: Leads,
            as: "lead",
            attributes: ["leads_id", "name", "reference_number"],
            include: leadInclude(models),
          }],
        }],
        ...queryOptions,
      });
      resolved.referenceNumber = resolved.referenceNumber || version?.quotation?.reference_number || "";
      lead = version?.quotation?.lead || null;
    }

    if (lead) {
      resolved.fullName = resolved.fullName || lead.name || "";
      resolved.referenceNumber = resolved.referenceNumber || lead.reference_number || "";
      resolved.address = resolved.address || addressOf(lead.propertyDetail);
    }

    if (!resolved.address && propertyDetailId) {
      const property = await PropertyDetail.findByPk(propertyDetailId, {
        attributes: ["lot_number", "street", "address_line1", "city", "estate_name"],
        ...queryOptions,
      });
      resolved.address = addressOf(property);
    }
  } catch (error) {
    console.error("[FileNaming] Could not resolve naming data:", error.message);
  }

  return resolved;
}

// ─── One-stop entry points ───────────────────────────────────────────────────

/**
 * Read the configured format, resolve the tokens, and render the file name.
 * This is what every upload path calls.
 *
 * @param {object} context ids + any token values already known + { originalName,
 *                         mimeType, fileType, extension, format, transaction }
 * @returns {Promise<string>} e.g. "John_Doe-REF001-Photo.jpg"
 */
export async function buildFileName({ format, extension, ...context } = {}) {
  const [effectiveFormat, data] = await Promise.all([
    format ? Promise.resolve(format) : getNamingFormat(context),
    resolveNamingData(context),
  ]);

  return generateFileName(
    effectiveFormat,
    data,
    extension ?? extensionOf(context.originalName),
  );
}

const uniqueSegment = () => `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

/**
 * The S3 object key for an upload: `<folder>/<unique>/<configured name>`.
 *
 * The configured name is the key's *basename*, so `key.split("/").pop()` — how
 * several modules derive `drive_files.file_name` — yields exactly the name the
 * administrator asked for, while the unique middle segment guarantees two
 * identically-named uploads can never overwrite each other in S3.
 */
export async function buildStorageKey({ folderName = "uploads", ...context } = {}) {
  const fileName = await buildFileName({
    ...context,
    // A route may name its document type explicitly; otherwise the folder does.
    fileType: context.fileType || fileTypeForFolder(folderName),
  });
  return `${folderName}/${uniqueSegment()}/${fileName}`;
}

/**
 * File name for a DriveFile identified by its polymorphic sub-reference — the
 * shape every `upsert*DriveFile` helper needs. The sub-reference supplies the
 * `[FileType]` token ("Building Contract", "Compaction Report", …), so a
 * server-generated PDF is named as precisely as an interactive upload.
 *
 * `extension` defaults to ".pdf" because every current caller generates a PDF.
 */
export async function buildDriveFileName({
  subReferenceType,
  fileType,
  extension = ".pdf",
  ...context
} = {}) {
  return buildFileName({
    ...context,
    extension,
    fileType: fileType || FILE_TYPE_BY_SUB_REFERENCE[subReferenceType] || undefined,
  });
}

/**
 * `drive_files.file_name` carries a UNIQUE constraint, so a format that renders
 * the same name twice would fail the insert. Suffix `-2`, `-3`, … on collision;
 * the first upload of a given name keeps the clean form.
 *
 * `excludeFileIds` marks rows whose current name is about to be released — a
 * bulk re-name (see fileNameSync.service) must not treat the old name of a file
 * it is itself renaming as a collision, or every sync would drift one suffix
 * further away from the configured format.
 *
 * `companyId` scopes the probe to the key it is actually probing. The constraint
 * is `(company_id, file_name)` since migration 20260817170000 — before that it
 * was table-wide, and this searched table-wide to match. Omitting it still
 * works and merely suffixes more than it needs to; passing it is what keeps one
 * tenant's names out of another's.
 *
 * The probe runs across every sample-data owner, which the caller's own reads
 * deliberately do not. `DriveFile` is owner-scoped, so a name held by a
 * colleague's seeded copy is invisible to this user — and the probe would
 * report it free while the database, which scopes nothing, rejected the insert.
 * That is the 23505 on `drive_files_file_name_key`: a name the user could not
 * be shown but could still collide with.
 */
export async function ensureUniqueDriveFileName(
  fileName,
  { transaction = null, existingNames = null, excludeFileIds = null, companyId = null } = {},
) {
  const { DriveFile } = db.sequelize.models;
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";

  const nameSet = existingNames instanceof Set ? existingNames : (Array.isArray(existingNames) ? new Set(existingNames) : null);
  const excluded = Array.isArray(excludeFileIds) ? excludeFileIds : (excludeFileIds ? [...excludeFileIds] : []);

  for (let attempt = 1; attempt <= 50; attempt += 1) {
    const candidate = attempt === 1 ? fileName : `${base}-${attempt}${ext}`;
    if (nameSet && nameSet.has(candidate)) {
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const clash = await runAcrossAllSampleDataOwners(() =>
      DriveFile.findOne({
        where: {
          file_name: candidate,
          ...(companyId ? { company_id: companyId } : {}),
          ...(excluded.length ? { file_id: { [Op.notIn]: excluded } } : {}),
        },
        attributes: ["file_id"],
        // A file in Trash still holds its name — the key covers soft-deleted
        // rows, so the probe has to as well or a restore would collide.
        paranoid: false,
        transaction,
      }),
    );
    if (!clash) return candidate;
  }

  // Pathological case (50 files with the same configured name) — fall back to a
  // guaranteed-unique suffix rather than looping forever.
  return `${base}-${uniqueSegment()}${ext}`;
}

/**
 * Pull whatever naming context a multipart request carries. Multer runs before
 * the controllers and before camelToSnakeMiddleware, so both casings are probed,
 * across params, body and query.
 */
export function namingContextFromRequest(req, extra = {}) {
  const sources = [req?.params, req?.body, req?.query].filter(Boolean);

  const pick = (...keys) => {
    for (const source of sources) {
      for (const key of keys) {
        if (source[key]) return source[key];
      }
    }
    return null;
  };

  return {
    companyId: req?.user?.company_id || null,
    builderId: req?.user?.builder_id || null,
    leadId: pick("leads_id", "lead_id", "leadsId", "leadId"),
    jobId: pick("job_id", "jobId"),
    quotationVersionId: pick("quotation_version_id", "quotationVersionId"),
    propertyDetailId: pick("property_detail_id", "propertyDetailId"),
    referenceNumber: pick("reference_number", "referenceNumber"),
    ...extra,
  };
}

export default {
  generateFileName,
  validateNamingFormat,
  sanitizeFileNameSegment,
  normalizeExtension,
  extensionOf,
  formatNamingDate,
  resolveFileTypeLabel,
  fileTypeForFolder,
  fileTypeForStorageKey,
  getNamingFormat,
  invalidateNamingFormatCache,
  resolveNamingData,
  buildFileName,
  buildDriveFileName,
  buildStorageKey,
  ensureUniqueDriveFileName,
  namingContextFromRequest,
};
