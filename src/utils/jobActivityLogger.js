import db from "../config/database/models/postgre-models/index.js";
import { formatCamelCaseToReadable } from "./common.js";
import { getChangedFields } from "./activityLogger.js";

const toLogString = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") {
    return val.name || val.label || val.title || JSON.stringify(val);
  }
  return String(val);
};

/**
 * Logs an activity for a job into the job_activity_log table.
 */
export const logJobActivity = async (clientOrTransaction, {
  userId,
  jobId,
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
    const { JobActivityLog } = db.sequelize?.models || db;
    const isTransaction = clientOrTransaction && typeof clientOrTransaction.commit === "function";

    await JobActivityLog.create({
      job_id: jobId,
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
      transaction: isTransaction ? clientOrTransaction : null,
    });
  } catch (error) {
    console.error("[JobActivityLogger] Error logging activity:", error);
  }
};

/**
 * Compares old and new data and logs an entry for each changed field.
 */
export const compareAndLogJobUpdates = async (clientOrTransaction, {
  userId,
  jobId,
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
    await logJobActivity(clientOrTransaction, {
      userId,
      jobId,
      module,
      moduleId,
      recordName,
      action: "UPDATE",
      fieldName: field,
      oldValue,
      newValue,
      description: `Updated ${field} for ${module}`,
      metadata,
    });
  }
};

/**
 * Logs a single UPDATE activity recording only the names of changed fields.
 */
export const logJobUpdatedFieldNames = async (clientOrTransaction, {
  userId,
  jobId,
  module,
  moduleId,
  recordName,
  oldData,
  newData,
  metadata = {},
  ignoreFields = [],
}) => {
  const changes = getChangedFields(oldData, newData, ignoreFields);
  if (changes.length === 0) return;

  const fieldNames = changes
    .map(({ field }) => formatCamelCaseToReadable(field))
    .join(", ");

  await logJobActivity(clientOrTransaction, {
    userId,
    jobId,
    module,
    moduleId,
    recordName,
    action: "UPDATE",
    description: `Updated ${fieldNames}`,
    metadata,
  });
};
