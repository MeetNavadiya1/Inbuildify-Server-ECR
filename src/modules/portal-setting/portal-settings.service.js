import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import db from "../../config/database/models/postgre-models/index.js";

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/** Scope condition: match either builder_id or company_id */
const builderOrCompany = (builderId, companyId) => ({
  [Op.or]: [
    ...(builderId ? [{ builder_id: builderId }] : []),
    ...(companyId ? [{ company_id: companyId }] : []),
  ],
});

/**
 * Normalises any truthy string/boolean to a real boolean.
 */
const isFieldTrue = (fieldValue) => {
  if (typeof fieldValue === "string") {
    return fieldValue.toLowerCase() === "true";
  }
  return fieldValue === true;
};

/**
 * Fields that are only permitted when send_login_credentials_to_customer is true.
 */
const LOGIN_CREDS_DEPENDENT_FIELDS = [
  "portal_active_days_after_handover",
  "send_mail_when_portal_inactive",
  "show_site_supervisor_details",
  "show_balance_to_pay",
  "add_notes_enabled",
  "allow_color_selection",
  "show_color_cost",
  "show_construction_stages",
  "auto_share_site_images",
  "show_progress_tab",
  "default_facade_image",
];

/**
 * All boolean keys that can be updated directly (excluding facade image
 * which requires S3 handling, and updated_by which is injected separately).
 */
const UPDATABLE_BOOLEAN_KEYS = [
  "send_login_credentials_to_customer",
  "portal_active_days_after_handover",
  "send_mail_when_portal_inactive",
  "show_site_supervisor_details",
  "show_balance_to_pay",
  "add_notes_enabled",
  "allow_color_selection",
  "show_color_cost",
  "show_construction_stages",
  "auto_share_site_images",
  "show_progress_tab",
  "publish_packages_to_agent_portal",
];

/**
 * Strips internal/audit fields from a plain record object before
 * returning it to the API consumer.
 */
function filterPortalSettingsResponse(plain) {
  const {
    portal_settings_id,
    company_id,
    builder_id,
    created_by,
    updated_by,
    created_at,
    updated_at,
    createdAt,
    updatedAt,
    ...filtered
  } = plain;
  return filtered;
}

// ─── SERVICE: CREATE PORTAL SETTINGS ─────────────────────────────────────────

/**
 * Creates a new PortalSettings row for the builder/company.
 * Enforces login-credentials dependency rules and validates day ranges.
 *
 * @returns {{ data: object }|{ error: { status: number, message: string } }}
 */
export async function createPortalSettingsService({
  builderId,
  companyId,
  userId,
  requestBody,
  default_facade_image,
}) {
  const { PortalSettings, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const {
      send_login_credentials_to_customer,
      portal_active_days_after_handover,
      send_mail_when_portal_inactive,
      show_site_supervisor_details,
      show_balance_to_pay,
      add_notes_enabled,
      allow_color_selection,
      show_color_cost,
      show_construction_stages,
      auto_share_site_images,
      show_progress_tab,
      publish_packages_to_agent_portal,
    } = requestBody;

    // ── Duplicate check ────────────────────────────────────────────────────
    const duplicate = await PortalSettings.findOne({
      where: builderOrCompany(builderId, companyId),
      attributes: ["portal_settings_id"],
      transaction,
    });

    if (duplicate) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: "Portal settings already exist for this builder/company.",
        },
      };
    }

    const isLoginCredsTrue = isFieldTrue(send_login_credentials_to_customer);
    const isAllowColorSelectionTrue = isFieldTrue(allow_color_selection);
    const isShowConstructionStagesTrue = isFieldTrue(show_construction_stages);

    // ── Guard: fields forbidden when login creds is false ─────────────────
    if (!isLoginCredsTrue) {
      for (const fieldName of LOGIN_CREDS_DEPENDENT_FIELDS) {
        if (fieldName in requestBody) {
          await transaction.rollback();
          return {
            error: {
              status: 400,
              message: `Field ${fieldName} cannot be defined when 'send_login_credentials_to_customer' is false. Only 'publish_packages_to_agent_portal' is allowed.`,
            },
          };
        }
      }
    }

    // ── Guard: show_color_cost requires allow_color_selection ──────────────
    if (!isAllowColorSelectionTrue && "show_color_cost" in requestBody) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: "Cannot define 'show_color_cost' unless 'allow_color_selection' is explicitly set to true.",
        },
      };
    }

    // ── Guard: auto_share_site_images requires show_construction_stages ────
    if (!isShowConstructionStagesTrue && "auto_share_site_images" in requestBody) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: "Cannot define 'auto_share_site_images' unless 'show_construction_stages' is explicitly set to true.",
        },
      };
    }

    // ── Guard: portal_active_days_after_handover must be >= 0 ─────────────
    if (
      portal_active_days_after_handover !== undefined &&
      portal_active_days_after_handover < 0
    ) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: "'portal_active_days_after_handover' must be greater than or equal to 0.",
        },
      };
    }

    // ── Insert ─────────────────────────────────────────────────────────────
    const created = await PortalSettings.create(
      {
        company_id: companyId,
        builder_id: builderId,
        send_login_credentials_to_customer: send_login_credentials_to_customer || false,
        portal_active_days_after_handover,
        send_mail_when_portal_inactive: send_mail_when_portal_inactive || false,
        show_site_supervisor_details: show_site_supervisor_details || false,
        show_balance_to_pay: show_balance_to_pay || false,
        add_notes_enabled: add_notes_enabled || false,
        allow_color_selection: allow_color_selection || false,
        show_color_cost: show_color_cost || false,
        show_construction_stages: show_construction_stages || false,
        auto_share_site_images: auto_share_site_images || false,
        show_progress_tab: show_progress_tab || false,
        default_facade_image,
        publish_packages_to_agent_portal: publish_packages_to_agent_portal || false,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();

    return {
      data: keysToCamelCase(filterPortalSettingsResponse(created.get({ plain: true }))),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: UPDATE PORTAL SETTINGS ─────────────────────────────────────────

/**
 * Updates PortalSettings for the builder/company.
 *
 * Two paths:
 *   1. shouldResetAll — send_login_credentials_to_customer is being set to false:
 *      resets all dependent fields to defaults, deletes old facade image from S3,
 *      then optionally updates publish_packages_to_agent_portal.
 *   2. Normal partial update — applies only the fields present in requestBody,
 *      handling S3 deletion for facade image changes.
 *
 * @returns {{ data: object, message: string }|{ error: { status: number, message: string } }}
 */
export async function updatePortalSettingsService({
  builderId,
  companyId,
  updatedBy,
  requestBody,
  newFacadeImageUrl,
}) {
  const { PortalSettings, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    // ── Find existing record ───────────────────────────────────────────────
    const record = await PortalSettings.findOne({
      where: builderOrCompany(builderId, companyId),
      transaction,
    });

    if (!record) {
      await transaction.rollback();
      return {
        error: {
          status: 404,
          message: "Portal settings not found. Please create portal settings first.",
        },
      };
    }

    const existingData = record.get({ plain: true });

    // Merge existing + incoming to evaluate combined state
    const mergedData = { ...existingData, ...requestBody };

    const isLoginCredsTrue = isFieldTrue(mergedData.send_login_credentials_to_customer);
    const isAllowColorSelectionTrue = isFieldTrue(mergedData.allow_color_selection);
    const isShowConstructionStagesTrue = isFieldTrue(mergedData.show_construction_stages);

    // ── Guard: fields forbidden when login creds is false ─────────────────
    if (!isLoginCredsTrue) {
      for (const fieldName of LOGIN_CREDS_DEPENDENT_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(requestBody, fieldName)) {
          await transaction.rollback();
          return {
            error: {
              status: 400,
              message: `Field ${fieldName} cannot be defined when 'send_login_credentials_to_customer' is false. Only 'publish_packages_to_agent_portal' is allowed.`,
            },
          };
        }
      }
    }

    // ── Guard: show_color_cost requires allow_color_selection ──────────────
    if (
      !isAllowColorSelectionTrue &&
      Object.prototype.hasOwnProperty.call(requestBody, "show_color_cost")
    ) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: "Cannot define 'show_color_cost' unless 'allow_color_selection' is explicitly set to true.",
        },
      };
    }

    // ── Guard: auto_share_site_images requires show_construction_stages ────
    if (
      !isShowConstructionStagesTrue &&
      Object.prototype.hasOwnProperty.call(requestBody, "auto_share_site_images")
    ) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: "Cannot define 'auto_share_site_images' unless 'show_construction_stages' is explicitly set to true.",
        },
      };
    }

    // ── Guard: portal_active_days_after_handover must be >= 0 ─────────────
    if (
      mergedData.portal_active_days_after_handover !== undefined &&
      mergedData.portal_active_days_after_handover < 0
    ) {
      await transaction.rollback();
      return {
        error: {
          status: 400,
          message: "'portal_active_days_after_handover' must be greater than or equal to 0.",
        },
      };
    }

    // ── Path 1: Reset all when login creds is being switched to false ──────
    const shouldResetAll =
      Object.prototype.hasOwnProperty.call(requestBody, "send_login_credentials_to_customer") &&
      !isFieldTrue(requestBody.send_login_credentials_to_customer);

    if (shouldResetAll) {
      // Delete old facade image from S3 if present
      if (existingData.default_facade_image) {
        await deleteFromS3(existingData.default_facade_image);
      }

      const resetPayload = {
        send_login_credentials_to_customer: false,
        portal_active_days_after_handover: null,
        send_mail_when_portal_inactive: false,
        show_site_supervisor_details: false,
        show_balance_to_pay: false,
        add_notes_enabled: false,
        allow_color_selection: false,
        show_color_cost: false,
        show_construction_stages: false,
        auto_share_site_images: false,
        show_progress_tab: false,
        default_facade_image: null,
        updated_by: updatedBy,
      };

      // Also update publish_packages_to_agent_portal if provided
      if (Object.prototype.hasOwnProperty.call(requestBody, "publish_packages_to_agent_portal")) {
        resetPayload.publish_packages_to_agent_portal =
          requestBody.publish_packages_to_agent_portal;
      }

      await record.update(resetPayload, { transaction });
      await transaction.commit();

      return {
        data: keysToCamelCase(filterPortalSettingsResponse(record.get({ plain: true }))),
        message: "Portal settings reset and updated successfully due to login credentials being disabled.",
      };
    }

    // ── Path 2: Normal partial update ─────────────────────────────────────
    const updatePayload = {};

    for (const key of UPDATABLE_BOOLEAN_KEYS) {
      if (Object.prototype.hasOwnProperty.call(requestBody, key)) {
        updatePayload[key] = requestBody[key];
      }
    }

    // Handle facade image — delete old from S3 if being replaced or cleared
    const hasNewFacadeImage =
      newFacadeImageUrl !== undefined ||
      Object.prototype.hasOwnProperty.call(requestBody, "default_facade_image");

    if (hasNewFacadeImage) {
      const incomingImage = newFacadeImageUrl ?? requestBody.default_facade_image ?? null;

      if (existingData.default_facade_image && existingData.default_facade_image !== incomingImage) {
        await deleteFromS3(existingData.default_facade_image);
      }

      updatePayload.default_facade_image = incomingImage;
    }

    if (Object.keys(updatePayload).length === 0) {
      await transaction.rollback();
      return { error: { status: 400, message: "No fields provided to update." } };
    }

    updatePayload.updated_by = updatedBy;

    await record.update(updatePayload, { transaction });
    await transaction.commit();

    return {
      data: keysToCamelCase(filterPortalSettingsResponse(record.get({ plain: true }))),
      message: "Portal settings updated successfully.",
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// ─── SERVICE: GET PORTAL SETTINGS ────────────────────────────────────────────

/**
 * Fetches PortalSettings for the builder/company (scoped on BOTH ids, like the original).
 * Auto-creates a default row with all DB defaults if none exists.
 *
 * @returns {{ data: object }}
 */
export async function getPortalSettingsService({ builderId, companyId, userId }) {
  const { PortalSettings, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    let record = await PortalSettings.findOne({
      where: { company_id: companyId, builder_id: builderId },
      transaction,
    });

    if (!record) {
      record = await PortalSettings.create(
        {
          company_id: companyId,
          builder_id: builderId,
          created_by: userId,
          updated_by: userId,
        },
        { transaction },
      );
    }

    await transaction.commit();

    return {
      data: keysToCamelCase(filterPortalSettingsResponse(record.get({ plain: true }))),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
