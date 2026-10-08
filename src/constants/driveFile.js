export const DRIVE_FILE_MAPPING = {
  REFERENCE_NAMES: {
    FLOOR_PLAN: 'FloorPlan',
    FACADE: 'Facade',
    QUOTATION: 'Quotation',
    QUOTATION_VERSION: 'QuotationVersion',
    PROPERTY_DETAIL: 'PropertyDetail',
    MAINTENANCE: 'Maintenance',
    MAINTENANCE_SITE_IMAGE: 'MaintenanceSiteImage',
    MAINTENANCE_TASK_ATTACHMENT: 'MaintenanceTaskAttachment',
    BUILDING_CONTRACT: 'BuildingContract',
    JOB: 'Job',
    JOB_DAILY_UPDATE_IMAGE: 'JobDailyUpdateImage',
  },
  SUB_REFERENCES: {
    FLOOR_PLAN_SIMPLE: 'FloorPlanSimpleImage',
    FLOOR_PLAN_DETAILED: 'FloorPlanDetailedImage',
    FACADE_IMAGE: 'FacadeImage',
    QUOTATION_REPORT: 'QuotationReport',
    MAINTENANCE_REQUEST: 'MaintenanceRequest',
    MAINTENANCE_REQUEST_TASK: 'MaintenanceRequestTask',
    SIGNED_QUOTATION_REPORT: 'SignedQuotationReport',
    STRUCTURE_ENGINEER_REPORT: 'StructureEngineerReport',
    STRUCTURE_ENGINEER_UPLOAD: 'StructureEngineerUpload',
    ENGINEERING_REQUIREMENT: 'EngineeringRequirement',
    COMPACTION_REPORT: 'CompactionReport',
    BUILDING_CONTRACT_PDF: 'BuildingContractPdf',
    COLOR_SELECTION_REPORT: 'ColorSelectionReport',
    COLOR_SCHEDULE_DOCUMENT: 'ColorScheduleDocument',
  },
  /**
   * reference_type values that mean "this file belongs to a job".
   *
   * Job-generated PDFs (colour reports, variation and invoice documents) can
   * carry the lead_id of the lead behind the job, so lead-scoped views must
   * exclude them or the same document shows up — and gets renamed — in two
   * places. Shared by getLeadDocuments and the document name sync.
   */
  JOB_REFERENCE_TYPES: [
    'Job',
    'JobProcessTask',
    'JobVariationInvoiceDocument',
    'JobVariationSignedDocument',
    'JobVariationDocument',
    'JobInvoiceDocument',
    'JobInvoiceReceiptDocument',
  ],
  FOLDERS: {
    QUOTATION_REPORTS: 'Quotation Reports',
    ENGINEERING_REQUIREMENTS: 'Engineering Requirements',
    STRUCTURE_ENGINEER_REPORTS: 'Structure Engineer Reports',
    COMPACTION_REPORTS: 'Compaction Reports',
    BUILDING_CONTRACTS: 'Building Contracts',
    COLOR_SELECTION_REPORTS: 'Colour Selection Reports',
    COLOR_SCHEDULE_DOCUMENTS: 'Colour Schedule Documents',
    // Documents uploaded on Maintenance → Documents. Unlike the buckets above,
    // which hold PDFs the app generates, this one collects files a user picked —
    // they were previously written with no folder_id at all, so they existed in
    // drive_files but appeared nowhere in S Drive.
    MAINTENANCE_DOCUMENTS: 'Maintenance Documents',
  },
};

/** Set form of DRIVE_FILE_MAPPING.JOB_REFERENCE_TYPES, for membership tests. */
export const JOB_REFERENCE_TYPES = new Set(DRIVE_FILE_MAPPING.JOB_REFERENCE_TYPES);

/**
 * Business "document type" categories, derived from the polymorphic
 * reference_type / sub_reference_type a drive file carries. A category matches
 * when the file's reference_type OR sub_reference_type is in its set. `upload`
 * is the catch-all for hand-uploaded files: the reference-less global drive plus
 * generic Job/Lead uploads that carry no sub type.
 *
 * Shared by the documents filter (documents.service) and the recents/list views
 * (drive.service) so the taxonomy has a single home.
 */
export const DOCUMENT_TYPE_CATEGORIES = Object.freeze({
  quotation: {
    label: 'Quotation',
    referenceTypes: ['Quotation', 'QuotationVersion'],
    subReferenceTypes: ['QuotationReport', 'SignedQuotationReport'],
  },
  colour: {
    label: 'Colour Selection',
    subReferenceTypes: ['ColorSelectionReport', 'ColorScheduleDocument'],
  },
  variation: {
    label: 'Variation',
    referenceTypes: [
      'JobVariationDocument',
      'JobVariationSignedDocument',
      'JobVariationInvoiceDocument',
    ],
  },
  invoice: {
    label: 'Invoice',
    referenceTypes: ['JobInvoiceDocument', 'JobInvoiceReceiptDocument'],
  },
  engineering: {
    label: 'Engineering',
    referenceTypes: ['StructureEngineerReport'],
    subReferenceTypes: [
      'StructureEngineerReport',
      'StructureEngineerUpload',
      'EngineeringRequirement',
      'CompactionReport',
    ],
  },
  floorplan: {
    label: 'Floor Plan & Facade',
    referenceTypes: ['FloorPlan', 'Facade'],
    subReferenceTypes: ['FloorPlanSimpleImage', 'FloorPlanDetailedImage', 'FacadeImage'],
  },
  contract: {
    label: 'Contract',
    referenceTypes: ['BuildingContract'],
    subReferenceTypes: ['BuildingContractPdf'],
  },
  property: {
    label: 'Property',
    referenceTypes: ['PropertyDetail'],
  },
  upload: {
    label: 'Upload',
    referenceTypes: ['JobDocument', 'LeadDocument'],
    includeNullReference: true,
  },
});

/** [{ value, label }] for the filter dropdown, in display order. */
export const DOCUMENT_TYPE_OPTIONS = Object.entries(DOCUMENT_TYPE_CATEGORIES).map(
  ([value, def]) => ({ value, label: def.label }),
);

// reference_type / sub_reference_type → category key. sub_reference_type wins
// because it is the more specific signal.
const REFERENCE_TO_CATEGORY = (() => {
  const map = new Map();
  for (const [key, def] of Object.entries(DOCUMENT_TYPE_CATEGORIES)) {
    for (const rt of def.referenceTypes || []) map.set(`ref:${rt}`, key);
    for (const st of def.subReferenceTypes || []) map.set(`sub:${st}`, key);
  }
  return map;
})();

/** The category key for a file, or null when nothing matches. */
export function documentTypeOf(referenceType, subReferenceType) {
  if (subReferenceType && REFERENCE_TO_CATEGORY.has(`sub:${subReferenceType}`)) {
    return REFERENCE_TO_CATEGORY.get(`sub:${subReferenceType}`);
  }
  if (referenceType && REFERENCE_TO_CATEGORY.has(`ref:${referenceType}`)) {
    return REFERENCE_TO_CATEGORY.get(`ref:${referenceType}`);
  }
  // Reference-less files are hand uploads to the global drive.
  return referenceType ? null : 'upload';
}

/** The display label for a file's category, or null. */
export function documentTypeLabelOf(referenceType, subReferenceType) {
  const key = documentTypeOf(referenceType, subReferenceType);
  return key ? DOCUMENT_TYPE_CATEGORIES[key].label : null;
}
