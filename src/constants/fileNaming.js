/**
 * Global file-naming vocabulary.
 *
 * The administrator configures a single naming format per builder/company under
 * Admin → Integration → File Naming; it is stored in
 * `document_file_naming_format.naming_format` and is the single source of truth
 * for the name of every file the platform uploads (photos, PDFs, documents,
 * contracts, invoices, reports, …).
 */

import { DRIVE_FILE_MAPPING } from "./driveFile.js";

/** Personalization tokens offered by the admin UI, in menu order. */
export const FILE_NAME_TOKENS = {
  ADDRESS: "[Address]",
  CREATED_DATE: "[Created Date]",
  FILE_TYPE: "[FileType]",
  FULL_NAME: "[Full Name]",
  REFERENCE_NUMBER: "[Reference Number]",
};

/** Used whenever the administrator has not configured a format yet. */
export const DEFAULT_FILE_NAME_FORMAT = "[Reference Number]-[FileType]-[Created Date]";

/**
 * `[FileType]` labels. Anything not covered by a caller's explicit `fileType`
 * is derived from the MIME type (see resolveFileTypeLabel).
 */
export const FILE_TYPE_LABELS = {
  PHOTO: "Photo",
  PDF: "PDF",
  DOCUMENT: "Document",
  SPREADSHEET: "Spreadsheet",
  VIDEO: "Video",
  FILE: "File",
};

/**
 * `[FileType]` label for a DriveFile sub-reference. Server-generated documents
 * (contracts, invoices, reports) know exactly what they are, so they name the
 * type rather than letting it be guessed from a MIME type.
 */
export const FILE_TYPE_BY_SUB_REFERENCE = {
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.FLOOR_PLAN_SIMPLE]: "Floor Plan",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.FLOOR_PLAN_DETAILED]: "Floor Plan",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.FACADE_IMAGE]: "Facade",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.QUOTATION_REPORT]: "Quotation",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.SIGNED_QUOTATION_REPORT]: "Signed Quotation",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.MAINTENANCE_REQUEST]: "Maintenance",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.MAINTENANCE_REQUEST_TASK]: "Maintenance Task",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.STRUCTURE_ENGINEER_REPORT]: "Structure Engineer Report",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.STRUCTURE_ENGINEER_UPLOAD]: "Structure Engineer Report",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.ENGINEERING_REQUIREMENT]: "Engineering Requirement",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.COMPACTION_REPORT]: "Compaction Report",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.BUILDING_CONTRACT_PDF]: "Building Contract",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.COLOR_SELECTION_REPORT]: "Colour Selection",
  [DRIVE_FILE_MAPPING.SUB_REFERENCES.COLOR_SCHEDULE_DOCUMENT]: "Colour Schedule",
};

/** Longest generated base name (extension excluded) — keeps keys well under the
 *  255-char limit of both S3 keys and `drive_files.file_name`. */
export const MAX_FILE_NAME_LENGTH = 180;

export default {
  FILE_NAME_TOKENS,
  DEFAULT_FILE_NAME_FORMAT,
  FILE_TYPE_LABELS,
  FILE_TYPE_BY_SUB_REFERENCE,
  MAX_FILE_NAME_LENGTH,
};
