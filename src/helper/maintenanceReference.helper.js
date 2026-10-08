import { randomUUID } from "crypto";

import db from "../config/database/models/postgre-models/index.js";
import { runAcrossAllSampleDataOwners } from "../config/database/models/postgre-models/sampleDataFlag.js";

/** maintenance_request.reference_number is STRING(40). */
export const MAINTENANCE_REF_MAX_LENGTH = 40;

/** The database key `{job reference}-MR{n}` collides on. */
export const MAINTENANCE_REF_UNIQUE_CONSTRAINT =
  "maintenance_request_reference_number_key";

/**
 * Was this error the maintenance reference key being taken by somebody else?
 *
 * Used to retry a create rather than answering the builder with a bare 500. The
 * constraint name is checked rather than the error class alone so an unrelated
 * unique violation on the same table is still raised.
 */
export const isDuplicateMaintenanceReference = (error) => {
  const constraint = error?.parent?.constraint || error?.original?.constraint;
  if (constraint) return constraint === MAINTENANCE_REF_UNIQUE_CONSTRAINT;

  return (
    error?.name === "SequelizeUniqueConstraintError" &&
    Boolean(error?.fields?.reference_number)
  );
};

/**
 * A maintenance-request reference nothing else is using.
 *
 * `maintenance_request.reference_number` carries a GLOBAL unique constraint —
 * not one scoped per company — while the value it is built from is not global
 * at all: job reference numbers are a per-builder sequence, so two companies
 * both reach `LD20260005`, and the sample-data import hands every tenant a
 * clone of the demo account's jobs keeping the demo's own reference numbers.
 * `LD20260005-MR1` is therefore taken by whoever asked for it first, anywhere
 * in the table, and everybody else's insert dies on 23505.
 *
 * The app's own format is `{job reference}-MR{n}` and this keeps it, with a
 * counter suffix added only where that is already taken.
 *
 * The probe reads across every sample-data owner: the row holding the name may
 * belong to a colleague or another tenant, and "is this key free" is a question
 * about the database, not about what this user is allowed to look at.
 */
export async function uniqueMaintenanceReference(base, transaction) {
  const fit = (value) => value.slice(0, MAINTENANCE_REF_MAX_LENGTH);
  const withSuffix = (suffix) =>
    `${base.slice(0, MAINTENANCE_REF_MAX_LENGTH - suffix.length)}${suffix}`;

  let candidate = fit(base);
  for (let attempt = 2; attempt <= 99; attempt += 1) {
    const clash = await runAcrossAllSampleDataOwners(() =>
      db.MaintenanceRequest.findOne({
        where: { reference_number: candidate },
        attributes: ["maintenance_request_id"],
        transaction,
      }),
    );
    if (!clash) return candidate;
    candidate = withSuffix(`-${attempt}`);
  }

  // 98 taken references for one job is not a real scenario; this is only here so
  // the caller can never hang on the probe loop.
  return withSuffix(`-${randomUUID().slice(0, 8)}`);
}

export default uniqueMaintenanceReference;
