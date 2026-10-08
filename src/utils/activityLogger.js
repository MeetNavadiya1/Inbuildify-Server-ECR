import db from "../config/database/models/postgre-models/index.js";
import { formatCamelCaseToReadable } from "./common.js";

const toLogString = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") {
    return val.name || val.label || val.title || JSON.stringify(val);
  }
  return String(val);
};

const BASE_IGNORE_FIELDS = [
  "updated_at", "created_at", "created_by", "updated_by",
  "updatedAt", "createdAt", "createdBy", "updatedBy",
  "is_deleted", "deleted_at", "isDeleted", "deletedAt",
  "id", "leadName", "createdbyname", "recipientName", "lead_name",
  "parentNoteContent", "contactName", "assigneeName",
];

/**
 * Returns the list of fields that actually changed between oldData and newData,
 * applying the shared ignore rules (audit columns and internal IDs).
 * @returns {Array<{ field: string, oldValue: any, newValue: any }>}
 */
export const getChangedFields = (oldData = {}, newData = {}, ignoreFields = []) => {
  const allIgnore = [...BASE_IGNORE_FIELDS, ...ignoreFields];
  const changes = [];

  for (const field in newData) {
    if (allIgnore.includes(field)) continue;

    // User Perspective: Avoid showing internal IDs
    if (field.toLowerCase().endsWith("id") || field.toLowerCase().endsWith("_id")) continue;

    const oldValue = oldData[field];
    const newValue = newData[field];

    const oldStr = toLogString(oldValue);
    const newStr = toLogString(newValue);

    // Check for changes (handling nulls and type differences)
    if (oldStr !== newStr && !(oldValue === null && newValue === undefined) && !(oldValue === undefined && newValue === null)) {
      changes.push({ field, oldValue, newValue });
    }
  }

  return changes;
};

/**
 * Logs an activity into the activity_logs table.
 * Supports both Sequelize transaction and raw calls via the ORM.
 *
 * @param {object} clientOrTransaction - Optional Sequelize transaction object.
 * @param {object} params - The activity log parameters.
 */
export const logActivity = async (clientOrTransaction, {
  userId,
  companyId,
  builderId,
  referenceId,
  referenceType,
  subReferenceId = null,
  subReferenceType = null,
  module,
  moduleId,
  recordName,
  action,
  fieldName = null,
  oldValue = null,
  newValue = null,
  description = null,
  metadata = {},
}) => {
  try {
    const { ActivityLog } = db.sequelize?.models || db;

    // Detect if clientOrTransaction is a Sequelize Transaction
    const isTransaction = clientOrTransaction && typeof clientOrTransaction.commit === "function";

    await ActivityLog.create({
      reference_id: referenceId,
      reference_type: referenceType,
      sub_reference_id: subReferenceId,
      sub_reference_type: subReferenceType,
      company_id: companyId,
      builder_id: builderId,
      user_id: userId,
      module,
      module_id: moduleId,
      record_name: recordName,
      action,
      field_name: fieldName,
      old_value: toLogString(oldValue),
      new_value: toLogString(newValue),
      description,
      metadata: metadata || null,
    }, {
      transaction: isTransaction ? clientOrTransaction : null
    });
  } catch (error) {
    console.error("[ActivityLogger] Error logging activity:", error);
  }
};

/**
 * Compares old and new data and logs an entry for each changed field.
 */
export const compareAndLogUpdates = async (clientOrTransaction, {
  userId,
  companyId,
  builderId,
  referenceId,
  referenceType,
  subReferenceId = null,
  subReferenceType = null,
  module,
  moduleId,
  recordName,
  oldData,
  newData,
  metadata = {},
  ignoreFields = [],
}) => {
  const changes = getChangedFields(oldData, newData, ignoreFields);

  for (const { field, oldValue, newValue } of changes) {
    await logActivity(clientOrTransaction, {
      userId,
      companyId,
      builderId,
      referenceId,
      referenceType,
      subReferenceId,
      subReferenceType,
      module,
      moduleId,
      recordName,
      action: "UPDATE",
      fieldName: field,
      oldValue,
      newValue,
      description: `Updated ${formatCamelCaseToReadable(field)} for ${module || referenceType}`,
      metadata,
    });
  }
};

/**
 * Logs a SINGLE update activity that records only the names of the fields that
 * changed — no old/new value detail. Leaving fieldName null keeps this stored
 * description intact at read-time. Logs nothing when no fields changed.
 */
export const logUpdatedFieldNames = async (clientOrTransaction, {
  userId,
  companyId,
  builderId,
  referenceId,
  referenceType,
  subReferenceId = null,
  subReferenceType = null,
  module,
  moduleId,
  recordName,
  oldData,
  newData,
  metadata = {},
  ignoreFields = [],
}) => {
  const changes = getChangedFields(oldData, newData, ignoreFields);
  if (changes.length === 0) {
    return;
  }

  const fieldNames = changes
    .map(({ field }) => formatCamelCaseToReadable(field))
    .join(", ");

  await logActivity(clientOrTransaction, {
    userId,
    companyId,
    builderId,
    referenceId,
    referenceType,
    subReferenceId,
    subReferenceType,
    module,
    moduleId,
    recordName,
    action: "UPDATE",
    description: `Updated ${fieldNames}`,
    metadata,
  });
};
