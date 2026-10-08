import path from "path";

// One definition of "a file a user may store in the Drive / Documents area".
// These endpoints are general-purpose storage rather than a single-purpose
// uploader, so the list is deliberately broad: documents, spreadsheets, plain
// text, every ordinary image, audio and video. SVG stays out (it can carry
// script and is served back from our own origin) and so does anything
// executable — that is what the allow-list is protecting against.

const EXACT_MIMES = new Set([
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.ms-excel", // .xls
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel.sheet.macroenabled.12", // .xlsm
  "application/vnd.ms-powerpoint", // .ppt
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/rtf",
  "application/csv",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.oasis.opendocument.text", // .odt
  "application/vnd.oasis.opendocument.spreadsheet", // .ods
]);

// Fallback allow-list, keyed on the extension. Clients frequently send
// application/octet-stream (or no type at all) for .xlsx, .csv, .heic and
// friends when the OS has no association for the extension — curl without an
// explicit `type=` does it for every file. Judging those on the extension is
// what stops a perfectly ordinary spreadsheet coming back as "Invalid file
// type".
const EXACT_EXTENSIONS = new Set([
  // documents
  "pdf", "doc", "docx", "xls", "xlsx", "xlsm", "csv", "ppt", "pptx",
  "txt", "md", "log", "rtf", "odt", "ods", "zip",
  // images
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "avif", "ico",
  // media
  "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "m4a",
]);

const WILDCARD_PREFIXES = ["image/", "video/", "audio/", "text/"];

// Refused whatever the content type claims. Scripts and installers have no
// business in a document store, and a shell script arrives as text/plain, so
// the wildcards above would otherwise wave them through. SVG and HTML are here
// for the same reason: they are markup that runs script when opened from the
// origin we serve downloads on.
const DENIED_EXTENSIONS = new Set([
  "exe", "msi", "com", "scr", "dll", "bat", "cmd", "ps1", "psm1",
  "sh", "bash", "vbs", "vbe", "wsf", "jar", "app", "apk", "deb", "rpm",
  "js", "mjs", "cjs", "php", "py", "rb", "pl",
  "svg", "html", "htm", "xhtml", "hta",
]);

export const extensionOf = (originalName = "") =>
  path.extname(originalName).toLowerCase().replace(".", "");

/**
 * @param {{ mimetype?: string, originalname?: string }} file  a Multer file
 * @returns {boolean} whether the file may be stored
 */
export const isAllowedUploadFile = (file) => {
  const mime = (file?.mimetype || "").toLowerCase().trim();
  const ext = extensionOf(file?.originalname);

  // Blocked outright, whichever of the two says so.
  if (DENIED_EXTENSIONS.has(ext) || mime === "image/svg+xml" || mime === "text/html") {
    return false;
  }

  if (EXACT_MIMES.has(mime)) {
    return true;
  }
  if (WILDCARD_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
    return true;
  }

  // Generic or missing content type — fall back to the extension.
  return EXACT_EXTENSIONS.has(ext);
};

export const UPLOAD_FILE_TYPE_ERROR =
  "Invalid file type. Only documents (PDF, Word, Excel, PowerPoint, text, CSV), images, audio and video files are allowed.";

/* ── The document store: a deliberately narrower list ─────────────────────── */

/**
 * What the Drive and the Documents area accept.
 *
 * The list above is the general one, and is still what campaign uploads,
 * maintenance attachments and estate documents use — those are separate
 * features with their own needs. The document store is narrower on purpose:
 * every file in it is meant to be a document somebody can open, read and edit
 * in the app, and the app opens exactly four things — PDFs, Word documents,
 * spreadsheets and images.
 *
 * What this deliberately turns away, and why:
 *
 *   - `.doc` / `.xls`. The pre-2007 binary formats. Nothing in a browser can
 *     edit one, so every upload of one became a file its owner could store and
 *     not work with. Refusing it at the door, with a message saying to save it
 *     as .docx/.xlsx, is a better answer than accepting it and explaining later.
 *     Existing legacy files are unaffected — they still convert on demand from
 *     the editor, which is what that path is for.
 *   - PowerPoint, .odt/.ods, .rtf, .csv, .txt, zip archives, audio and video.
 *     Storable, but not documents this app does anything with.
 *
 * `.xlsm` is in: it is an .xlsx that happens to carry macros, the editor opens
 * it, and Document Management already lists it. Nothing here executes it.
 */
const DOCUMENT_STORE_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel.sheet.macroenabled.12", // .xlsm
]);

// The extension fallback, for the same reason the general list has one: clients
// routinely send application/octet-stream (or nothing at all) for .xlsx and
// .docx when the OS has no association, and curl does it for every file.
const DOCUMENT_STORE_EXTENSIONS = new Set([
  "pdf", "docx", "xlsx", "xlsm",
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "avif", "ico",
]);

/**
 * @param {{ mimetype?: string, originalname?: string }} file  a Multer file
 * @returns {boolean} whether the file may be stored in the Drive / Documents
 */
export const isAllowedDocumentStoreFile = (file) => {
  const mime = (file?.mimetype || "").toLowerCase().trim();
  const ext = extensionOf(file?.originalname);

  // SVG is an image by content type and a script host in practice, and these
  // files are served back from an origin of ours. It stays out however it is
  // labelled — the same rule the general list applies.
  if (mime === "image/svg+xml" || ext === "svg" || DENIED_EXTENSIONS.has(ext)) {
    return false;
  }

  // Every ordinary image, by content type. This is the one wildcard, so a format
  // no list here anticipated still works.
  if (mime.startsWith("image/")) {
    return true;
  }

  // The extension decides, and it decides ahead of the content type, because the
  // extension is what the rest of the system reads: `file_extension` comes from
  // the name, and so does every later judgement about what the file is. A file
  // called Report.doc carrying the .docx content type would otherwise be stored
  // as a .doc and be exactly the unopenable document this list exists to keep
  // out. The content type is a claim; the name is what the file becomes.
  if (ext) {
    return DOCUMENT_STORE_EXTENSIONS.has(ext);
  }

  // No extension at all — the content type is all there is to go on.
  return DOCUMENT_STORE_MIMES.has(mime);
};

export const DOCUMENT_STORE_FILE_TYPE_ERROR =
  "Invalid file type. This area accepts PDF, Word (.docx), Excel (.xlsx, .xlsm) and image files. " +
  "Older .doc and .xls files are not accepted — open the file in Word or Excel and save it as .docx or .xlsx first.";

/**
 * Multer `fileFilter` for the Drive and the Documents area.
 *
 * The message has to start with "Invalid file type" — handleMulterError keys off
 * that prefix to answer 400 rather than letting the error bubble up as a 500.
 */
export const documentStoreFileFilter = (req, file, cb) => {
  if (isAllowedDocumentStoreFile(file)) {
    return cb(null, true);
  }
  cb(new Error(DOCUMENT_STORE_FILE_TYPE_ERROR), false);
};

/* ── Chat attachments: PNG and JPEG only ──────────────────────────────────── */

/**
 * What a lead / job chat message may carry: PNG and JPEG images, nothing else.
 */
const CHAT_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);
const CHAT_MIMES = new Set(["image/png", "image/jpeg", "image/jpg"]);

/**
 * @param {{ mimetype?: string, originalname?: string }} file  a Multer file
 * @returns {boolean} whether the file may be attached to a chat message
 */
export const isAllowedChatFile = (file) => {
  const mime = (file?.mimetype || "").toLowerCase().trim();
  const ext = extensionOf(file?.originalname);

  if (mime === "image/svg+xml" || ext === "svg" || DENIED_EXTENSIONS.has(ext)) {
    return false;
  }
  // The extension decides when there is one, for the reason the document store
  // gives: it is what the file is stored and shown as.
  if (ext) {
    return CHAT_EXTENSIONS.has(ext);
  }
  return CHAT_MIMES.has(mime);
};

export const CHAT_FILE_TYPE_ERROR =
  "Invalid file type. Only PNG and JPEG images can be attached.";

/** Multer `fileFilter` for chat attachments (message prefix: see below). */
export const chatFileFilter = (req, file, cb) => {
  if (isAllowedChatFile(file)) {
    return cb(null, true);
  }
  cb(new Error(CHAT_FILE_TYPE_ERROR), false);
};

/**
 * Multer `fileFilter` built on the list above. The rejection message has to
 * start with "Invalid file type" — handleMulterError keys off that prefix to
 * answer 400 rather than letting the error bubble up as a 500.
 */
export const uploadFileFilter = (req, file, cb) => {
  if (isAllowedUploadFile(file)) {
    return cb(null, true);
  }
  cb(new Error(UPLOAD_FILE_TYPE_ERROR), false);
};

export default {
  isAllowedUploadFile,
  uploadFileFilter,
  UPLOAD_FILE_TYPE_ERROR,
  isAllowedDocumentStoreFile,
  documentStoreFileFilter,
  DOCUMENT_STORE_FILE_TYPE_ERROR,
  isAllowedChatFile,
  chatFileFilter,
  CHAT_FILE_TYPE_ERROR,
  extensionOf,
};
