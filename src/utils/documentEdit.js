/**
 * What kind of document a file is, and whether it may be edited.
 *
 * The editing switch is per file and lives on `drive_files.document_editable`,
 * set by an administrator in Admin → Document → Document Management. It is the
 * single answer to "may this be changed?", asked by every list endpoint that
 * decorates a row and by every write path before it touches S3.
 *
 * `pdfEdit.js` is the neighbouring module and answers a different question —
 * which *generated PDF* offers the edit-the-record form. Keeping the two apart
 * is what stops a document-type setting being mistaken for a permission.
 */

/**
 * The reference type a document belongs to — "Quotation", "BuildingContract",
 * "GeneralDocumentPdf" and so on.
 *
 * Lives here rather than in `pdfEdit.js`, where it grew up, because the
 * per-type editing rule needs it and `pdfEdit.js` already imports *this* module.
 * Putting it the other way round would make the two import each other, and a
 * cycle between the module that decides permissions and the module that decides
 * PDF types is not a thing to leave for someone else to find. `pdfEdit.js`
 * re-exports it under its old name so nothing that already imports it moves.
 *
 * Decided from the polymorphic reference the generator stamped on the row, which
 * says nothing about the file format: a generated document is a generated
 * document whether it was rendered as a PDF or written as a workbook.
 */
export function getDocumentTypeKey(file) {
  if (!file) return "GeneralDocumentPdf";
  const ref = file.reference_type;
  const sub = file.sub_reference_type;

  // Generated documents
  if (ref === "Quotation" || ref === "QuotationVersion") {
    if (sub === "QuotationReport") return "Quotation";
    return "QuotationComparison";
  }
  if (sub === "EngineeringRequirement") return "EngineeringRequirement";
  if (sub === "ColorSelectionReport") return "ColorSelectionReport";
  if (sub === "ColorScheduleDocument") return "ColorScheduleDocument";

  if (
    ref === "JobVariation" ||
    ref === "JobVariationDocument" ||
    ref === "JobVariationSignedDocument" ||
    ref === "JobVariationInvoiceDocument"
  ) {
    return "JobVariation";
  }

  if (ref === "JobInvoice" || ref === "JobInvoiceDocument") {
    return "JobInvoice";
  }
  if (ref === "JobInvoiceReceiptDocument") return "PaymentReceipt";
  if (ref === "BuildingContract" || sub === "BuildingContractPdf") return "BuildingContract";
  if (ref === "JobCompletionApproval") return "JobCompletionApproval";
  if (sub === "CompactionReport") return "CompactionReport";

  // Uploaded documents
  if (sub === "StructureEngineerUpload" || sub === "StructureEngineerReport") {
    return "StructureEngineerReport";
  }
  if (sub === "SignedQuotationReport") return "SignedQuotationReport";
  if (ref === "JobDocument") return "JobDocument";

  return "GeneralDocumentPdf";
}

/** Type keys the application produces itself, rather than a user uploading them. */
export const GENERATED_TYPE_KEYS = new Set([
  "Quotation", "QuotationComparison", "EngineeringRequirement", "ColorSelectionReport",
  "ColorScheduleDocument", "JobVariation", "JobInvoice", "PaymentReceipt",
  "BuildingContract", "JobCompletionApproval", "CompactionReport",
]);

/**
 * Every type the per-type editing rule can name, with a label and its group.
 *
 * One list, exported, so the settings screen offers exactly the keys the rule
 * understands. Two copies of this — one here and one in the UI — is how a
 * checkbox ends up switching nothing: it writes a key `getDocumentTypeKey` never
 * returns, and the administrator is left with a setting that silently does not
 * apply.
 */
export const DOCUMENT_TYPE_OPTIONS = [
  { key: "Quotation", label: "Quotation", group: "generated" },
  { key: "QuotationComparison", label: "Quotation Comparison", group: "generated" },
  { key: "EngineeringRequirement", label: "Engineering Requirement", group: "generated" },
  { key: "ColorSelectionReport", label: "Colour Selection Report", group: "generated" },
  { key: "ColorScheduleDocument", label: "Colour Schedule Document", group: "generated" },
  { key: "JobVariation", label: "Job Variation", group: "generated" },
  { key: "JobInvoice", label: "Job Invoice", group: "generated" },
  { key: "PaymentReceipt", label: "Payment Receipt", group: "generated" },
  { key: "JobCompletionApproval", label: "Job Completion Approval", group: "generated" },
  { key: "BuildingContract", label: "Building Contract", group: "generated" },
  { key: "CompactionReport", label: "Compaction Report", group: "generated" },

  { key: "StructureEngineerReport", label: "Structural Engineer Reports", group: "uploaded" },
  { key: "SignedQuotationReport", label: "Signed Quotation Reports", group: "uploaded" },
  { key: "JobDocument", label: "Job Documents", group: "uploaded" },
  { key: "GeneralDocumentPdf", label: "Drive & other documents", group: "uploaded" },
];

/** The keys the rule accepts, for validating what the settings screen sends. */
export const DOCUMENT_TYPE_KEYS = DOCUMENT_TYPE_OPTIONS.map((option) => option.key);

/** Extensions the in-app editors can open, mapped to the family they belong to. */
const EDITABLE_FORMATS = {
  pdf: { format: "pdf", label: "PDF", editor: "pdf" },
  xlsx: { format: "spreadsheet", label: "Excel Workbook", editor: "xls" },
  xlsm: { format: "spreadsheet", label: "Excel Macro Workbook", editor: "xls" },
  docx: { format: "word", label: "Word Document", editor: "doc" },
};

/**
 * Formats whose editability cannot be decided from the extension.
 *
 * `.xls` and `.doc` name three different things: the genuine pre-2007 binary
 * format, an OOXML file somebody renamed, and an HTML or XML table from a report
 * exporter. Only the first is beyond the editor, and it is far from the most
 * common — so these carry an editor like any other format, and the client reads
 * the file's magic bytes to decide whether it can actually open it.
 *
 * `editorDependsOnContent` is what lets the screen say "opens if the file is
 * really a modern workbook" rather than promising either way.
 */
const LEGACY_FORMATS = {
  xls: {
    format: "spreadsheet",
    label: "Excel 97-2003",
    editor: "xls",
    editorDependsOnContent: true,
  },
  doc: {
    format: "word",
    label: "Word 97-2003",
    editor: "doc",
    editorDependsOnContent: true,
  },
};

const MIME_EXTENSIONS = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel.sheet.macroenabled.12": "xlsm",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/msword": "doc",
};

/** Lower-case extension without the dot, from whichever field carries it. */
export function extensionOf(file) {
  if (!file) return "";

  const raw = String(file.file_extension || "").replace(/^\.+/, "").toLowerCase();
  if (raw) return raw;

  const name = String(file.original_name || file.file_name || "");
  const match = /\.([a-z0-9]+)$/i.exec(name);
  if (match) return match[1].toLowerCase();

  const mime = String(file.mime_type || "").toLowerCase();
  return MIME_EXTENSIONS[mime] || "";
}

/**
 * The document family and human label for a file, or null when it is not a
 * document at all (an image, a zip, anything the screen does not manage).
 */
export function describeDocumentType(file) {
  const extension = extensionOf(file);
  const known = EDITABLE_FORMATS[extension] || LEGACY_FORMATS[extension];
  if (!known) return null;
  return { extension, ...known };
}

/** True for the file types Document Management lists. */
export function isManagedDocument(file) {
  return describeDocumentType(file) !== null;
}

/** True when an in-app editor exists for this format at all. */
export function hasEditorSupport(file) {
  return Boolean(describeDocumentType(file)?.editor);
}

/**
 * True when the extension alone cannot say whether the editor will open it.
 *
 * Only `.xls` and `.doc`: the editor opens them when the bytes turn out to be
 * OOXML and explains itself when they are genuinely the old binary format.
 */
export function editorDependsOnContent(file) {
  return Boolean(describeDocumentType(file)?.editorDependsOnContent);
}

/**
 * May this document be edited?
 *
 * `document_editable` is NULL for every file that predates the screen and for
 * every file uploaded since, so **the default is allowed**. Only an
 * administrator explicitly switching a file OFF makes it read-only — defaulting
 * the other way would have made every document in every tenant read-only the
 * moment this shipped.
 *
 * Applies to any stored file, not only the ones the screen lists: the switch is
 * the authority on whether a file's bytes may be replaced, and a caller should
 * not be able to get around it by sending something with an unusual extension.
 */
export function isDocumentEditingAllowed(file, blockedTypes = []) {
  const setting = file?.document_editable;

  // An explicit ruling on this one document wins over the type rule, both ways.
  // An administrator has to be able to lock a single contract of a type that is
  // otherwise fine, *and* to release one document of a blocked type without
  // unblocking the type — a rule with no exception is a rule people work around
  // by turning it off entirely.
  if (setting === true || setting === false) return setting;

  // Nobody has ruled on this file, so the type decides. Absent from the list
  // means editable: the list names what is turned off, and an empty one is the
  // behaviour every tenant already has.
  if (Array.isArray(blockedTypes) && blockedTypes.length) {
    return !blockedTypes.includes(getDocumentTypeKey(file));
  }

  return true;
}

/**
 * Why a document is read-only, for a message that tells the reader what to do.
 *
 * "Editing is turned off" is true of both a locked file and a blocked type and
 * points at two different screens — sending an administrator to the wrong one is
 * how a five-second fix becomes a support ticket.
 *
 * @returns {"file"|"type"|null} null when editing is allowed
 */
export function documentEditBlockedBy(file, blockedTypes = []) {
  if (file?.document_editable === false) return "file";
  if (file?.document_editable === true) return null;
  if (Array.isArray(blockedTypes) && blockedTypes.includes(getDocumentTypeKey(file))) {
    return "type";
  }
  return null;
}

/**
 * The screen's view of one file: whether editing is on, and whether that is
 * somebody's decision or just the default.
 *
 * A row that reads ON because nobody has ruled on it is not the same fact as one
 * an administrator deliberately switched on, and the column says which.
 *
 * Three ways a row can read the way it does, and the screen has to tell them
 * apart:
 *
 *   explicit — an administrator ruled on this document. Their decision stands
 *     whichever way the type rule goes.
 *   type     — off because its whole type is off. Switching this one row on is a
 *     deliberate exception, and the screen should say so rather than making it
 *     look like the row was locked individually.
 *   default  — nobody has ruled and nothing blocks it.
 *
 * @returns {{ editable: boolean, source: "explicit"|"type"|"default" }}
 */
export function describeDocumentEditability(file, blockedTypes = []) {
  const setting = file?.document_editable;
  if (setting === true || setting === false) return { editable: setting, source: "explicit" };

  if (Array.isArray(blockedTypes) && blockedTypes.includes(getDocumentTypeKey(file))) {
    return { editable: false, source: "type" };
  }

  return { editable: true, source: "default" };
}

/** Every extension Document Management lists, for building the type filter. */
export const MANAGED_EXTENSIONS = [
  ...Object.keys(EDITABLE_FORMATS),
  ...Object.keys(LEGACY_FORMATS),
];

/** Extension → family, so the screen can filter by "all spreadsheets". */
export const DOCUMENT_FORMATS = { ...EDITABLE_FORMATS, ...LEGACY_FORMATS };

export default {
  extensionOf,
  describeDocumentType,
  isManagedDocument,
  hasEditorSupport,
  editorDependsOnContent,
  isDocumentEditingAllowed,
  documentEditBlockedBy,
  describeDocumentEditability,
  getDocumentTypeKey,
  GENERATED_TYPE_KEYS,
  DOCUMENT_TYPE_OPTIONS,
  DOCUMENT_TYPE_KEYS,
  MANAGED_EXTENSIONS,
  DOCUMENT_FORMATS,
};
