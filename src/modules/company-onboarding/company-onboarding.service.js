import { env } from "../../config/env.config.js";
import sendEmail from "../../service/sendMail.service.js";
import { wrapAuthEmailHTML } from "../../templates/auth-email.template.js";
import {
  sendInitialVerificationCode,
  throwIfAwaitingVerification,
} from "../auth/email-verification.service.js";
import { encrypt } from "../../utils/crypto.util.js";
import db from "../../config/database/models/postgre-models/index.js";
import { createOrUpdateAddress } from "../../repositories/address.repository.js";
import { seedBuilderDefaults } from "../../seeder/seed-builder-defaults.js";
import { seedCompanyRbac } from "../../seeder/seed-company-rbac.js";
import {
  cloneDriveFileRow,
  cloneImageDriveFile,
  getRawImageColumns,
  isUuid,
  removeImageByRef,
} from "../../helper/imageDriveFile.helper.js";
import {
  cloneFileColumns,
  collectFileValues,
  fileColumnsFor,
} from "../../helper/sampleDataFile.helper.js";
// import { cloneImageDriveFile, isUuid } from "../../helper/imageDriveFile.helper.js";
import {
  cloneDriveFolders,
  cloneDriveFiles,
  deleteSampleDriveData,
} from "../../helper/driveSampleData.helper.js";
import { findOrCreateDriveFolder } from "../../helper/driveFolder.helper.js";
import { uniqueMaintenanceReference } from "../../helper/maintenanceReference.helper.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import { rethrowWithCause } from "../../utils/describeDbError.js";
import {
  runAsSampleDataOwner,
  runSampleDataMaintenance,
  currentSampleDataOwner,
} from "../../config/database/models/postgre-models/sampleDataFlag.js";
import { newPublicToken } from "../../utils/quotationTermsLink.js";
import sampleDataQueue, { SAMPLE_DATA_IMPORT_JOB } from "../../queues/sampleDataQueue.js";
import { reconcileSampleDataRequestsQuietly } from "./sample-data-reconciler.js";
import { Op } from "sequelize";
import { randomUUID } from "crypto";

const COMPANY_ADMIN_ROLE_NAME = "Company Administrator";

/**
 * Sign-up is locked to the "Company Administrator" role. If the caller
 * omits role_id we resolve it; if they pass one that maps to any other
 * role we reject the request.
 */
async function resolveCompanyAdminRoleId(role_id, transaction) {
  const { Role } = db;

  const companyAdminRole = await Role.findOne({
    where: { name: COMPANY_ADMIN_ROLE_NAME, company_id: null },
    attributes: ["role_id"],
    transaction,
  });
  if (!companyAdminRole) {
    throw {
      statusCode: 500,
      message: `"${COMPANY_ADMIN_ROLE_NAME}" role is not seeded. Run the role seeder before signing up.`,
    };
  }

  if (!role_id) {
    return companyAdminRole.role_id;
  }

  if (role_id !== companyAdminRole.role_id) {
    throw {
      statusCode: 400,
      message: `role_id must be the "${COMPANY_ADMIN_ROLE_NAME}" role for company sign-up.`,
    };
  }

  return companyAdminRole.role_id;
}

/**
 * Phase 1 — dedicated company sign-up.
 *
 * Creates Company + Users (root Company Administrator, unverified) only.
 * No Builder is created here — the Company Administrator creates Builders
 * (and any Sales / Site / Admin sub-users under them) from Settings AFTER
 * onboarding completes. Builder-scoped default settings are seeded at that
 * later step, not here.
 */
// export async function companySignUp({ company_name, email, password, name, role_id }) {
/**
 * `options.preVerified` is for the one caller that is not the person signing up:
 * the admin console releasing a landing sign-up request. That account is created
 * already verified and gets no OTP, because a platform admin approved it and the
 * credentials email is what reaches the user. Without it the released account
 * cannot log in at all (`login` rejects `!is_verified`) and a stray OTP email
 * lands next to the credentials one.
 *
 * Self-serve sign-up passes nothing and is unchanged.
 */
export async function companySignUp({
  company_name,
  email,
  password,
  name,
  role_id,
}, options = {}) {
  const preVerified = options.preVerified === true;
  const { Users, Company, Builder, sequelize } = db;
  const lowerEmail = email.toLowerCase();

  const existingUser = await Users.findOne({
    where: sequelize.where(
      sequelize.fn("LOWER", sequelize.col("email")),
      lowerEmail,
    ),
  });
  if (existingUser) {
    // Self-serve only: the admin release path should keep its plain 409.
    if (!preVerified) throwIfAwaitingVerification(existingUser);
    throw { statusCode: 409, message: "A user with this email already exists." };
  }

  const placeholderName =
    name && name.trim().length > 0 ? name.trim() : lowerEmail.split("@")[0];

  const result = await sequelize.transaction(async (t) => {
    const effectiveRoleId = await resolveCompanyAdminRoleId(role_id, t);

    // 1. Company — top-level tenant. Onboarding flag explicitly false.
    const company = await Company.create(
      {
        name: company_name,
        is_onboarding_finished: false,
      },
      { transaction: t },
    );

    // Create a matching Builder record with its builder_id set to company_id
    const builder = await Builder.create(
      {
        builder_id: company.company_id,
        name: company_name,
        company_id: company.company_id,
        email: lowerEmail,
      },
      { transaction: t },
    );

    // Update Company with the new builder_id
    await company.update(
      { builder_id: builder.builder_id },
      { transaction: t },
    );

    // 2. Root Company Administrator user, linked directly to the company and builder.
    const user = await Users.create(
      {
        company_id: company.company_id,
        builder_id: builder.builder_id,
        name: placeholderName,
        email: lowerEmail,
        role_id: effectiveRoleId,
        password: encrypt(password),
        // The verification code is issued after commit by
        // sendInitialVerificationCode, which also starts its throttle.
        root_user: true,
        is_verified: preVerified,
      },
      { transaction: t },
    );

    // Seed default settings for the new builder
    await seedBuilderDefaults({
      company_id: company.company_id,
      builder_id: builder.builder_id,
      created_by: user.users_id,
      transaction: t,
    });

    // P3 — Provision per-company RBAC roles + permissions (§FR-1)
    // Clone global system roles and their permissions into this company so the
    // Company Admin starts with a sensible default they can customise.
    const roleIdMapping = await seedCompanyRbac({
      company_id: company.company_id,
      builder_id: builder.builder_id,
      created_by: user.users_id,
      transaction: t,
    });

    // Update the root user's role_id to the company-scoped copy of
    // "Company Administrator" so that permission lookups (which search by
    // role_id + company_id) hit the right rows.
    const companyAdminRoleId = roleIdMapping && roleIdMapping.get(effectiveRoleId);
    if (companyAdminRoleId) {
      await Users.update(
        { role_id: companyAdminRoleId },
        { where: { users_id: user.users_id }, transaction: t },
      );
    }

    return {
      email: lowerEmail,
      companyId: company.company_id,
      // builderId is what the admin console records on the released request, so
      // it is returned rather than looked up again by the caller.
      builderId: builder.builder_id,
      usersId: user.users_id,
      isOnboardingFinished: false,
    };
  });

  if (!preVerified) {
    result.verificationEmailSent = await sendInitialVerificationCode(result.usersId, lowerEmail);
  }

  return result;
}

/* ─── DUMMY DATA CLONING & RESTORE ENGINE ─────────────────── */

/**
 * Every flagged table the importer seeds, ordered so that a row is deleted
 * before anything it points at: quotation catalog first (items → lists →
 * plans/facades → packages → the type tables those reference), then the
 * Settings masters, whose consumers — colour items pointing at suppliers and
 * colour groups, quotation versions pointing at structural engineers — are all
 * gone by the time this list is walked.
 *
 * `scope: "builder"` marks the handful of tables that carry only builder_id;
 * scoping those by company_id would throw on a column that is not there.
 *
 * Every table here is SHARED: unique on (company_id, builder_id, name), so a
 * second importer reuses the row rather than adding a copy, and it stays visible
 * to the whole company. That is the other half of `OWNER_SCOPED_MODELS` in
 * sampleDataFlag.js, which hides a seeded row from everyone but its owner —
 * adding a model to both lists would hide the lead source off a colleague's
 * demo lead. Anything gaining a per-owner clone below belongs on that list too.
 */
const SAMPLE_CATALOG_ENTITIES = [
  // ── Quotation catalog ──────────────────────────────────────────────────────
  { key: "priceListItems", model: "PriceListItem", pk: "price_list_item_id", nameField: "item_description", label: "Price list item" },
  { key: "priceLists", model: "PriceList", pk: "price_list_id", label: "Price list" },
  { key: "floorPlans", model: "FloorPlan", pk: "floor_plan_id", label: "Floor plan", imageFields: ["detailed_image", "simple_image"] },
  { key: "facades", model: "Facade", pk: "facade_id", label: "Facade", imageFields: ["image"] },
  { key: "packages", model: "Package", pk: "package_id", label: "Package" },
  { key: "packageGroups", model: "PackageGroup", pk: "package_group_id", label: "Package group" },
  { key: "dwellingTypes", model: "DwellingType", pk: "dwelling_type_id", label: "Dwelling type" },
  { key: "ranges", model: "Range", pk: "range_id", label: "Range" },
  { key: "locations", model: "Location", pk: "location_id", label: "Location" },
  // ── Settings masters ───────────────────────────────────────────────────────
  { key: "colors", model: "Color", pk: "color_id", nameField: "color_name", label: "Colour" },
  { key: "colorGroups", model: "ColorGroup", pk: "color_group_id", label: "Colour group" },
  { key: "colorTypes", model: "ColorType", pk: "color_type_id", nameField: "color_type_name", label: "Colour type" },
  { key: "suppliers", model: "Supplier", pk: "supplier_id", nameField: "company_name", label: "Supplier" },
  { key: "supplierTypes", model: "SupplierType", pk: "supplier_type_id", label: "Supplier type" },
  { key: "structureEngineers", model: "StructureEngineer", pk: "structure_engineer_id", label: "Structural engineer" },
  { key: "estates", model: "Estate", pk: "estate_id", label: "Estate" },
  { key: "costCenters", model: "CostCenter", pk: "cost_center_id", label: "Cost centre" },
  { key: "contractFormats", model: "ContractFormat", pk: "contract_format_id", nameField: "format_name", label: "Contract document format" },
  { key: "surveyTemplates", model: "SurveyTemplate", pk: "survey_template_id", label: "Survey template" },
  { key: "quotationFormats", model: "QuotationFormat", pk: "quotation_format_id", nameField: "format_name", label: "Quotation format" },
  { key: "variationApprovals", model: "JobVariationApproval", pk: "job_variation_approval_id", nameField: "amount", label: "Variation approval" },
  { key: "workflowProcesses", model: "WorkflowProcess", pk: "workflow_process_id", label: "Workflow process", scope: "builder" },
  { key: "services", model: "Service", pk: "service_id", nameField: "service", label: "Service", scope: "builder" },
  { key: "leadSources", model: "LeadSource", pk: "lead_source_id", label: "Lead source" },
  { key: "holidays", model: "Holiday", pk: "holiday_id", nameField: "holiday_description", label: "Holiday" },
  { key: "userGroups", model: "UserGroup", pk: "user_group_id", label: "User group" },
  { key: "maintenanceAreas", model: "MaintenanceArea", pk: "maintenance_area_id", label: "Maintenance area" },
  // Every one of these is SHARED, which is why the flag is stamped on the whole
  // list rather than per entry.
  //
  // Each table is unique on (company_id, builder_id, name), so a second copy is
  // not something the schema can hold: the second person to import reuses the
  // rows the first one's import created, and they keep that first owner. Their
  // quotations, colour selections and price lists then all point at rows
  // attributed to a colleague.
  //
  // So "does this account have them?" is not the same question as "did this
  // account import them?". Counting these by owner reported zero floor plans,
  // zero suppliers and zero services to somebody looking at all of them on
  // their own quotations — see `sampleScopeFor` for how they are counted, and
  // the purge for the matching rule about clearing them.
].map((entity) => ({ ...entity, shared: false }));

/**
 * Activity records that carry the flag themselves because they exist with or
 * without a lead / job. They point AT leads and jobs, so they are swept before
 * either is touched.
 *
 * `force` is for the paranoid tables: a soft delete would leave the rows in
 * place, counted out of the summary but still there to double up on the next
 * restore.
 */
const SAMPLE_ACTIVITY_ENTITIES = [
  { key: "tasks", model: "Task", label: "Task" },
  { key: "appointments", model: "Appointment", label: "Appointment" },
  { key: "todos", model: "Todo", label: "To-do" },
  // The global Activity timeline. Its reference columns are polymorphic and
  // carry no foreign key, so nothing pins these rows — but they name leads and
  // jobs, which is why they go before either is deleted.
  { key: "activityLogs", model: "ActivityLog", label: "Activity log", force: true },
  // Site Check-In. Records before fields: a record's `responses` is keyed by
  // field id, so the fields are what make it readable.
  { key: "siteCheckinRecords", model: "SiteCheckinRecord", label: "Site check-in" },
  // The field template is matched on its label and reused, the same as the
  // settings masters above, so it belongs to the company rather than to whoever
  // imported first.
  { key: "siteCheckinFields", model: "SiteCheckinField", label: "Site check-in field", shared: true },
];

/**
 * Records reached from a seeded lead. They have no flag of their own — the lead
 * they hang off is the only thing that makes them sample data — so they are
 * deleted by walking leads_id, deepest first.
 */
const SAMPLE_LEAD_CHILDREN = [
  { key: "leadSms", model: "Sms" },
  { key: "leadNotes", model: "Notes" },
  { key: "leadActions", model: "Actions" },
  { key: "leadActivityLogs", model: "LeadActivityLog" },
  { key: "businessContacts", model: "BusinessContact" },
  // Answers cascade off the response, which is keyed on lead_id.
  { key: "surveyResponses", model: "SurveyResponse", fk: "lead_id" },
];

/**
 * The job colour tree. Every table carries job_id directly, so the whole tree
 * is removed by job id — deepest first, since the colour item and category rows
 * are still referenced while their children exist.
 */
const SAMPLE_JOB_COLOR_CHILDREN = [
  { key: "jobColorSelections", model: "JobColorSelection" },
  { key: "jobColorGroupItemMaps", model: "JobColorGroupItemMap" },
  { key: "jobColorItemCustomFields", model: "JobColorItemCustomField" },
  { key: "jobColorItems", model: "JobColorItem" },
  { key: "jobColorSubCategories", model: "JobColorSubCategory" },
  { key: "jobColorCategories", model: "JobColorCategory" },
  { key: "jobColors", model: "JobColor" },
];

/**
 * Narrow a sweep to one person's seeded rows.
 *
 * Every user the Company Administrator creates inherits the company's single
 * builder_id, so company_id + builder_id is not "this account" — it is the whole
 * company. Without this a user clearing their demo data from Settings → Sample
 * Data took it away from every colleague at once.
 *
 * A null owner is the Company Administrator's company-wide sweep: they own the
 * company's data, so their purge deliberately reaches everyone's.
 */
const sampleOwnerWhere = (ownerId) =>
  ownerId ? { sample_data_owner_id: ownerId } : {};

/**
 * The mirror image: rows an owner-scoped purge will NOT take away.
 *
 * Spelled out as an OR rather than as `NOT (flagged AND mine)` because of the
 * null owner. `NOT (true AND owner = 'X')` is NULL — not TRUE — for a seeded row
 * whose owner column was never filled in, so a row that no purge is entitled to
 * delete would have failed the test that protects it and been cascaded away by
 * the first colleague to clear their own data.
 */
const notOwnedSampleWhere = (ownerId) =>
  ownerId
    ? {
      [Op.or]: [
        { is_sample_data: false },
        { sample_data_owner_id: { [Op.ne]: ownerId } },
        { sample_data_owner_id: null },
      ],
    }
    : { is_sample_data: false };

/**
 * The tenant columns a flagged table can be scoped by, narrowed to one owner.
 *
 * A `shared` entity ignores the owner. Those tables are unique per builder, so
 * the second person to import reuses the first one's rows rather than getting
 * their own — every account with sample data has the same floor plans, the same
 * suppliers, the same services, and they show up on that account's quotations
 * and colour selections whoever's import first created them. Scoping the count
 * by owner told the second person they had none of it.
 */
function sampleScopeFor(entity, companyId, builderId, ownerId) {
  const owner = entity.shared ? {} : sampleOwnerWhere(ownerId);

  return entity.scope === "builder"
    ? { builder_id: builderId, is_sample_data: true, ...owner }
    : {
      company_id: companyId,
      builder_id: builderId,
      is_sample_data: true,
      ...owner,
    };
}

/**
 * Drop DriveFile rows by PK and hand back their S3 keys. The objects themselves
 * are removed by the caller *after* the transaction commits — deleting from S3
 * inside the transaction would leave the files gone if it later rolled back.
 */
async function purgeDriveFileRows(fileIds, transaction) {
  const ids = [...new Set(fileIds.filter(isUuid))];
  if (ids.length === 0) return [];

  const files = await db.DriveFile.findAll({
    where: { file_id: { [Op.in]: ids } },
    attributes: ["file_id", "s3_key"],
    paranoid: false,
    transaction,
  });
  if (files.length === 0) return [];

  await db.DriveFile.destroy({
    where: { file_id: { [Op.in]: files.map((f) => f.file_id) } },
    force: true,
    transaction,
  });

  return files.map((f) => f.s3_key).filter(Boolean);
}

/**
 * The S3 locations a set of rows references, for deletion once the purge's
 * transaction commits.
 *
 * Only for the text file columns — DriveFile-backed images are collected by
 * purgeDriveFileRows instead. Returns [] for a model that owns no files, so it
 * is safe to call unconditionally.
 */
async function collectSampleFiles(modelName, where, transaction) {
  if (fileColumnsFor(modelName).length === 0) return [];

  const rows = await db[modelName].findAll({ where, transaction });
  return collectFileValues(rows, modelName);
}

/** Primary keys of the flagged rows in one table, for one owner. */
async function sampleIdsOf(entity, companyId, builderId, ownerId, transaction) {
  const rows = await db[entity.model].findAll({
    where: sampleScopeFor(entity, companyId, builderId, ownerId),
    attributes: [entity.pk],
    transaction,
  });
  return rows.map(r => r[entity.pk]);
}

const findEntity = (key) => SAMPLE_CATALOG_ENTITIES.find(e => e.key === key);

/**
 * Delete everything hanging off a seeded Settings master.
 *
 * These tables carry no `is_sample_data` of their own — they are only ever
 * reached through the master that owns them — so each level is removed by
 * walking its parent's ids. Order is deepest-first so a row is always gone
 * before the row it points at.
 *
 * Mutates `removed` with a count per table, `skipped` with anything that had to
 * be kept, and pushes onto `s3Keys` the files those rows own — matching the rest
 * of the purge.
 *
 * The masters these hang off are shared: one physical set per builder, reused by
 * everyone who imports. So this walks all of them, not just the caller's, and
 * leans on the foreign keys to protect what a colleague's demo records still
 * need. Each step gets its own SAVEPOINT for exactly that reason — a pinned
 * child rolls back to here and is reported, instead of poisoning the outer
 * transaction and taking the whole purge down with it, which would leave the
 * caller pressing Delete and watching nothing happen.
 */
async function deleteSampleMasterChildren(companyId, builderId, ownerId, removed, skipped, s3Keys, transaction) {
  const idsFor = (key) => sampleIdsOf(findEntity(key), companyId, builderId, ownerId, transaction);
  const destroyBy = async (key, model, column, ids) => {
    removed[key] = removed[key] || 0;
    if (ids.length === 0) return;

    const where = { [column]: { [Op.in]: ids } };
    // Held back until the savepoint commits: pushing S3 keys for rows that then
    // rolled back would delete the objects of records still in the database.
    const pendingKeys = [];

    try {
      await db.sequelize.transaction({ transaction }, async (savepoint) => {
        // Gather the S3 objects before the rows naming them are gone.
        pendingKeys.push(...(await collectSampleFiles(model, where, savepoint)));
        removed[key] += await db[model].destroy({ where, transaction: savepoint });
      });
      s3Keys.push(...pendingKeys);
    } catch (error) {
      skipped.push({
        type: model,
        name: `${ids.length} linked record(s)`,
        reason: error?.parent?.detail || error?.message || "Still referenced by other records",
      });
    }
  };

  // ── Colour master → categories → sub-categories / items → custom fields ────
  const colorIds = await idsFor("colors");
  const colorGroupIds = await idsFor("colorGroups");

  let colorCategoryIds = [];
  if (colorIds.length > 0) {
    const categories = await db.ColorCategory.findAll({
      where: { color_id: { [Op.in]: colorIds } },
      attributes: ["color_category_id"],
      transaction,
    });
    colorCategoryIds = categories.map(c => c.color_category_id);
  }

  let colorItemIds = [];
  if (colorCategoryIds.length > 0) {
    const items = await db.ColorItem.findAll({
      where: { color_category_id: { [Op.in]: colorCategoryIds } },
      attributes: ["color_item_id"],
      transaction,
    });
    colorItemIds = items.map(i => i.color_item_id);
  }

  await destroyBy("colorItemCustomFields", "ColorItemCustomField", "color_item", colorItemIds);
  await destroyBy("colorGroupItemMaps", "ColorGroupItemMap", "color_item_id", colorItemIds);
  // Groups can also be mapped to items the builder owns; those maps go with the
  // seeded group, not with a seeded item.
  await destroyBy("colorGroupItemMaps", "ColorGroupItemMap", "color_group_id", colorGroupIds);
  await destroyBy("colorItems", "ColorItem", "color_category_id", colorCategoryIds);
  await destroyBy("colorSubCategories", "ColorSubCategory", "color_category_id", colorCategoryIds);
  await destroyBy("colorCategories", "ColorCategory", "color_id", colorIds);

  // ── Supplier → type maps, contacts, documents ─────────────────────────────
  const supplierIds = await idsFor("suppliers");
  await destroyBy("supplierTypeMaps", "SupplierSupplierTypeMap", "supplier_id", supplierIds);
  await destroyBy("supplierContacts", "SupplierContacts", "supplier_id", supplierIds);
  await destroyBy("supplierDocuments", "SupplierDocuments", "supplier_id", supplierIds);

  // ── Everything else is a single parent → child hop ─────────────────────────
  // ── Quotation format → custom fields + master section → heading → item ────
  const quotationFormatIds = await idsFor("quotationFormats");
  const masterSectionIds = [];
  if (quotationFormatIds.length > 0) {
    const sections = await db.MasterSection.findAll({
      where: { quotation_format_id: { [Op.in]: quotationFormatIds } },
      attributes: ["master_section_id"],
      transaction,
    });
    masterSectionIds.push(...sections.map(s => s.master_section_id));
  }

  const masterHeaderIds = [];
  if (masterSectionIds.length > 0) {
    const headers = await db.MasterSectionHeader.findAll({
      where: { master_section_id: { [Op.in]: masterSectionIds } },
      attributes: ["master_section_header_id"],
      transaction,
    });
    masterHeaderIds.push(...headers.map(h => h.master_section_header_id));
  }

  await destroyBy("masterSectionItems", "MasterSectionItem", "master_section_header_id", masterHeaderIds);
  await destroyBy("masterSectionHeaders", "MasterSectionHeader", "master_section_id", masterSectionIds);
  await destroyBy("masterSections", "MasterSection", "quotation_format_id", quotationFormatIds);
  await destroyBy("quotationFormatSections", "QuotationFormatCustomSection", "quotation_format_id", quotationFormatIds);

  await destroyBy("workflowProcessTasks", "WorkflowProcessTask", "workflow_process_id", await idsFor("workflowProcesses"));
  await destroyBy("surveyTemplateQuestions", "SurveyTemplateQuestions", "survey_template_id", await idsFor("surveyTemplates"));
  await destroyBy("contractSections", "ContractSection", "contract_format_id", await idsFor("contractFormats"));
  await destroyBy("costCenterChecklistMaps", "CostCenterChecklistMap", "cost_center_id", await idsFor("costCenters"));

  const estateIds = await idsFor("estates");
  await destroyBy("estateImages", "EstateImages", "estate_id", estateIds);
  await destroyBy("estateDocuments", "EstateDocuments", "estate_id", estateIds);
  await destroyBy("estateFeatures", "EstateFeatures", "estate_id", estateIds);
  await destroyBy("estateStages", "EstateStages", "estate_id", estateIds);

  // The package ↔ price list item link. Deleting it by both sides keeps a
  // seeded package from pinning a builder-owned item and vice versa.
  await destroyBy("packagePricelistItemMaps", "PackagePricelistItemMap", "package_id", await idsFor("packages"));
  await destroyBy("packagePricelistItemMaps", "PackagePricelistItemMap", "price_list_item_id", await idsFor("priceListItems"));
}

/**
 * Lead-side records the `leads` cascade does not reach.
 *
 * Split out of the purge so a sync can run the same cascade over the handful of
 * leads the demo account has deleted, rather than over everything this account
 * holds. Both callers need it to behave identically — a second implementation is
 * how the two drift.
 *
 * Counts accumulate rather than overwrite: the purge calls this once with every
 * lead it is clearing, a prune calls it per lead.
 */
async function deleteSampleLeadChildren(leadIds, removed, s3Keys, transaction) {
  if (leadIds.length === 0) return;

  const leadScope = { leads_id: { [Op.in]: leadIds } };

  // Survey answers hang off the response rather than the lead, so they go
  // before the responses below take their parent away.
  const sampleResponses = await db.SurveyResponse.findAll({
    where: { lead_id: { [Op.in]: leadIds } },
    attributes: ["survey_response_id"],
    transaction,
  });
  if (sampleResponses.length > 0) {
    removed.surveyAnswers = (removed.surveyAnswers || 0) + await db.SurveyResponseAnswer.destroy({
      where: {
        survey_response_id: { [Op.in]: sampleResponses.map(r => r.survey_response_id) },
      },
      transaction,
    });
  }

  for (const entity of SAMPLE_LEAD_CHILDREN) {
    // Most of these key on leads_id; survey responses use lead_id.
    const where = { [entity.fk || "leads_id"]: { [Op.in]: leadIds } };
    s3Keys.push(...(await collectSampleFiles(entity.model, where, transaction)));
    removed[entity.key] = (removed[entity.key] || 0) + await db[entity.model].destroy({ where, transaction });
  }

  // Quotation custom sections carry an uploaded file and cascade off the
  // version that deleteSampleQuotationChain removes, so their objects are
  // gathered here while the rows that name them still exist.
  const sampleQuotations = await db.Quotation.findAll({
    where: leadScope,
    attributes: ["quotation_id"],
    transaction,
  });
  const quotationIds = sampleQuotations.map(q => q.quotation_id);
  if (quotationIds.length > 0) {
    const versions = await db.QuotationVersion.findAll({
      where: { quotation_id: { [Op.in]: quotationIds } },
      attributes: ["quotation_version_id"],
      transaction,
    });
    const versionIds = versions.map(v => v.quotation_version_id);
    if (versionIds.length > 0) {
      s3Keys.push(...(await collectSampleFiles(
        "QuotationVersionCustomSection",
        { quotation_version_id: { [Op.in]: versionIds } },
        transaction,
      )));
    }
  }
}

/**
 * The job colour tree and the maintenance chain, both removed deepest-first.
 *
 * Extracted alongside deleteSampleLeadChildren, and for the same reason.
 */
async function deleteSampleJobTrees(jobIds, removed, s3Keys, transaction) {
  if (jobIds.length === 0) return;

  const maintenances = await db.Maintenance.findAll({
    where: { job_id: { [Op.in]: jobIds } },
    attributes: ["maintenance_id"],
    transaction,
  });
  const maintenanceIds = maintenances.map(m => m.maintenance_id);

  if (maintenanceIds.length > 0) {
    const requests = await db.MaintenanceRequest.findAll({
      where: { maintenance_id: { [Op.in]: maintenanceIds } },
      attributes: ["maintenance_request_id"],
      transaction,
    });
    const requestIds = requests.map(r => r.maintenance_request_id);

    if (requestIds.length > 0) {
      removed.maintenanceRequestTasks = (removed.maintenanceRequestTasks || 0) + await db.MaintenanceRequestTask.destroy({
        where: { maintenance_request_id: { [Op.in]: requestIds } },
        transaction,
      });
    }
    const requestScope = { maintenance_id: { [Op.in]: maintenanceIds } };
    s3Keys.push(...(await collectSampleFiles("MaintenanceRequest", requestScope, transaction)));
    removed.maintenanceRequests = (removed.maintenanceRequests || 0) + await db.MaintenanceRequest.destroy({
      where: requestScope,
      transaction,
    });
  }
  removed.maintenances = (removed.maintenances || 0) + await db.Maintenance.destroy({
    where: { job_id: { [Op.in]: jobIds } },
    transaction,
  });

  // Variations and their line items — what the Variation report reads.
  const sampleVariations = await db.JobVariation.findAll({
    where: { job_id: { [Op.in]: jobIds } },
    attributes: ["variation_id"],
    transaction,
  });
  if (sampleVariations.length > 0) {
    removed.variationItems = (removed.variationItems || 0) + await db.JobVariationItem.destroy({
      where: { variation_id: { [Op.in]: sampleVariations.map(v => v.variation_id) } },
      transaction,
    });
  }
  removed.variations = (removed.variations || 0) + await db.JobVariation.destroy({
    where: { job_id: { [Op.in]: jobIds } },
    transaction,
  });

  // The job's audit trail. Keyed by job_id and carries the flag itself, but
  // sweeping by job is enough — every row here belongs to a seeded job.
  removed.jobActivityLogs = (removed.jobActivityLogs || 0) + await db.JobActivityLog.destroy({
    where: { job_id: { [Op.in]: jobIds } },
    transaction,
  });

  const jobScope = { job_id: { [Op.in]: jobIds } };
  for (const entity of SAMPLE_JOB_COLOR_CHILDREN) {
    s3Keys.push(...(await collectSampleFiles(entity.model, jobScope, transaction)));
    removed[entity.key] = (removed[entity.key] || 0) + await db[entity.model].destroy({
      where: jobScope,
      transaction,
    });
  }
}

/**
 * The opportunity → quotation → version tree hanging off a seeded lead.
 *
 * `db.Leads.destroy` was assumed to take this with it. It does not:
 * `opportunity.leads_id` and `quotation.leads_id` are both ON DELETE SET NULL,
 * so deleting the lead unhooks its pipeline instead of removing it, and
 * `quotation_version.quotation_id` does the same one level further down.
 *
 * What that left behind was the whole seeded pipeline — opportunities,
 * quotations, versions and every version item — with no lead to point at. None
 * of those tables carries company_id or builder_id, so the orphan sweep further
 * down cannot reach them either, and the summary counts quotations by walking
 * `leads_id`, which is now null. They stayed in the account permanently,
 * uncounted, with Settings → Sample Data reporting a clean delete, and every
 * restore laid a fresh set on top of them.
 *
 * So the tree is removed explicitly, deepest first, while the lead that names
 * it is still there to find it by.
 *
 * Order matters twice over:
 *
 *   - versions go before their quotation, for the same SET NULL reason. What
 *     hangs under a version — items, custom sections, the package and
 *     price-list maps — is ON DELETE CASCADE and goes with it.
 *   - opportunities go last, because `job.opportunity_id` is ON DELETE CASCADE:
 *     dropping one takes its job with it. The caller sweeps the job trees by
 *     job_id first, and deleting opportunities any earlier would pull the jobs
 *     out from under that sweep and strand `job_activity_log`, whose own job_id
 *     is SET NULL rather than cascading.
 */
async function deleteSampleQuotationChain(leadIds, removed, transaction) {
  if (leadIds.length === 0) return;

  const leadScope = { leads_id: { [Op.in]: leadIds } };

  const quotations = await db.Quotation.findAll({
    where: leadScope,
    attributes: ["quotation_id"],
    transaction,
  });
  const quotationIds = quotations.map(q => q.quotation_id);

  if (quotationIds.length > 0) {
    const versions = await db.QuotationVersion.findAll({
      where: { quotation_id: { [Op.in]: quotationIds } },
      attributes: ["quotation_version_id"],
      transaction,
    });
    const versionIds = versions.map(v => v.quotation_version_id);

    if (versionIds.length > 0) {
      // `force` for the same reason the Activity timeline takes it: a soft
      // delete leaves the row in place, counted out of the summary but still
      // there to double up on the next restore.
      await db.QuotationVersionTerms.destroy({
        where: { quotation_version_id: { [Op.in]: versionIds } },
        transaction,
      });
      removed.quotationVersions = (removed.quotationVersions || 0) + await db.QuotationVersion.destroy({
        where: { quotation_version_id: { [Op.in]: versionIds } },
        force: true,
        transaction,
      });
    }

    removed.quotations = (removed.quotations || 0) + await db.Quotation.destroy({
      where: { quotation_id: { [Op.in]: quotationIds } },
      force: true,
      transaction,
    });
  }

  removed.opportunities = (removed.opportunities || 0) + await db.Opportunity.destroy({
    where: leadScope,
    force: true,
    transaction,
  });
}

/**
 * The leads themselves, the contacts that hung off them, and the PropertyDetail
 * each one pointed at.
 *
 * Extracted alongside deleteSampleLeadChildren, and for the same reason.
 */
async function deleteSampleLeadRows(leadIds, propertyDetailIds, removed, s3Keys, transaction) {
  if (leadIds.length > 0) {
    // Before the lead goes: it is the only thing that still identifies its own
    // pipeline, which the lead delete unhooks rather than removes.
    await deleteSampleQuotationChain(leadIds, removed, transaction);

    const contactMaps = await db.LeadsContactMap.findAll({
      where: { leads_id: { [Op.in]: leadIds } },
      transaction
    });
    const mappedContactIds = [...new Set(contactMaps.map(m => m.contact_id).filter(Boolean))];

    // A contact can sit on more than one lead. One that a lead OUTSIDE this
    // sweep still maps to is kept: deleting the user cascades the surviving
    // lead's map row away with it, so that lead would quietly lose a contact it
    // still has every right to.
    //
    // The purge clears all its leads in one call and rarely meets this; a sync
    // pruning one lead at a time meets it whenever the demo account shares a
    // contact, which is why the rule lives here rather than at the call site.
    let contactIds = mappedContactIds;
    if (mappedContactIds.length > 0) {
      const heldElsewhere = await db.LeadsContactMap.findAll({
        where: {
          contact_id: { [Op.in]: mappedContactIds },
          leads_id: { [Op.notIn]: leadIds },
        },
        attributes: ["contact_id"],
        transaction,
      });
      const keep = new Set(heldElsewhere.map(m => m.contact_id));
      contactIds = mappedContactIds.filter(id => !keep.has(id));
    }

    let addressIds = [];
    if (contactIds.length > 0) {
      const contactUsers = await db.Users.findAll({
        where: { users_id: { [Op.in]: contactIds } },
        attributes: ["address_id"],
        transaction
      });
      addressIds = contactUsers.map(u => u.address_id).filter(Boolean);
    }

    // The lead itself. Its pipeline was removed just above — deleting the lead
    // only nulls those references, it does not take them away.
    removed.leads = (removed.leads || 0) + await db.Leads.destroy({
      where: { leads_id: { [Op.in]: leadIds } },
      transaction
    });

    // Delete contact users
    if (contactIds.length > 0) {
      removed.contacts = (removed.contacts || 0) + await db.Users.destroy({
        where: { users_id: { [Op.in]: contactIds } },
        transaction
      });
    }

    // Delete contact user addresses
    if (addressIds.length > 0) {
      await db.Address.destroy({
        where: { address_id: { [Op.in]: addressIds } },
        transaction
      });
    }
  }

  // PropertyDetail is referenced *by* the lead, so it survives that cascade
  // and has to go explicitly — along with its compaction report file.
  if (propertyDetailIds.length > 0) {
    const details = await db.PropertyDetail.findAll({
      where: { property_detail_id: { [Op.in]: propertyDetailIds } },
      attributes: ["property_detail_id", "compaction_report_url"],
      transaction,
      skipImageResolve: true,
    });

    s3Keys.push(
      ...(await purgeDriveFileRows(details.map(d => d.compaction_report_url), transaction)),
    );

    removed.propertyDetails = (removed.propertyDetails || 0) + await db.PropertyDetail.destroy({
      where: { property_detail_id: { [Op.in]: propertyDetailIds } },
      transaction,
    });
  }
}

/**
 * Purge everything the sample-data importer created for this company: the
 * flagged leads (and all that cascades off them) plus the flagged catalog rows
 * and their images.
 *
 * Catalog rows are deleted one at a time inside a SAVEPOINT. A seeded floor plan
 * the builder has since used on a real quotation can be pinned by a foreign key;
 * that row is skipped and reported instead of aborting the whole purge, so the
 * rest of the sample data still goes away.
 *
 * `ownerId` is whose sample data this clears. Everyone under a company shares
 * one builder_id, so without it the sweep is company-wide and one user's
 * "Delete sample data" takes their colleagues' demo records with it. Pass null
 * only for the Company Administrator, whose purge is meant to reach everything.
 *
 * @returns {Promise<{removed: object, skipped: object[], s3Keys: string[]}>}
 *   `s3Keys` must be deleted from S3 by the caller once the transaction commits.
 */
// Exported for the same reason importDummyProjectData is: so a diagnostic can
// dry-run the whole purge inside a transaction it rolls back. Callers that mean
// to keep the result should use removeCompanySampleData, which owns the
// transaction, the S3 cleanup and the maintenance context.
export async function deleteCompanySampleData(companyId, builderId, ownerId, transaction) {
  const scope = {
    company_id: companyId,
    builder_id: builderId,
    is_sample_data: true,
    ...sampleOwnerWhere(ownerId),
  };
  const removed = { leads: 0, contacts: 0, propertyDetails: 0 };
  const skipped = [];
  const s3Keys = [];

  const sampleLeads = await db.Leads.findAll({
    where: scope,
    attributes: ["leads_id", "property_detail_id"],
    transaction,
  });
  const leadIds = sampleLeads.map(l => l.leads_id);
  const propertyDetailIds = sampleLeads.map(l => l.property_detail_id).filter(Boolean);

  // Jobs carry the flag directly, which also catches any whose lead was deleted
  // by hand — their colour and maintenance rows would otherwise be stranded.
  const sampleJobs = await db.Job.findAll({
    where: scope,
    attributes: ["job_id"],
    transaction,
  });
  const jobIds = sampleJobs.map(j => j.job_id);

  // 1. Lead-side records the cascade does not reach. Notes go before the tasks
  //    swept in step 2 — a note can be the follow-up attached to one.
  await deleteSampleLeadChildren(leadIds, removed, s3Keys, transaction);

  // 2. Standalone activity records — tasks, appointments, to-dos, the global
  //    Activity timeline and Site Check-In. These point at leads and jobs, so
  //    they go before either — a lead delete would otherwise trip their foreign
  //    key.
  for (const entity of SAMPLE_ACTIVITY_ENTITIES) {
    // A `shared` entity (the check-in field template) is swept tenant-wide —
    // there is one set of them per builder, so scoping by owner would leave the
    // second account's Delete reporting rows it never removed.
    const where = sampleScopeFor(entity, companyId, builderId, ownerId);
    s3Keys.push(...(await collectSampleFiles(entity.model, where, transaction)));
    removed[entity.key] = await db[entity.model].destroy({
      where,
      ...(entity.force ? { force: true } : {}),
      transaction,
    });
  }

  // 3. The job colour tree and the maintenance chain. Both hang off a seeded
  //    job and are removed deepest-first.
  await deleteSampleJobTrees(jobIds, removed, s3Keys, transaction);

  // 4. Leads, and the opportunity → quotation → version tree they name. That
  //    tree is unhooked rather than removed by the lead delete (SET NULL, not
  //    CASCADE), so it goes explicitly and first — see
  //    deleteSampleQuotationChain. Jobs cascade off the opportunity.
  // 5. PropertyDetail is referenced *by* the lead, so it survives the delete
  //    and has to go explicitly — along with its compaction report file.
  await deleteSampleLeadRows(leadIds, propertyDetailIds, removed, s3Keys, transaction);

  // 6. Orphaned seeded rows — flagged records whose parent chain was already
  //    broken (a lead deleted by hand, an interrupted purge), so the cascade
  //    above never reached them. Left behind they would double up on the next
  //    restore. Only tables carrying company_id + builder_id can be swept by
  //    flag alone: without that scope this would reach into other tenants'
  //    sample data. Job children (sub-stages, tasks, invoices) cascade off Job.
  for (const entry of [
    { key: "orphanJobs", model: "Job" },
    { key: "orphanContacts", model: "Users" },
  ]) {
    removed[entry.key] = await db[entry.model].destroy({
      where: scope,
      transaction,
    });
  }

  // 7. Children of the seeded Settings masters. They carry no flag — the master
  //    above them is what makes them sample data — so each level is deleted by
  //    walking its parent's ids, deepest first, before the masters themselves
  //    are swept below.
  await deleteSampleMasterChildren(
    companyId, builderId, ownerId, removed, skipped, s3Keys, transaction,
  );

  // 8. Seeded catalog and Settings masters, children first.
  for (const entity of SAMPLE_CATALOG_ENTITIES) {
    const model = db[entity.model];
    const nameField = entity.nameField || "name";
    const imageFields = entity.imageFields || [];
    // Suppliers and estates keep their files as plain S3 text rather than as a
    // DriveFile row, so those columns have to be selected here too — a column
    // left out of `attributes` cannot have its object collected.
    const fileFields = fileColumnsFor(entity.model);
    removed[entity.key] = 0;

    const rows = await model.findAll({
      where: sampleScopeFor(entity, companyId, builderId, ownerId),
      attributes: [entity.pk, nameField, ...imageFields, ...fileFields],
      transaction,
      skipImageResolve: true,
    });

    for (const row of rows) {
      const pendingKeys = [];
      try {
        // Nested transaction === SAVEPOINT: a row pinned by a foreign key rolls
        // back to here instead of poisoning the outer transaction.
        await db.sequelize.transaction({ transaction }, async (savepoint) => {
          await model.destroy({
            where: { [entity.pk]: row[entity.pk] },
            transaction: savepoint,
          });
          pendingKeys.push(
            ...(await purgeDriveFileRows(imageFields.map(f => row[f]), savepoint)),
            ...collectFileValues([row], entity.model),
          );
        });
        removed[entity.key] += 1;
        s3Keys.push(...pendingKeys);
      } catch (error) {
        skipped.push({
          type: entity.label,
          name: row[nameField] || row[entity.pk],
          reason: error?.parent?.detail || error?.message || "Still referenced by other records",
        });
      }
    }
  }

  // 8b. The seeded Terms & Conditions document.
  //
  //     Not in SAMPLE_CATALOG_ENTITIES: those are the masters the UI counts and
  //     badges, and this one is never shown as a record of its own — it is the
  //     document the demo quotations resolve to, and it goes when they do. The
  //     per-quotation snapshots that pointed at it were already removed with
  //     their quotation versions in step 4, so nothing is left referencing it.
  //
  //     Swept by flag + owner like everything else here, which is what keeps it
  //     off the builder's OWN document — that one is not sample data and this
  //     purge must never reach it.
  removed.quotationTerms = await db.QuotationTerms.destroy({
    where: scope,
    transaction,
  });

  // 9. Whatever cloned files are left. The steps above only chase the image
  //    columns they know about (floor plan, facade, compaction report), but the
  //    importer also copies the structural engineer's report, the engineering
  //    requirement and the generated colour PDFs, and the QuotationVersion hook
  //    clones a facade / floor-plan image per version. Every one of those rows
  //    is flagged, so this sweeps them by flag rather than by chasing each
  //    column. Row-at-a-time inside a SAVEPOINT for the same reason as above: a
  //    file still pinned by a catalog row that had to be kept is left alone.
  const strayFiles = await db.DriveFile.findAll({
    where: scope,
    attributes: ["file_id", "s3_key", "file_name"],
    paranoid: false,
    transaction,
  });
  removed.driveFiles = 0;
  for (const file of strayFiles) {
    try {
      await db.sequelize.transaction({ transaction }, async (savepoint) => {
        await db.DriveFile.destroy({
          where: { file_id: file.file_id },
          force: true,
          transaction: savepoint,
        });
      });
      removed.driveFiles += 1;
      if (file.s3_key) s3Keys.push(file.s3_key);
    } catch (error) {
      skipped.push({
        type: "File",
        name: file.file_name || file.file_id,
        reason: error?.parent?.detail || error?.message || "Still referenced by other records",
      });
    }
  }

  // 10. The Drive folders those files sat in, after the files themselves.
  //
  //     drive_files.folder_id cascades, so dropping a seeded folder the builder
  //     has since filed their own document in would take that document with it.
  //     The tree is walked depth-first and a folder is kept — and reported —
  //     whenever it, or anything below it, still holds something they own.
  //     `force` because Drive is paranoid: a soft delete leaves it showing.
  removed.driveFolders = 0;
  const sampleFolders = await db.Drive.findAll({
    where: scope,
    attributes: ["drive_id", "name", "parent_id"],
    transaction,
  });

  const childFolders = new Map();
  for (const folder of sampleFolders) {
    const key = folder.parent_id || "__root__";
    if (!childFolders.has(key)) childFolders.set(key, []);
    childFolders.get(key).push(folder);
  }

  /** @returns {Promise<boolean>} true when the folder had to be kept */
  const purgeFolder = async (folder) => {
    let keptBelow = false;
    for (const child of childFolders.get(folder.drive_id) || []) {
      if (await purgeFolder(child)) keptBelow = true;
    }

    // Anything this purge is not taking away: the builder's own uploads, and —
    // now that a folder is shared while its contents are not — a colleague's
    // seeded documents. Either one makes the folder theirs to keep, because
    // dropping the folder would cascade onto the files inside it.
    const documentsKept = await db.DriveFile.count({
      where: { folder_id: folder.drive_id, ...notOwnedSampleWhere(ownerId) },
      // Trash counts. Dropping the folder cascades onto everything filed under
      // it, and a document in Trash is one the owner can still restore.
      paranoid: false,
      transaction,
    });
    if (keptBelow || documentsKept > 0) {
      skipped.push({ type: "Folder", name: folder.name, reason: "Holds documents you added" });
      return true;
    }

    await db.Drive.destroy({ where: { drive_id: folder.drive_id }, force: true, transaction });
    removed.driveFolders += 1;
    return false;
  };

  const seededFolderIds = new Set(sampleFolders.map(f => f.drive_id));
  for (const folder of sampleFolders) {
    // Walk each subtree once, from its topmost seeded folder.
    if (folder.parent_id && seededFolderIds.has(folder.parent_id)) continue;
    await purgeFolder(folder);
  }
  // 5. The seeded S Drive — files first, then the folders that held them.
  //    Last, because the catalog and lead purges above own the foreign keys
  //    that point at some of these files; dropping the files first would hit
  //    those constraints.
  const drive = await deleteSampleDriveData(companyId, builderId, ownerId, transaction);
  Object.assign(removed, drive.removed);
  skipped.push(...drive.skipped);
  s3Keys.push(...drive.s3Keys);

  return { removed, skipped, s3Keys };
}

/**
 * Clone one Settings master from the demo builder.
 *
 * A row whose natural key already exists under the target builder is reused
 * rather than copied — the same rule the catalog clone below follows — so
 * running the import twice never doubles up and never overwrites something the
 * builder has since edited. Only rows actually created are tagged
 * `is_sample_data`, which is what keeps the purge off the builder's own data.
 *
 * @param {string} modelName            key in `db`
 * @param {object} spec
 * @param {string} spec.pk              primary key column
 * @param {string[]} spec.matchOn       columns forming the natural key
 * @param {object} spec.sourceWhere     which rows to read from the demo builder
 * @param {object} spec.targetWhere     tenant scope for the "already there?" lookup
 * @param {object} spec.ownership       tenant + audit columns stamped on every copy
 * @param {(row: object) => object} [spec.remap]  foreign keys to rewrite on the copy
 * @returns {Promise<{all: Record<string,string>, created: Record<string,string>}>}
 *   `all` maps every source id to its target id (reused rows included);
 *   `created` holds only the rows this import inserted — children are cloned
 *   against that one, so a reused master keeps the children it already has.
 */
async function cloneMasterRows(modelName, spec, transaction) {
  const model = db[modelName];
  const all = {};
  const created = {};

  const extraFields = {};
  if (model?.rawAttributes?.sample_data_owner_id) {
    const owner = currentSampleDataOwner();
    if (owner) extraFields.sample_data_owner_id = owner;
  }

  const rows = await model.findAll({ where: spec.sourceWhere, transaction });
  for (const row of rows) {
    const plain = row.get({ plain: true });

    const lookup = { ...spec.targetWhere };
    for (const field of spec.matchOn) lookup[field] = plain[field];

    let target = await model.findOne({ where: lookup, transaction });
    if (!target) {
      target = await model.create(
        {
          ...plain,
          [spec.pk]: undefined,
          ...spec.ownership,
          ...extraFields,
          // `remap` may be async — it is where file columns are copied.
          ...(spec.remap ? await spec.remap(plain) : {}),
          ...(await cloneFileColumns(plain, modelName)),
          is_sample_data: true,
        },
        { transaction },
      );
      created[plain[spec.pk]] = target[spec.pk];
    } else {
      await target.update(
        {
          ...plain,
          [spec.pk]: undefined,
          ...spec.ownership,
          ...extraFields,
          ...(spec.remap ? await spec.remap(plain) : {}),
          ...(await cloneFileColumns(plain, modelName)),
          is_sample_data: true,
        },
        { transaction },
      );
    }
    all[plain[spec.pk]] = target[spec.pk];
  }

  return { all, created };
}

/**
 * Copy every child row of an already-cloned parent.
 *
 * Children have no natural key to match on, so they are always inserted fresh —
 * pass the parent's `created` mapping (not `all`) so a master that was reused
 * rather than copied keeps the children it already has.
 *
 * @returns {Promise<Record<string,string>>} sourceId → targetId, empty when the
 *   table has no single-column primary key worth mapping.
 */
async function cloneChildRows(modelName, spec, transaction) {
  const parentIds = Object.keys(spec.parentMapping);
  const mapping = {};
  if (parentIds.length === 0) return mapping;

  const extraFields = {};
  if (db[modelName]?.rawAttributes?.sample_data_owner_id) {
    const owner = currentSampleDataOwner();
    if (owner) extraFields.sample_data_owner_id = owner;
  }

  const rows = await db[modelName].findAll({
    where: { [spec.parentKey]: { [Op.in]: parentIds }, ...(spec.extraWhere || {}) },
    transaction,
  });

  for (const row of rows) {
    const plain = row.get({ plain: true });
    const targetParentId = spec.parentMapping[plain[spec.parentKey]];
    if (!targetParentId) continue;

    const clone = await db[modelName].create(
      {
        ...plain,
        ...(spec.pk ? { [spec.pk]: undefined } : {}),
        [spec.parentKey]: targetParentId,
        ...(spec.ownership || {}),
        ...extraFields,
        ...(spec.remap ? await spec.remap(plain) : {}),
        // Own copy of any file this row references — see sampleDataFile.helper.
        ...(await cloneFileColumns(plain, modelName)),
        // Every table the importer writes into carries the flag, children and
        // link tables included, so a seeded row can answer "am I sample data?"
        // without walking a foreign key back to its parent.
        is_sample_data: true,
      },
      { transaction },
    );
    if (spec.pk) mapping[plain[spec.pk]] = clone[spec.pk];
  }

  return mapping;
}

/**
 * Copy the demo account's Documents — the Drive folder tree plus every file in
 * drive_files, which is what the Documents screen lists (a flat list across all
 * jobs, leads and the global drive, ignoring folder structure).
 *
 * Files are matched to their new owner through `reference_type`: a facade image
 * follows its facade, a quotation PDF its version, an uploaded document its job
 * or lead. A file whose owner this import did not clone is skipped — there is
 * nothing for it to belong to. Every copy gets its own S3 object.
 *
 * @param {object} ctx.referenceMappings  reference_type → { sourceId: targetId }
 */
async function cloneDriveDocuments(ctx, transaction) {
  const {
    sourceBuilderScope, targetCompanyId, targetBuilderId, targetUserId,
    referenceMappings, leadMapping, driveFolderMapping = {},
  } = ctx;

  // ── Folders ────────────────────────────────────────────────────────────────
  const folders = await db.Drive.findAll({
    // Trash included — Drive is paranoid, so the default scope left the demo
    // account's trashed documents behind entirely.
    paranoid: false,
    where: sourceBuilderScope,
    order: [["created_at", "ASC"]],
    transaction,
  });

  const sourceFolderIds = new Set(folders.map(f => f.drive_id));
  const folderMapping = {};
  let pending = folders;

  /**
   * Where a source folder's contents belong on this side.
   *
   * The query above reads `sourceBuilderScope` — `builder_id IN (…)` — and the
   * generated report buckets are company-level, builder_id NULL (see migration
   * 20260811120000). So not one of them is in `folders`, and every file filed
   * in one resolved to no folder at all and was written with folder_id NULL:
   * present in the Documents list, invisible in My Drive, which lists strictly
   * by folder. Worse, the folder-less copy holds the polymorphic tuple, so the
   * `cloneDriveFiles` pass at the end of the import — which does see those
   * buckets — recognised the source file as already imported and skipped it.
   * The bucket therefore arrived empty rather than merely unsorted.
   *
   * `driveFolderMapping` is the map `cloneDriveFolders` built before the entity
   * clone; it covers every reference-less folder, buckets included. The local
   * map still comes first, because it is the one that holds the entity trees.
   */
  const mappedFolderId = (sourceFolderId) =>
    (sourceFolderId && (folderMapping[sourceFolderId] || driveFolderMapping[sourceFolderId])) || null;

  while (pending.length > 0) {
    const deferred = [];
    for (const folder of pending) {
      // Wait for the parent. A parent outside this set — or none — makes the
      // copy a root folder.
      const parentId = folder.parent_id;
      if (parentId && sourceFolderIds.has(parentId) && !folderMapping[parentId]) {
        deferred.push(folder);
        continue;
      }

      // An entity-scoped folder whose owner was not cloned has no home here.
      const ownerMapping = referenceMappings[folder.reference_type];
      const targetReferenceId = folder.reference_id ? ownerMapping?.[folder.reference_id] : null;
      if (folder.reference_id && !targetReferenceId) continue;

      // Through the shared resolver, never a bare create: this ran once per
      // import and made a fresh copy of every folder each time, which is how an
      // account that imported twice ended up with two of each. Anything the
      // target already has — a report bucket a PDF created on demand, a folder
      // an earlier import left behind — is reused.
      const clone = await findOrCreateDriveFolder({
        name: folder.name,
        parentId: mappedFolderId(parentId),
        companyId: targetCompanyId,
        builderId: targetBuilderId,
        referenceId: targetReferenceId,
        referenceType: folder.reference_type,
        createdBy: targetUserId,
        // A trashed source arrives in Trash rather than in the Documents tab —
        // and must not pull a matching folder back out of the target's Trash.
        restoreTrashed: !folder.deleted_at,
        // Only the folder's own presentation is carried across. Every id on the
        // source row belongs to the source tenant and is set above.
        defaults: {
          is_starred: folder.is_starred,
          sort_order: folder.sort_order,
          deleted_at: folder.deleted_at || null,
          is_sample_data: true,
        },
        transaction,
      });
      folderMapping[folder.drive_id] = clone.drive_id;
    }

    // Nothing resolved this pass — a parent cycle. Stop rather than spin.
    if (deferred.length === pending.length) break;
    pending = deferred;
  }

  // ── Files ──────────────────────────────────────────────────────────────────
  const files = await db.DriveFile.findAll({
    // Trash included, as above.
    paranoid: false,
    where: sourceBuilderScope,
    transaction,
  });

  const contentKeyOf = (folderId, referenceType, name, size) =>
    (folderId ? `${folderId}|${referenceType ?? ""}|${name ?? ""}|${size ?? ""}` : null);

  const alreadyHere = await db.DriveFile.findAll({
    where: {
      company_id: targetCompanyId,
      is_sample_data: true,
      sample_data_owner_id: targetUserId,
    },
    attributes: [
      "file_id", "folder_id", "original_name", "size", "lead_id",
      "reference_id", "reference_type", "sub_reference_id", "sub_reference_type",
      "deleted_at", "created_at",
    ],
    // Trash counts. A copy the builder has thrown away is still a copy, and
    // handing back a document they went out of their way to bin is not a favour.
    paranoid: false,
    transaction,
    raw: true,
  });

  const takenContent = new Map();
  for (const row of alreadyHere) {
    const key = contentKeyOf(row.folder_id, row.reference_type, row.original_name, row.size);
    if (!key) continue;
    const held = takenContent.get(key);
    if (!held) {
      takenContent.set(key, row);
      continue;
    }
    // Which copy the repoint below should land on when a past sync left several.
    // A live row beats a trashed one — that is the copy the record's Documents
    // tab actually reads — and among equals the oldest wins, which is the same
    // row migration 20260818180000 keeps.
    const heldTrashed = Boolean(held.deleted_at);
    const rowTrashed = Boolean(row.deleted_at);
    if (heldTrashed !== rowTrashed) {
      if (heldTrashed) takenContent.set(key, row);
      continue;
    }
    if (new Date(row.created_at || 0) < new Date(held.created_at || 0)) {
      takenContent.set(key, row);
    }
  }

  /** Live rows already holding a polymorphic tuple, which is unique among them. */
  const takenTuples = new Set(
    alreadyHere
      .filter((row) => !row.deleted_at && row.reference_id && row.reference_type && row.sub_reference_type)
      .map((row) => `${row.reference_id}|${row.reference_type}|${row.sub_reference_type}`),
  );

  const repointClone = async (row, next) => {
    if (!row.file_id) return;
    if (!next.referenceId || !next.referenceType) return;
    if (row.reference_id === next.referenceId && row.reference_type === next.referenceType) return;

    if (next.subReferenceType) {
      const tuple = `${next.referenceId}|${next.referenceType}|${next.subReferenceType}`;
      if (takenTuples.has(tuple)) return;
      takenTuples.add(tuple);
    }

    await db.DriveFile.update(
      {
        reference_id: next.referenceId,
        reference_type: next.referenceType,
        sub_reference_type: next.subReferenceType,
        ...(next.leadId ? { lead_id: next.leadId } : {}),
      },
      // `paranoid: false`: the surviving copy may be one the builder binned, and
      // a trashed row Sequelize refuses to update is a row that comes back out of
      // Trash still naming a maintenance that was thrown away two syncs ago.
      { where: { file_id: row.file_id }, paranoid: false, transaction },
    );

    row.reference_id = next.referenceId;
    row.reference_type = next.referenceType;
    row.sub_reference_type = next.subReferenceType;
  };

  for (const file of files) {
    const source = file.get({ plain: true });
    let targetReferenceId = null;

    if (source.reference_id) {
      targetReferenceId = referenceMappings[source.reference_type]?.[source.reference_id] || null;
      // Owner not cloned (or an entity this importer does not cover, such as a
      // building contract) — nothing to attach the copy to.
      if (!targetReferenceId) continue;
    }

    const folderId = mappedFolderId(source.folder_id);
    const targetLeadId = leadMapping[source.lead_id] || null;

    // The catch-all, first: it is the only check that recognises a document
    // whose record this sync has just rebuilt, and the only one that can hand
    // the surviving copy its new reference.
    const identity = contentKeyOf(folderId, source.reference_type, source.original_name, source.size);
    const alreadyCloned = identity ? takenContent.get(identity) : null;
    if (alreadyCloned) {
      await repointClone(alreadyCloned, {
        referenceId: targetReferenceId,
        referenceType: source.reference_type,
        subReferenceType: source.sub_reference_type,
        leadId: targetLeadId,
      });
      continue;
    }

    // Files carrying a sub_reference_type are the generated reports and images
    // already cloned alongside the row that owns them, and the partial unique
    // index on (reference_id, reference_type, sub_reference_type) would reject
    // a second one. Uploaded documents have no sub_reference_type, so they are
    // matched on name instead to keep a re-run from doubling up.
    const duplicateWhere = source.sub_reference_type
      ? {
        reference_id: targetReferenceId,
        reference_type: source.reference_type,
        sub_reference_type: source.sub_reference_type,
      }
      : {
        builder_id: targetBuilderId,
        original_name: source.original_name,
        reference_id: targetReferenceId,
        is_sample_data: true,
      };

    const exists = await db.DriveFile.findOne({
      where: duplicateWhere,
      attributes: ["file_id"],
      // A clone already sitting in Trash still counts as brought across; without
      // this a sync would hand back every trashed document a second time, and
      // the copy would land live.
      paranoid: false,
      transaction,
    });
    if (exists) continue;

    const createdFileId = await cloneDriveFileRow({
      source,
      companyId: targetCompanyId,
      builderId: targetBuilderId,
      uploadedBy: targetUserId,
      folderId,
      referenceId: targetReferenceId,
      leadId: targetLeadId,
      deletedAt: source.deleted_at || null,
    }, transaction);

    // Claim the identity even when the S3 copy failed and nothing was written:
    // the source's own duplicates within this one run must not each get a try.
    if (identity) {
      takenContent.set(identity, {
        file_id: createdFileId,
        folder_id: folderId,
        original_name: source.original_name,
        size: source.size,
        reference_id: targetReferenceId,
        reference_type: source.reference_type,
        sub_reference_type: source.sub_reference_type,
        deleted_at: source.deleted_at || null,
      });
    }
    if (targetReferenceId && source.reference_type && source.sub_reference_type && !source.deleted_at) {
      takenTuples.add(`${targetReferenceId}|${source.reference_type}|${source.sub_reference_type}`);
    }
  }
}

/**
 * An email address nothing else is using.
 *
 * Staff copied from the demo account keep their address where it is free. Where
 * it is not — the demo account itself holds it — a numbered variant is used so
 * the person is still recognisable (`sam@acme.com` → `sam+sample2@acme.com`).
 */
async function uniqueSampleEmail(email, transaction) {
  const [localPart, domain] = String(email || "").split("@");
  if (!domain) return `sample-${randomUUID().slice(0, 8)}@example.com`;

  const isTaken = async (candidate) => Boolean(await db.Users.findOne({
    where: db.sequelize.where(
      db.sequelize.fn("LOWER", db.sequelize.col("email")),
      candidate.toLowerCase(),
    ),
    attributes: ["users_id"],
    transaction,
  }));

  if (!(await isTaken(email))) return email;

  for (let attempt = 2; attempt <= 99; attempt += 1) {
    const candidate = `${localPart}+sample${attempt}@${domain}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${localPart}+${randomUUID().slice(0, 8)}@${domain}`;
}

/**
 * Clone the demo account's team.
 *
 * Nothing did this before: every assignee, supervisor and group member on
 * seeded records collapsed onto whoever ran the import, so the demo data had
 * one person doing everything. With the team copied, those fields point at the
 * person they were meant to.
 *
 * These are display-and-assignment records, not usable logins — the password is
 * dropped and verification cleared, so none of them can authenticate. The demo
 * account's own root user is skipped (the target already has one), as are lead
 * contacts, which are cloned per lead further down.
 *
 * @returns {Promise<Record<string,string>>} source users_id → target users_id
 */
async function cloneStaffUsers(ctx, transaction) {
  const {
    sourceBuilderScope, targetCompanyId, targetBuilderId, targetUserId, roleMapping,
  } = ctx;

  // Which of the demo builder's users are lead contacts. They are cloned per
  // lead further down, so pulling them in here as well produced two of each —
  // one under the Contact role, one with none.
  //
  // Identified by the lead↔contact link table rather than by role name. The
  // earlier attempt matched a role called "contact" scoped to the demo
  // company; those contacts carry a role from a different scope, so the lookup
  // found nothing, the filter silently dropped, and every contact came through
  // twice. Being on a lead is what makes someone a contact — that is the test.
  const sourceLeads = await db.Leads.findAll({
    where: sourceBuilderScope,
    attributes: ["leads_id"],
    transaction,
  });

  const contactUserIds = new Set();
  if (sourceLeads.length > 0) {
    const contactMaps = await db.LeadsContactMap.findAll({
      where: { leads_id: { [Op.in]: sourceLeads.map(l => l.leads_id) } },
      attributes: ["contact_id"],
      transaction,
    });
    for (const map of contactMaps) {
      if (map.contact_id) contactUserIds.add(map.contact_id);
    }
  }

  const staff = await db.Users.findAll({
    where: {
      ...sourceBuilderScope,
      is_deleted: false,
      root_user: false,
      // Op.notIn on an empty array matches nothing, so guard it.
      ...(contactUserIds.size > 0
        ? { users_id: { [Op.notIn]: [...contactUserIds] } }
        : {}),
    },
    transaction,
  });

  // The demo team's roles are not all company-scoped, so `roleMapping` — built
  // from roles belonging to the demo company — misses the rest and everyone
  // landed as "No Role provided". Fall back to matching the source role's NAME
  // against this company's own roles, which is how job stages and client types
  // are matched elsewhere in this importer.
  const targetCompanyRoles = await db.Role.findAll({
    where: { company_id: targetCompanyId },
    attributes: ["role_id", "name"],
    transaction,
  });
  const resolvedRoles = new Map();

  const resolveRoleId = async (sourceRoleId) => {
    if (!sourceRoleId) return null;
    if (roleMapping[sourceRoleId]) return roleMapping[sourceRoleId];
    if (resolvedRoles.has(sourceRoleId)) return resolvedRoles.get(sourceRoleId);

    const sourceRole = await db.Role.findByPk(sourceRoleId, {
      attributes: ["name"],
      transaction,
    });
    const match = sourceRole
      ? targetCompanyRoles.find(r => r.name === sourceRole.name)
      : null;

    const resolved = match ? match.role_id : null;
    resolvedRoles.set(sourceRoleId, resolved);
    return resolved;
  };

  const userMapping = {};
  const reportsTo = {};

  for (const user of staff) {
    const plain = user.get({ plain: true });

    // Already brought across by an earlier import of THIS user's. A colleague's
    // copy of the demo team is not reused: their leads and jobs point at it, and
    // sharing it would leave this import's pipeline pinning rows the colleague's
    // own purge is entitled to delete. The email is uniquified below, so a second
    // copy costs nothing.
    const existing = await db.Users.findOne({
      where: {
        builder_id: targetBuilderId,
        name: plain.name,
        is_sample_data: true,
        sample_data_owner_id: targetUserId,
      },
      attributes: ["users_id"],
      transaction,
    });
    if (existing) {
      userMapping[plain.users_id] = existing.users_id;
      continue;
    }

    let targetAddressId = null;
    if (plain.address_id) {
      const address = await db.Address.findByPk(plain.address_id, { transaction });
      if (address) {
        const clonedAddress = await db.Address.create({
          ...address.get({ plain: true }),
          address_id: undefined,
          is_sample_data: true,
        }, { transaction });
        targetAddressId = clonedAddress.address_id;
      }
    }

    const clone = await db.Users.create({
      ...plain,
      users_id: undefined,
      company_id: targetCompanyId,
      builder_id: targetBuilderId,
      role_id: await resolveRoleId(plain.role_id),
      address_id: targetAddressId,
      email: await uniqueSampleEmail(plain.email, transaction),
      // Cannot sign in: no password, unverified, and every credential cleared.
      password: null,
      is_verified: false,
      otp: null,
      expires_at: null,
      reset_password_token: null,
      reset_token_expires_at: null,
      failed_attempts: 0,
      root_user: false,
      reporting_to: null,
      ...(await cloneFileColumns(plain, "Users")),
      is_sample_data: true,
    }, { transaction });

    userMapping[plain.users_id] = clone.users_id;
    if (plain.reporting_to) reportsTo[plain.users_id] = plain.reporting_to;
  }

  // Second pass: the reporting line, now that every person exists.
  for (const [sourceId, managerSourceId] of Object.entries(reportsTo)) {
    const managerId = userMapping[managerSourceId];
    await db.Users.update(
      { reporting_to: managerId || targetUserId },
      { where: { users_id: userMapping[sourceId] }, transaction },
    );
  }

  return userMapping;
}

/**
 * Log what the demo account actually holds, before anything is copied.
 *
 * Every "module X was not imported" report so far has had the same two possible
 * causes, and no way to tell them apart after the fact: either the source query
 * found nothing (wrong scope, or the demo genuinely has none), or the import
 * threw further down and the single transaction rolled the whole thing back —
 * leaving a company that looks like nothing was ever copied.
 *
 * Printing the inventory up front settles it: a zero here means there was
 * nothing to copy, while a non-zero followed by an empty module in the app means
 * the run rolled back.
 */
async function logImportInventory(sourceBuilderScope, sourceCompanyId, transaction) {
  const TABLES = [
    ["Location", "location_id"], ["Range", "range_id"], ["DwellingType", "dwelling_type_id"],
    ["Package", "package_id"], ["FloorPlan", "floor_plan_id"], ["Facade", "facade_id"],
    ["PriceList", "price_list_id"], ["PriceListItem", "price_list_item_id"],
    ["Color", "color_id"], ["Supplier", "supplier_id"], ["Estate", "estate_id"],
    ["QuotationFormat", "quotation_format_id"], ["SurveyTemplate", "survey_template_id"],
    ["StructureEngineer", "structure_engineer_id"], ["Leads", "leads_id"],
    ["Drive", "drive_id"], ["DriveFile", "file_id"],
  ];

  // Counted by company, not by builder: the Activity timeline and Site Check-In
  // are both company-scoped modules and their rows can carry a null builder_id,
  // so the builder scope above would under-report them.
  const COMPANY_TABLES = ["ActivityLog", "SiteCheckinField", "SiteCheckinRecord"];

  const counts = [];
  const tally = async (modelName, where) => {
    const model = db[modelName];
    if (!model) return;
    try {
      counts.push(`${modelName}=${await model.count({ where, transaction })}`);
    } catch (error) {
      counts.push(`${modelName}=?(${error?.message?.slice(0, 40)})`);
    }
  };

  for (const [modelName] of TABLES) {
    await tally(modelName, sourceBuilderScope);
  }
  for (const modelName of COMPANY_TABLES) {
    await tally(modelName, { company_id: sourceCompanyId });
  }

  console.log(`[importDummyProjectData] demo account holds: ${counts.join(" ")}`);
}

/** Rewrite a UUID[] column through a source→target id mapping, dropping misses. */
const remapIds = (ids, mapping) => (ids || []).map(id => mapping[id]).filter(Boolean);

/**
 * Close the gaps and break the ties in a builder's Lead Source ordering.
 *
 * lead-source.service keeps this column a dense 1..N run: adding a source shifts
 * everything at or below it down, deleting one pulls the rest up. The importer
 * writes rows straight through the model and so keeps none of that — it copies
 * the demo account's numbering as-is, and reuses a same-named row without
 * touching the number it already has. The demo account's own list has three
 * sources sharing 2 and nothing at 1 or 3, so every company that imported it
 * inherited a Sort column reading 2, 2, 2, 4, 5 …
 *
 * Renumbering here rather than at each call site because the damage is not
 * confined to the rows this import created: a gap left by a reused row sits
 * between two cloned ones. The whole list is read back in the order the Settings
 * screen renders it and numbered 1..N from there, so what the builder sees does
 * not move — only the numbers behind it are made contiguous. Rows already
 * holding the right value are left alone.
 *
 * Idempotent, which is what lets a sync repair a list an earlier import skewed.
 *
 * Scoped to ONE person's list, not the builder's. LeadSource is owner-scoped
 * (see OWNER_SCOPED_MODELS), so each user under a company sees their own seeded
 * sources plus the ones the builder typed in — never a colleague's. Numbering
 * across every owner at once therefore hands each user a list that is dense in
 * the database and full of holes on their screen: two users with five sources
 * each get 1..10 between them, and the second one's Settings screen reads
 * 6, 7, 8, 9, 10. The same `is_sample_data`/owner condition `scopeToViewer`
 * would have applied is written out here because this runs inside the
 * maintenance context, where that hook stands down.
 *
 * @param {string} ownerId the user this import is running for
 * @returns {Promise<number>} how many rows had to be renumbered
 */
async function normaliseLeadSourceOrder(builderId, ownerId, transaction) {
  const rows = await db.LeadSource.findAll({
    where: {
      builder_id: builderId,
      [Op.or]: [{ is_sample_data: { [Op.not]: true } }, { sample_data_owner_id: ownerId }],
    },
    // `sample_data_owner_id` is selected because the row is about to be updated
    // and sampleDataFlag's owner hook reads it off the instance: an unselected
    // owner reads `undefined` there, which is not the same question as "unowned"
    // and is not one this whitelist should be making the hook answer.
    attributes: ["lead_source_id", "sort_order", "sample_data_owner_id"],
    // The exact ordering getLeadSourcesService lists by, so renumbering cannot
    // reshuffle the list the builder is looking at.
    order: [["sort_order", "ASC"], ["created_at", "DESC"]],
    transaction,
  });

  let renumbered = 0;
  for (const [index, row] of rows.entries()) {
    const position = index + 1;
    if (row.sort_order === position) continue;

    await row.update({ sort_order: position }, { transaction });
    renumbered += 1;
  }

  return renumbered;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How far to move the demo account's scheduled dates so they land around the
 * importing company's today.
 *
 * The demo dataset was authored on a particular week, and its appointments,
 * tasks and to-dos are spread over the days that followed. Copied verbatim they
 * are frozen there: a company onboarding a month later gets a diary whose every
 * entry is already in the past, and Today / This Week read zero for reasons the
 * builder cannot see. So the whole schedule is carried forward by the distance
 * between the demo's own last edit and this import.
 *
 * Rounded to whole WEEKS rather than days, which keeps the weekday: a Tuesday
 * site inspection stays a Tuesday instead of sliding onto a Sunday. The spacing
 * between records is preserved either way — every date moves by the same amount,
 * so a task still falls the same number of days after the appointment it follows.
 *
 * @returns {Promise<number>} whole days to add; 0 when there is nothing to
 *   anchor against, which leaves every date exactly as the demo has it.
 */
async function sampleScheduleOffsetDays(sourceBuilderScope, transaction) {
  // The timestamp is spelled `createdAt` on some models here and `created_at`
  // on others. Asking for the wrong one does not throw — `max` hands back NaN,
  // which reads as "nothing to anchor against" and silently leaves every date
  // where the demo had it. So the attribute is resolved per model.
  const anchors = await Promise.all(
    ["Appointment", "Task", "Todo"].map(async (modelName) => {
      const model = db[modelName];
      const column = ["createdAt", "created_at"].find((name) => model?.rawAttributes?.[name]);
      if (!column) return null;
      return model.max(column, { where: sourceBuilderScope, transaction });
    }),
  );

  const latest = anchors
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)[0];
  if (!latest) return 0;

  const midnight = (ms) => {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };

  const days = Math.round((midnight(Date.now()) - midnight(latest)) / MS_PER_DAY);
  return Math.round(days / 7) * 7;
}

/**
 * Move a DATEONLY ("YYYY-MM-DD") on by whole days, keeping it date-only.
 *
 * The arithmetic is deliberately in UTC: a DATEONLY carries no zone, and going
 * via local time lets a daylight-saving boundary land the result on the day
 * before the one intended.
 */
function shiftDateOnly(value, days) {
  if (!value || !days) return value ?? null;

  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** Move a timestamp on by whole days, keeping its time of day. */
function shiftTimestamp(value, days) {
  if (!value || !days) return value ?? null;

  const shifted = new Date(new Date(value).getTime() + days * MS_PER_DAY);
  return Number.isNaN(shifted.getTime()) ? value : shifted;
}

// Exported so scripts/diagnose-sample-data-import.js can dry-run the whole
// import inside a transaction it rolls back. Callers that mean to keep the
// result should use restoreCompanySampleData / syncCompanySampleData, which
// own the transaction and the pre-flight checks.
/**
 * Seeded rows are read-only to the application; this is one of the few paths
 * allowed to write them, so it runs inside the maintenance context.
 *
 * It is also the only path that may claim them: `runAsSampleDataOwner` stamps
 * `sample_data_owner_id` onto every flagged row written inside it, which is what
 * later lets this user's Settings → Sample Data clear their own demo records
 * without touching a colleague's.
 */
export async function importDummyProjectData(targetCompanyId, targetBuilderId, targetUserId, transaction, onProgress) {
  return runSampleDataMaintenance(() =>
    runAsSampleDataOwner(targetUserId, () =>
      importDummyProjectDataImpl(targetCompanyId, targetBuilderId, targetUserId, transaction, onProgress),
    ),
  );
}

/**
 * The phases the import crosses, in order.
 *
 * The bar on Settings → Sample Data is driven by how many of these are behind
 * it: a count of work finished, not a forecast of time left. They are weighted
 * evenly on purpose. Weighting them by duration would mean inventing per-phase
 * timings — the S3 image copies in `drive-files` dominate a slow import and
 * barely register on a fast one — and a number nobody measured is worse on that
 * screen than a coarse one that is true.
 */
const IMPORT_PHASES = [
  // The demo account's staff.
  "team",
  // The S Drive tree everything else files into.
  "drive-folders",
  // Settings masters, catalog, price lists.
  "catalog",
  // Leads → opportunities → quotations → jobs.
  "pipeline",
  // Tasks, appointments, check-ins, the timeline.
  "activity",
  // Documents hanging off leads and jobs.
  "documents",
  // S Drive files and their S3 copies.
  "drive-files",
];

/**
 * Report "that phase is done" as a 0–1 fraction for the caller to record.
 *
 * Errors are swallowed deliberately: progress is a courtesy to the screen, and
 * an import that has done its work must never fail because a status write did.
 */
function makeImportProgressReporter(onProgress) {
  if (typeof onProgress !== "function") {
    return async () => {};
  }

  return async (phase) => {
    const index = IMPORT_PHASES.indexOf(phase);
    if (index < 0) {
      return;
    }
    try {
      await onProgress((index + 1) / IMPORT_PHASES.length);
    } catch (error) {
      console.warn(
        `[importDummyProjectData] could not report progress at "${phase}":`,
        error?.message || error,
      );
    }
  };
}

/**
 * The demo account this company's sample data is copied from.
 *
 * Shared by the importer and the sync's prune so both are looking at exactly one
 * definition of "the source". A prune that resolved the demo account even
 * slightly differently from the import would compare against the wrong set of
 * records and delete rows that are still there.
 *
 * @returns {Promise<null|{sourceCompanyId: string, sourceBuilderId: string,
 *   sourceBuilderScope: object}>} null when there is nothing to copy from.
 */
async function resolveSampleDataSource(targetCompanyId, transaction) {
  const dummyEmail = env.DUMMY_DATA_EMAIL || "dummy@inbuildify.com";
  const sourceUser = await db.Users.findOne({
    where: { email: dummyEmail },
    transaction,
  });

  if (!sourceUser) {
    console.warn(`[sampleData] Master dummy user account with email "${dummyEmail}" not found.`);
    return null;
  }

  const sourceCompanyId = sourceUser.company_id;
  const sourceBuilderId = sourceUser.builder_id;

  // The demo account syncing itself has nothing to copy and nothing to prune.
  if (sourceCompanyId === targetCompanyId) return null;

  // Read the source across EVERY builder in the demo company, not just the one
  // the dummy login happens to sit under.
  //
  // Everything here used to be scoped to `sourceUser.builder_id` alone. A demo
  // company with more than one builder therefore exposed only a slice of itself
  // — a module whose records were filed under another builder simply never
  // appeared in the target, which reads as "that data was not copied". Where
  // there is only one builder this is identical to the old behaviour.
  const sourceBuilders = await db.Builder.findAll({
    where: { company_id: sourceCompanyId },
    attributes: ["builder_id"],
    transaction,
  });
  const sourceBuilderIds = [
    ...new Set([sourceBuilderId, ...sourceBuilders.map(b => b.builder_id)].filter(Boolean)),
  ];

  return {
    sourceCompanyId,
    sourceBuilderId,
    sourceBuilderScope: { builder_id: { [Op.in]: sourceBuilderIds } },
  };
}

async function importDummyProjectDataImpl(targetCompanyId, targetBuilderId, targetUserId, transaction, onProgress) {
  const reportPhase = makeImportProgressReporter(onProgress);

  const sampleSource = await resolveSampleDataSource(targetCompanyId, transaction);
  if (!sampleSource) return;

  const { sourceCompanyId, sourceBuilderId, sourceBuilderScope } = sampleSource;
  const sourceBuilderIds = sourceBuilderScope.builder_id[Op.in];

  // Tenant + audit columns every copy below is stamped with.
  const tenancy = { company_id: targetCompanyId, builder_id: targetBuilderId };
  const audit = { created_by: targetUserId, updated_by: targetUserId };
  const targetBuilderScope = { builder_id: targetBuilderId };
  const targetUserScope = { builder_id: targetBuilderId, is_sample_data: true, sample_data_owner_id: targetUserId };

  /**
   * "Did an earlier import already bring this across?" — asked of THIS user's
   * sample data, not the company's.
   *
   * Every user under a company shares its builder_id, so a check keyed on the
   * builder alone answered yes to records a colleague had imported, and the
   * person asking ended up with a Sample Data screen that stayed empty however
   * often they imported. Their pipeline — leads, jobs, the diary, the check-ins,
   * the Activity timeline — is now cloned per person.
   *
   * Deliberately NOT applied to the settings masters: those are unique on
   * (company_id, builder_id, name), so a second copy is not something the schema
   * can hold. They stay shared, owned by whoever imported first, and a purge
   * that would strand a colleague's lead on one skips it and reports it.
   */
  const ownSample = { is_sample_data: true, sample_data_owner_id: targetUserId };

  console.log(
    `[importDummyProjectData] source builders: ${sourceBuilderIds.join(", ")} ` +
    `→ target company ${targetCompanyId} / builder ${targetBuilderId}`,
  );
  await logImportInventory(sourceBuilderScope, sourceCompanyId, transaction);

  // Every scheduled date below moves by this much, so the diary the builder
  // lands on sits around their today rather than around the week the demo
  // account was written. See sampleScheduleOffsetDays.
  const scheduleOffset = await sampleScheduleOffsetDays(sourceBuilderScope, transaction);
  console.log(
    `[importDummyProjectData] scheduled dates shifted by ${scheduleOffset} day(s)`,
  );

  // Match Company Roles. First, because both the team below and the settings
  // masters further down point at a role.
  const sourceRoles = await db.Role.findAll({ where: { company_id: sourceCompanyId }, transaction });
  const targetRoles = await db.Role.findAll({ where: { company_id: targetCompanyId }, transaction });
  const roleMapping = {};
  for (const r of sourceRoles) {
    const matchingTarget = targetRoles.find(t => t.name === r.name);
    if (matchingTarget) {
      roleMapping[r.role_id] = matchingTarget.role_id;
    }
  }

  // The demo account's team. Cloned before anything that names a person, so
  // assignees, supervisors, range owners and group members land on the right
  // one instead of all collapsing onto whoever ran the import.
  const userMapping = await cloneStaffUsers({
    sourceBuilderScope,
    targetCompanyId,
    targetBuilderId,
    targetUserId,
    roleMapping,
  }, transaction);

  /** A cloned teammate where there is one, else whoever ran the import. */
  const mappedUser = (sourceId) => userMapping[sourceId] || targetUserId;
  await reportPhase("team");

  // --- 0. Clone the S Drive folder tree ---
  //
  // First, because every DriveFile written from here on needs to know where it
  // belongs in the new company's drive. My Drive lists files strictly by
  // folder, so a copy that lands folder-less is invisible however correct the
  // rest of its data is.
  const folderMapping = await cloneDriveFolders(
    { sourceCompanyId, sourceBuilderId, targetCompanyId, targetBuilderId, targetUserId },
    transaction,
  );

  await reportPhase("drive-folders");

  // Source file ids already copied by the catalog / lead passes below, so the
  // drive pass at the end does not copy them a second time.
  const clonedSourceFileIds = new Set();

  const cloneFile = async (payload) => {
    if (payload.sourceFileId) clonedSourceFileIds.add(payload.sourceFileId);
    return cloneImageDriveFile({ ...payload, folderMapping }, transaction);
  };

  // Every source row id → its clone's id, for the drive pass to remap the
  // polymorphic reference each file carries.
  const idMapping = {};
  const termsMapping = {};

  // --- 1. Clone Catalog/Master Data (or match by name) ---

  // Locations
  const locations = await db.Location.findAll({ where: sourceBuilderScope, transaction });
  const locationMapping = {};
  for (const loc of locations) {
    let targetLoc = await db.Location.findOne({
      where: { name: loc.name, builder_id: targetBuilderId, is_sample_data: true, sample_data_owner_id: targetUserId },
      transaction
    });
    if (!targetLoc) {
      targetLoc = await db.Location.create({
        ...loc.get({ plain: true }),
        location_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        is_sample_data: true,
        created_by: targetUserId,
        updated_by: targetUserId,
      }, { transaction });
    } else {
      await targetLoc.update({
        ...loc.get({ plain: true }),
        location_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        is_sample_data: true,
        updated_by: targetUserId,
      }, { transaction });
    }
    locationMapping[loc.location_id] = targetLoc.location_id;
  }

  // Ranges
  const ranges = await db.Range.findAll({ where: sourceBuilderScope, transaction });
  const rangeMapping = {};
  let rangesCreated = 0;
  let rangesReused = 0;
  for (const rng of ranges) {
    let targetRng = await db.Range.findOne({
      where: { name: rng.name, builder_id: targetBuilderId, is_sample_data: true, sample_data_owner_id: targetUserId },
      transaction
    });
    if (!targetRng) {
      targetRng = await db.Range.create({
        ...rng.get({ plain: true }),
        range_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        // The range's logo and header banner are stored as plain S3 text, so
        // each copy takes its own; user_id lists demo staff who do not exist
        // here, which left the range showing an empty owner list.
        ...(await cloneFileColumns(rng.get({ plain: true }), "Range")),
        user_id: remapIds(rng.user_id, userMapping),
        is_sample_data: true,
        created_by: targetUserId,
        updated_by: targetUserId,
      }, { transaction });
      rangesCreated += 1;
    } else {
      await targetRng.update({
        ...rng.get({ plain: true }),
        range_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        ...(await cloneFileColumns(rng.get({ plain: true }), "Range")),
        user_id: remapIds(rng.user_id, userMapping),
        is_sample_data: true,
        updated_by: targetUserId,
      }, { transaction });
      rangesReused += 1;
    }
    rangeMapping[rng.range_id] = targetRng.range_id;
  }
  // Reused means the target already had a range with that name, so nothing new
  // appears and nothing is tagged Sample — a case that reads as "not imported".
  console.log(
    `[importDummyProjectData] ranges: ${ranges.length} found, ` +
    `${rangesCreated} created, ${rangesReused} reused by name`,
  );

  // DwellingTypes
  const dwellingTypes = await db.DwellingType.findAll({ where: sourceBuilderScope, transaction });
  const dwellingTypeMapping = {};
  for (const dt of dwellingTypes) {
    let targetDt = await db.DwellingType.findOne({
      where: { name: dt.name, builder_id: targetBuilderId, is_sample_data: true, sample_data_owner_id: targetUserId },
      transaction
    });
    if (!targetDt) {
      targetDt = await db.DwellingType.create({
        ...dt.get({ plain: true }),
        dwelling_type_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        is_sample_data: true,
        created_by: targetUserId,
        updated_by: targetUserId,
      }, { transaction });
    } else {
      await targetDt.update({
        ...dt.get({ plain: true }),
        dwelling_type_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        is_sample_data: true,
        updated_by: targetUserId,
      }, { transaction });
    }
    dwellingTypeMapping[dt.dwelling_type_id] = targetDt.dwelling_type_id;
  }

  // PackageGroups — packages carry an array of these, so they go first.
  const { all: packageGroupMapping } = await cloneMasterRows("PackageGroup", {
    pk: "package_group_id",
    matchOn: ["name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: tenancy,
  }, transaction);

  // Packages
  const packages = await db.Package.findAll({ where: sourceBuilderScope, transaction });
  const packageMapping = {};
  for (const pkg of packages) {
    let targetPkg = await db.Package.findOne({
      where: { name: pkg.name, builder_id: targetBuilderId, is_sample_data: true, sample_data_owner_id: targetUserId },
      transaction
    });
    const targetRangeIds = (pkg.range_id || []).map(id => rangeMapping[id]).filter(Boolean);
    const targetDwellingTypeIds = (pkg.dwelling_type_id || []).map(id => dwellingTypeMapping[id]).filter(Boolean);
    if (!targetPkg) {
      targetPkg = await db.Package.create({
        ...pkg.get({ plain: true }),
        package_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        range_id: targetRangeIds,
        dwelling_type_id: targetDwellingTypeIds,
        package_group_id: remapIds(pkg.package_group_id, packageGroupMapping),
        is_sample_data: true,
        created_by: targetUserId,
        updated_by: targetUserId,
      }, { transaction });
    } else {
      await targetPkg.update({
        ...pkg.get({ plain: true }),
        package_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        range_id: targetRangeIds,
        dwelling_type_id: targetDwellingTypeIds,
        package_group_id: remapIds(pkg.package_group_id, packageGroupMapping),
        is_sample_data: true,
        updated_by: targetUserId,
      }, { transaction });
    }
    packageMapping[pkg.package_id] = targetPkg.package_id;
  }

  // FloorPlans
  // skipImageResolve keeps detailed_image / simple_image as the raw DriveFile
  // UUIDs. Without it the afterFind hook rewrites them into S3 URLs, and the
  // create() below would try to INSERT a URL into a UUID column.
  const floorPlans = await db.FloorPlan.findAll({
    where: sourceBuilderScope,
    transaction,
    skipImageResolve: true,
  });
  const floorPlanMapping = {};
  for (const fp of floorPlans) {
    let targetFp = await db.FloorPlan.findOne({
      where: { name: fp.name, builder_id: targetBuilderId, is_sample_data: true, sample_data_owner_id: targetUserId },
      transaction,
      skipImageResolve: true,
    });
    if (!targetFp) {
      // Pre-generate the PK so the copied images can reference it up front.
      const targetFpId = randomUUID();
      const imageOwner = {
        companyId: targetCompanyId,
        builderId: targetBuilderId,
        uploadedBy: targetUserId,
        referenceId: targetFpId,
      };

      targetFp = await db.FloorPlan.create({
        ...fp.get({ plain: true }),
        floor_plan_id: targetFpId,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        location_id: locationMapping[fp.location_id] || null,
        range_id: rangeMapping[fp.range_id] || null,
        dwelling_type_id: dwellingTypeMapping[fp.dwelling_type_id] || null,
        detailed_image: await cloneFile({ ...imageOwner, sourceFileId: fp.detailed_image }),
        simple_image: await cloneFile({ ...imageOwner, sourceFileId: fp.simple_image }),
        is_sample_data: true,
        created_by: targetUserId,
        updated_by: targetUserId,
      }, { transaction });
    } else {
      await removeImageByRef(targetFp.detailed_image, transaction);
      await removeImageByRef(targetFp.simple_image, transaction);
      const imageOwner = {
        companyId: targetCompanyId,
        builderId: targetBuilderId,
        uploadedBy: targetUserId,
        referenceId: targetFp.floor_plan_id,
      };
      await targetFp.update({
        ...fp.get({ plain: true }),
        floor_plan_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        location_id: locationMapping[fp.location_id] || null,
        range_id: rangeMapping[fp.range_id] || null,
        dwelling_type_id: dwellingTypeMapping[fp.dwelling_type_id] || null,
        detailed_image: await cloneFile({ ...imageOwner, sourceFileId: fp.detailed_image }),
        simple_image: await cloneFile({ ...imageOwner, sourceFileId: fp.simple_image }),
        is_sample_data: true,
        updated_by: targetUserId,
      }, { transaction });
    }
    floorPlanMapping[fp.floor_plan_id] = targetFp.floor_plan_id;
    idMapping[fp.floor_plan_id] = targetFp.floor_plan_id;
  }

  // Facades
  const facades = await db.Facade.findAll({
    where: sourceBuilderScope,
    transaction,
    skipImageResolve: true,
  });
  const facadeMapping = {};
  for (const fac of facades) {
    let targetFac = await db.Facade.findOne({
      where: { name: fac.name, builder_id: targetBuilderId, is_sample_data: true, sample_data_owner_id: targetUserId },
      transaction,
      skipImageResolve: true,
    });
    if (!targetFac) {
      const targetFacId = randomUUID();

      targetFac = await db.Facade.create({
        ...fac.get({ plain: true }),
        facade_id: targetFacId,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        location_id: locationMapping[fac.location_id] || null,
        range_id: rangeMapping[fac.range_id] || null,
        dwelling_type_id: dwellingTypeMapping[fac.dwelling_type_id] || null,
        image: await cloneFile({
          sourceFileId: fac.image,
          companyId: targetCompanyId,
          builderId: targetBuilderId,
          uploadedBy: targetUserId,
          referenceId: targetFacId,
        }),
        is_sample_data: true,
        created_by: targetUserId,
        updated_by: targetUserId,
      }, { transaction });
    } else {
      await removeImageByRef(targetFac.image, transaction);
      await targetFac.update({
        ...fac.get({ plain: true }),
        facade_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        location_id: locationMapping[fac.location_id] || null,
        range_id: rangeMapping[fac.range_id] || null,
        dwelling_type_id: dwellingTypeMapping[fac.dwelling_type_id] || null,
        image: await cloneFile({
          sourceFileId: fac.image,
          companyId: targetCompanyId,
          builderId: targetBuilderId,
          uploadedBy: targetUserId,
          referenceId: targetFac.facade_id,
        }),
        is_sample_data: true,
        updated_by: targetUserId,
      }, { transaction });
    }
    facadeMapping[fac.facade_id] = targetFac.facade_id;
    idMapping[fac.facade_id] = targetFac.facade_id;
  }

  // FloorPlanFacadeMap
  const fpFacadeMaps = await db.FloorPlanFacadeMap.findAll({
    where: { floor_plan_id: { [Op.in]: Object.keys(floorPlanMapping) } },
    transaction
  });
  for (const map of fpFacadeMaps) {
    const targetFpId = floorPlanMapping[map.floor_plan_id];
    const targetFacId = facadeMapping[map.facade_id];
    if (targetFpId && targetFacId) {
      const exists = await db.FloorPlanFacadeMap.findOne({
        where: { floor_plan_id: targetFpId, facade_id: targetFacId },
        transaction
      });
      if (!exists) {
        await db.FloorPlanFacadeMap.create({
          floor_plan_id: targetFpId,
          facade_id: targetFacId,
          is_sample_data: true,
        }, { transaction });
      }
    }
  }

  /**
   * A price list the target can actually see under this name, or nothing.
   *
   * Three cases, and only the middle one is new:
   *
   *   • not sample data — the builder's own list, or the "Base Price" every
   *     builder is seeded with at sign-up (seed-price-list.js). Everyone in the
   *     company sees it, so it is reused. The demo account carries that same
   *     seeded list, and cloning it produced a second "Base Price" badged SAMPLE
   *     sitting beside the real one.
   *   • seeded, owned by SOMEBODY ELSE — reusing it wrote nothing for this
   *     account, and PriceList is owner-scoped on read (OWNER_SCOPED_MODELS in
   *     sampleDataFlag), so the row reused is one this person cannot see. Master
   *     Pricing came up empty for them and the mapping below carried the
   *     invisible row into their cloned quotations. This is the one that must
   *     miss, so a copy of their own gets made.
   *   • seeded, owned by this account — an earlier import of theirs; reused, so
   *     running the import twice does not double up.
   */
  const visibleToTarget = { [Op.or]: [{ is_sample_data: false }, { sample_data_owner_id: targetUserId }] };

  // PriceLists
  const priceLists = await db.PriceList.findAll({ where: sourceBuilderScope, transaction });
  const priceListMapping = {};
  const priceListNameById = {};
  for (const pl of priceLists) {
    priceListNameById[pl.price_list_id] = pl.name;
    const isSampleData = pl.name === "Base Price" ? false : true;
    let targetPl = await db.PriceList.findOne({
      where: { name: pl.name, builder_id: targetBuilderId, ...visibleToTarget },
      transaction
    });
    if (!targetPl) {
      targetPl = await db.PriceList.create({
        ...pl.get({ plain: true }),
        price_list_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        location: locationMapping[pl.location] || null,
        is_sample_data: isSampleData,
        created_by: targetUserId,
        updated_by: targetUserId,
      }, { transaction });
    } else {
      await targetPl.update({
        ...pl.get({ plain: true }),
        price_list_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        location: locationMapping[pl.location] || null,
        is_sample_data: isSampleData,
        updated_by: targetUserId,
      }, { transaction });
    }
    priceListMapping[pl.price_list_id] = targetPl.price_list_id;
  }

  // PriceListItems
  const priceListItems = await db.PriceListItem.findAll({ where: sourceBuilderScope, transaction });
  const priceListItemMapping = {};
  const itemIsBasePrice = {};
  for (const pli of priceListItems) {
    const parentIsBasePrice = priceListNameById[pli.price_list_id] === "Base Price";
    itemIsBasePrice[pli.price_list_item_id] = parentIsBasePrice;
    const isSampleData = parentIsBasePrice ? false : true;
    let targetPli = await db.PriceListItem.findOne({
      // Same three cases as the list above — the items are what the price list
      // actually shows, so reusing a colleague's left this account looking at an
      // empty one, and cloning the seeded "Compaction Report Charge" put a
      // second copy of it under the seeded "Base Price".
      where: { item_description: pli.item_description, builder_id: targetBuilderId, ...visibleToTarget },
      transaction
    });
    const targetRangeIds = (pli.range_id || []).map(id => rangeMapping[id]).filter(Boolean);
    const targetDwellingTypeIds = (pli.dwelling_type_id || []).map(id => dwellingTypeMapping[id]).filter(Boolean);

    if (!targetPli) {
      targetPli = await db.PriceListItem.create({
        ...pli.get({ plain: true }),
        price_list_item_id: undefined,
        // Never fall back to the source id — that would point this tenant's row
        // at the demo builder's price list.
        price_list_id: priceListMapping[pli.price_list_id] || null,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        range_id: targetRangeIds,
        dwelling_type_id: targetDwellingTypeIds,
        is_sample_data: isSampleData,
        created_by: targetUserId,
        updated_by: targetUserId,
      }, { transaction });
    } else {
      await targetPli.update({
        ...pli.get({ plain: true }),
        price_list_item_id: undefined,
        price_list_id: priceListMapping[pli.price_list_id] || null,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        range_id: targetRangeIds,
        dwelling_type_id: targetDwellingTypeIds,
        is_sample_data: isSampleData,
        updated_by: targetUserId,
      }, { transaction });
    }
    priceListItemMapping[pli.price_list_item_id] = targetPli.price_list_item_id;
  }

  // PriceListItemConditions
  const conditions = await db.PriceListItemCondition.findAll({
    where: { price_list_item_id: { [Op.in]: Object.keys(priceListItemMapping) } },
    transaction
  });
  for (const cond of conditions) {
    const targetPliId = priceListItemMapping[cond.price_list_item_id];
    if (targetPliId) {
      const exists = await db.PriceListItemCondition.findOne({
        where: { price_list_item_id: targetPliId, condition_name: cond.condition_name },
        transaction
      });
      if (!exists) {
        const parentIsBasePrice = itemIsBasePrice[cond.price_list_item_id];
        await db.PriceListItemCondition.create({
          ...cond.get({ plain: true }),
          price_list_item_condition_id: undefined,
          price_list_item_id: targetPliId,
          is_sample_data: parentIsBasePrice ? false : true,
        }, { transaction });
      }
    }
  }

  // FloorPlanPricelistItemMap
  const fpPliMaps = await db.FloorPlanPricelistItemMap.findAll({
    where: { floor_plan_id: { [Op.in]: Object.keys(floorPlanMapping) } },
    transaction
  });
  for (const map of fpPliMaps) {
    const targetFpId = floorPlanMapping[map.floor_plan_id];
    const targetPliId = priceListItemMapping[map.price_list_item_id];
    if (targetFpId && targetPliId) {
      const exists = await db.FloorPlanPricelistItemMap.findOne({
        where: { floor_plan_id: targetFpId, price_list_item_id: targetPliId },
        transaction
      });
      if (!exists) {
        await db.FloorPlanPricelistItemMap.create({
          floor_plan_id: targetFpId,
          price_list_item_id: targetPliId,
          include_default: map.include_default,
          modify: map.modify,
          quantity: map.quantity,
          is_sample_data: true,
        }, { transaction });
      }
    }
  }

  // PackagePricelistItemMap — the items a package includes. Without it a
  // quotation cannot tell which of its lines came from the selected package, so
  // package items stop showing as selected on the quotation screen.
  const pkgPliMaps = await db.PackagePricelistItemMap.findAll({
    where: { package_id: { [Op.in]: Object.keys(packageMapping) } },
    transaction
  });
  for (const map of pkgPliMaps) {
    const targetPkgId = packageMapping[map.package_id];
    const targetPliId = priceListItemMapping[map.price_list_item_id];
    if (targetPkgId && targetPliId) {
      const exists = await db.PackagePricelistItemMap.findOne({
        where: { package_id: targetPkgId, price_list_item_id: targetPliId },
        transaction
      });
      if (!exists) {
        await db.PackagePricelistItemMap.create({
          package_id: targetPkgId,
          price_list_item_id: targetPliId,
          is_sample_data: true,
        }, { transaction });
      }
    }
  }

  /* ─── SETTINGS MASTERS ─────────────────────────────────────────────────────
   * Everything under Settings that the demo account has configured. These are
   * plain builder-scoped lists, so each one is matched by its natural key and
   * copied only when the target builder does not already have it.
   */

  // Service / Lead source / Workflow process. Service and WorkflowProcess carry
  // builder_id only — no company_id column — so they are scoped by builder.
  await cloneMasterRows("Service", {
    pk: "service_id",
    matchOn: ["service"],
    sourceWhere: { ...sourceBuilderScope, is_deleted: false },
    targetWhere: targetUserScope,
    ownership: targetUserScope,
  }, transaction);

  const { all: leadSourceMapping } = await cloneMasterRows("LeadSource", {
    pk: "lead_source_id",
    matchOn: ["name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit, sample_data_owner_id: targetUserId },
  }, transaction);

  // The clone above copies sort_order verbatim, duplicates and gaps included.
  const renumberedLeadSources = await normaliseLeadSourceOrder(targetBuilderId, targetUserId, transaction);
  if (renumberedLeadSources > 0) {
    console.log(
      `[importDummyProjectData] lead sources: renumbered ${renumberedLeadSources} row(s) into a 1..N order`,
    );
  }

  const { created: workflowProcessCreated } = await cloneMasterRows("WorkflowProcess", {
    pk: "workflow_process_id",
    matchOn: ["name"],
    sourceWhere: { ...sourceBuilderScope, is_deleted: false },
    targetWhere: targetUserScope,
    ownership: targetUserScope,
  }, transaction);

  await cloneChildRows("WorkflowProcessTask", {
    pk: "workflow_process_task_id",
    parentKey: "workflow_process_id",
    parentMapping: workflowProcessCreated,
    extraWhere: { is_deleted: false },
  }, transaction);

  // Holidays. No natural key of their own, so the description plus the dates it
  // covers is what identifies a duplicate.
  await cloneMasterRows("Holiday", {
    pk: "holiday_id",
    matchOn: ["holiday_description", "holiday_start_date", "holiday_end_date"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit, sample_data_owner_id: targetUserId },
  }, transaction);

  // User groups. The demo members do not exist here, so the group is created
  // with the importing user as its only member rather than a dangling id list.
  await cloneMasterRows("UserGroup", {
    pk: "user_group_id",
    matchOn: ["name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, created_by_id: targetUserId, updated_by_id: targetUserId, sample_data_owner_id: targetUserId },
    remap: (row) => ({ users_id: remapIds(row.users_id, userMapping) }),
  }, transaction);

  // Structural engineers — quotation versions point at these, so they must be
  // in place before the quotation clone below runs.
  const { all: structureEngineerMapping } = await cloneMasterRows("StructureEngineer", {
    pk: "structure_engineer_id",
    matchOn: ["name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit, sample_data_owner_id: targetUserId },
  }, transaction);

  // Supplier types → suppliers → their type maps, contacts and documents.
  const { all: supplierTypeMapping } = await cloneMasterRows("SupplierType", {
    pk: "supplier_type_id",
    matchOn: ["name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit, sample_data_owner_id: targetUserId },
  }, transaction);

  const { all: supplierMapping, created: supplierCreated } = await cloneMasterRows("Supplier", {
    pk: "supplier_id",
    matchOn: ["company_name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit, sample_data_owner_id: targetUserId },
    remap: (row) => ({ supplier_type_id: remapIds(row.supplier_type_id, supplierTypeMapping) }),
  }, transaction);

  await cloneChildRows("SupplierContacts", {
    pk: "supplier_contact_id",
    parentKey: "supplier_id",
    parentMapping: supplierCreated,
  }, transaction);

  await cloneChildRows("SupplierDocuments", {
    pk: "supplier_document_id",
    parentKey: "supplier_id",
    parentMapping: supplierCreated,
  }, transaction);

  // supplier_type_id is NOT NULL on this table, so a map whose type did not come
  // across is skipped outright rather than written with a dangling pointer.
  const supplierIds = Object.keys(supplierCreated);
  if (supplierIds.length > 0) {
    const supplierTypeMaps = await db.SupplierSupplierTypeMap.findAll({
      where: { supplier_id: { [Op.in]: supplierIds } },
      transaction,
    });
    for (const map of supplierTypeMaps) {
      const targetTypeId = supplierTypeMapping[map.supplier_type_id];
      if (!targetTypeId) continue;
      await db.SupplierSupplierTypeMap.create({
        ...map.get({ plain: true }),
        id: undefined,
        supplier_id: supplierCreated[map.supplier_id],
        supplier_type_id: targetTypeId,
        is_sample_data: true,
      }, { transaction });
    }
  }

  // Colour master: types and groups first (items reference both), then the
  // colour → category → sub-category / item → custom field tree.
  const { all: colorTypeMapping } = await cloneMasterRows("ColorType", {
    pk: "color_type_id",
    matchOn: ["color_type_name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit },
  }, transaction);

  const { all: colorGroupMapping } = await cloneMasterRows("ColorGroup", {
    pk: "color_group_id",
    matchOn: ["name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit },
  }, transaction);

  const { all: colorMapping, created: colorCreated } = await cloneMasterRows("Color", {
    pk: "color_id",
    matchOn: ["color_name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit },
  }, transaction);

  const colorCategoryMapping = await cloneChildRows("ColorCategory", {
    pk: "color_category_id",
    parentKey: "color_id",
    parentMapping: colorCreated,
    ownership: audit,
    remap: (row) => ({
      suppliers: remapIds(row.suppliers, supplierMapping),
      color_group: remapIds(row.color_group, colorGroupMapping),
    }),
  }, transaction);

  await cloneChildRows("ColorSubCategory", {
    pk: "color_sub_category_id",
    parentKey: "color_category_id",
    parentMapping: colorCategoryMapping,
    ownership: { created_by_id: targetUserId, updated_by_id: targetUserId },
    extraWhere: { is_deleted: false },
  }, transaction);

  const colorItemMapping = await cloneChildRows("ColorItem", {
    pk: "color_item_id",
    parentKey: "color_category_id",
    parentMapping: colorCategoryMapping,
    ownership: tenancy,
    remap: (row) => ({
      color_id: colorMapping[row.color_id] || null,
      supplier_id: supplierMapping[row.supplier_id] || null,
      color_type_id: remapIds(row.color_type_id, colorTypeMapping),
      range_id: remapIds(row.range_id, rangeMapping),
    }),
  }, transaction);

  await cloneChildRows("ColorItemCustomField", {
    pk: "color_item_custom_field_id",
    parentKey: "color_item",
    parentMapping: colorItemMapping,
  }, transaction);

  await cloneChildRows("ColorGroupItemMap", {
    pk: "id",
    parentKey: "color_item_id",
    parentMapping: colorItemMapping,
    remap: (row) => ({ color_group_id: colorGroupMapping[row.color_group_id] || null }),
  }, transaction);

  // Survey templates and their questions.
  const { all: surveyTemplateMapping, created: surveyTemplateCreated } =
    await cloneMasterRows("SurveyTemplate", {
      pk: "survey_template_id",
      matchOn: ["name"],
      sourceWhere: sourceBuilderScope,
      targetWhere: targetUserScope,
      ownership: { ...tenancy, ...audit },
    }, transaction);

  const surveyQuestionMapping = await cloneChildRows("SurveyTemplateQuestions", {
    pk: "survey_question_id",
    parentKey: "survey_template_id",
    parentMapping: surveyTemplateCreated,
    ownership: audit,
  }, transaction);

  // Estates with their stages, features, documents and images. Property details
  // on the seeded leads point at estate_id / estate_stage_id, so this runs
  // before the lead clone below.
  const { all: estateMapping, created: estateCreated } = await cloneMasterRows("Estate", {
    pk: "estate_id",
    matchOn: ["name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit },
  }, transaction);

  const estateStageMapping = await cloneChildRows("EstateStages", {
    pk: "estate_stage_id",
    parentKey: "estate_id",
    parentMapping: estateCreated,
  }, transaction);

  await cloneChildRows("EstateFeatures", {
    pk: "estate_feature_id",
    parentKey: "estate_id",
    parentMapping: estateCreated,
  }, transaction);

  await cloneChildRows("EstateDocuments", {
    pk: "estate_document_id",
    parentKey: "estate_id",
    parentMapping: estateCreated,
    ownership: { created_by: targetUserId, uploaded_by: targetUserId },
  }, transaction);

  await cloneChildRows("EstateImages", {
    pk: "estate_image_id",
    parentKey: "estate_id",
    parentMapping: estateCreated,
    ownership: { uploaded_by: targetUserId },
  }, transaction);

  // Contract document formats and the sections that make up each one.
  const { created: contractFormatCreated } = await cloneMasterRows("ContractFormat", {
    pk: "contract_format_id",
    matchOn: ["format_name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit },
    // `builder` is a second builder pointer alongside builder_id; left as the
    // source value it would name the demo builder on the contract cover page.
    remap: () => ({ builder: targetBuilderId }),
  }, transaction);

  await cloneChildRows("ContractSection", {
    pk: "contract_section_id",
    parentKey: "contract_format_id",
    parentMapping: contractFormatCreated,
  }, transaction);

  // Cost centres. Their checklist links are matched by construction-checklist
  // name, the same way job stages are matched below — a checklist the target
  // builder does not have simply drops out.
  const { created: costCenterCreated } = await cloneMasterRows("CostCenter", {
    pk: "cost_center_id",
    matchOn: ["code"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit },
  }, transaction);

  if (Object.keys(costCenterCreated).length > 0) {
    const sourceChecklists = await db.ConstructionChecklist.findAll({
      where: sourceBuilderScope, attributes: ["construction_checklist_id", "name"], transaction,
    });
    const targetChecklists = await db.ConstructionChecklist.findAll({
      where: { builder_id: targetBuilderId }, attributes: ["construction_checklist_id", "name"], transaction,
    });
    const checklistMapping = {};
    for (const source of sourceChecklists) {
      const match = targetChecklists.find(t => t.name === source.name);
      if (match) checklistMapping[source.construction_checklist_id] = match.construction_checklist_id;
    }

    const costCenterMaps = await db.CostCenterChecklistMap.findAll({
      where: { cost_center_id: { [Op.in]: Object.keys(costCenterCreated) } },
      transaction,
    });
    for (const map of costCenterMaps) {
      const targetChecklistId = checklistMapping[map.construction_checklist_id];
      if (!targetChecklistId) continue;
      await db.CostCenterChecklistMap.create({
        cost_center_id: costCenterCreated[map.cost_center_id],
        construction_checklist_id: targetChecklistId,
        is_sample_data: true,
      }, { transaction });
    }
  }

  // Quotation formats — the PDF layout a quotation is rendered with, plus the
  // custom fields and the master sections (heading → item) that make up its
  // inclusions pages. The watermark, default facade and draft background are
  // plain S3 text, so cloneMasterRows copies each one.
  const { all: quotationFormatMapping, created: quotationFormatCreated } =
    await cloneMasterRows("QuotationFormat", {
      pk: "quotation_format_id",
      matchOn: ["format_name"],
      sourceWhere: sourceBuilderScope,
      targetWhere: targetUserScope,
      ownership: { ...tenancy, ...audit },
      remap: (row) => ({ role_id: roleMapping[row.role_id] || null }),
    }, transaction);

  await cloneChildRows("QuotationFormatCustomSection", {
    pk: "custom_section_id",
    parentKey: "quotation_format_id",
    parentMapping: quotationFormatCreated,
    ownership: { ...tenancy, ...audit },
  }, transaction);

  const masterSectionMapping = await cloneChildRows("MasterSection", {
    pk: "master_section_id",
    parentKey: "quotation_format_id",
    parentMapping: quotationFormatCreated,
    ownership: { ...tenancy, ...audit },
  }, transaction);

  const masterSectionHeaderMapping = await cloneChildRows("MasterSectionHeader", {
    pk: "master_section_header_id",
    parentKey: "master_section_id",
    parentMapping: masterSectionMapping,
  }, transaction);

  await cloneChildRows("MasterSectionItem", {
    pk: "master_section_item_id",
    parentKey: "master_section_header_id",
    parentMapping: masterSectionHeaderMapping,
  }, transaction);

  // Variation approval thresholds — which role may sign off what amount.
  // role_id is NOT NULL here, so a threshold whose role this company does not
  // have is skipped rather than written with the demo builder's role.
  const sourceApprovals = await db.JobVariationApproval.findAll({
    where: sourceBuilderScope,
    transaction,
  });
  for (const approval of sourceApprovals) {
    const targetRoleId = roleMapping[approval.role_id];
    if (!targetRoleId) continue;

    const exists = await db.JobVariationApproval.findOne({
      where: {
        role_id: targetRoleId,
        amount: approval.amount,
        builder_id: targetBuilderId,
        is_sample_data: true,
        sample_data_owner_id: targetUserId,
      },
      transaction,
    });
    if (exists) continue;

    await db.JobVariationApproval.create({
      ...approval.get({ plain: true }),
      job_variation_approval_id: undefined,
      role_id: targetRoleId,
      ...tenancy,
      ...audit,
      is_sample_data: true,
    }, { transaction });
  }

  // Maintenance areas — the list a job's maintenance requests are filed against.
  await cloneMasterRows("MaintenanceArea", {
    pk: "maintenance_area_id",
    matchOn: ["name"],
    sourceWhere: sourceBuilderScope,
    targetWhere: targetUserScope,
    ownership: { ...tenancy, ...audit },
  }, transaction);

  // Quotation Terms Settings Master.
  //
  // A document of its OWN, flagged and owned like every other seeded master —
  // deliberately not the builder's row. `quotation_terms` holds one document per
  // builder, so writing the demo wording into that row made the two the same
  // document: the import overwrote whatever the builder had written and
  // confirmed, and from then on every edit, Confirm or Sync in Settings → Terms
  // & Conditions rewrote what the demo quotations resolved to. The two must be
  // able to move independently, which means there have to be two of them.
  //
  // `quotation_terms_builder_sample_uq` keys this row by (builder, owner), so a
  // colleague importing later gets their own rather than colliding on this one.
  const sourceTerms = await db.QuotationTerms.findOne({
    where: { builder_id: sourceBuilderId, is_sample_data: { [Op.not]: true } },
    transaction,
  });
  if (sourceTerms) {
    let targetTerms = await db.QuotationTerms.findOne({
      where: targetUserScope,
      transaction,
    });
    if (!targetTerms) {
      targetTerms = await db.QuotationTerms.create({
        ...sourceTerms.get({ plain: true }),
        quotation_terms_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        // NOT randomUUID: the public terms route accepts 32 hex characters and
        // nothing else, so a dashed UUID is refused as an invalid link before it
        // is ever looked up. See newPublicToken.
        public_token: newPublicToken(),
        ...audit,
        is_sample_data: true,
        sample_data_owner_id: targetUserId,
      }, { transaction });
    } else {
      // A re-sync refreshing the demo dataset from the demo account. This is the
      // only thing that may change these words — which is what "Sample Data stays
      // fixed unless Sample Data itself is updated" comes down to.
      await targetTerms.update({
        title: sourceTerms.title,
        intro: sourceTerms.intro,
        sections: sourceTerms.sections,
        footer_note: sourceTerms.footer_note,
        confirmed_snapshot: sourceTerms.confirmed_snapshot,
        version: sourceTerms.version,
        is_confirmed: sourceTerms.is_confirmed,
        confirmed_at: sourceTerms.confirmed_at,
        is_active: sourceTerms.is_active,
        updated_by: targetUserId,
      }, { transaction });
    }
    termsMapping[sourceTerms.quotation_terms_id] = targetTerms.quotation_terms_id;
  }

  // Client types are seeded per company rather than copied, so the lead clone
  // below matches them by name instead of carrying the demo id across.
  const sourceClientTypes = await db.ClientType.findAll({ where: sourceBuilderScope, transaction });
  const targetClientTypes = await db.ClientType.findAll({ where: { builder_id: targetBuilderId }, transaction });
  const clientTypeMapping = {};
  for (const source of sourceClientTypes) {
    const match = targetClientTypes.find(t => t.client_type === source.client_type);
    if (match) clientTypeMapping[source.client_type_id] = match.client_type_id;
  }

  // Match Job Stages
  const sourceStages = await db.JobProcessStage.findAll({ where: sourceBuilderScope, transaction });
  const targetStages = await db.JobProcessStage.findAll({ where: { builder_id: targetBuilderId }, transaction });
  const stageMapping = {};
  for (const s of sourceStages) {
    const matchingTarget = targetStages.find(t => t.name === s.name);
    if (matchingTarget) {
      stageMapping[s.stage_id] = matchingTarget.stage_id;
    }
  }

  await reportPhase("catalog");

  // --- 2. Copy Project Data (Leads, Opportunities, Quotations, Jobs) ---

  const leads = await db.Leads.findAll({ where: sourceBuilderScope, transaction });
  const leadMapping = {};
  const leadContactMapping = {};
  const propertyDetailMapping = {};

  /**
   * Source id → target id for the records an EARLIER import already brought
   * across, which this run therefore skips.
   *
   * Kept strictly apart from `leadMapping` / `jobMapping`: those two are what
   * stop a sync cloning a pipeline that is already here, so nothing that copies
   * an opportunity, quotation, job or task may consult this. It exists for the
   * records that need to ATTACH to that pipeline rather than rebuild it — the
   * Activity timeline and Site Check-In — which is safe for them precisely
   * because each de-duplicates on its own content before inserting.
   *
   * Without it a sync into a company that already holds sample data resolves
   * nothing: every lead is skipped, so no opportunity, quotation or job is
   * reached either, and each new Activity line is dropped as "owner not
   * cloned".
   */
  const priorImportMapping = {};

  for (const lead of leads) {
    // Sync re-runs this importer without purging first, so a lead that already
    // came across is skipped outright — it stays out of leadMapping, which is
    // what keeps the opportunity / quotation / job / activity clones below from
    // building a second copy of a pipeline that is already here.
    const existingLead = await db.Leads.findOne({
      where: {
        reference_number: lead.reference_number,
        builder_id: targetBuilderId,
        ...ownSample,
      },
      transaction,
    });

    let targetPropertyDetailId = null;
    let sourceCompactionFileId = null;
    let targetLeadId = null;

    if (existingLead) {
      await deleteSampleLeadChildren([existingLead.leads_id], {}, [], transaction);
      await db.LeadsContactMap.destroy({ where: { leads_id: existingLead.leads_id }, transaction });

      // 2. Clone/Update PropertyDetail
      if (existingLead.property_detail_id) {
        const pd = await db.PropertyDetail.findByPk(existingLead.property_detail_id, {
          transaction,
          skipImageResolve: true,
        });
        if (pd && lead.property_detail_id) {
          const sourcePd = await db.PropertyDetail.findByPk(lead.property_detail_id, {
            transaction,
            skipImageResolve: true,
          });
          if (sourcePd) {
            await removeImageByRef(pd.compaction_report_url, transaction);
            await pd.update({
              ...sourcePd.get({ plain: true }),
              property_detail_id: undefined,
              estate_id: estateMapping[sourcePd.estate_id] || null,
              estate_stage_id: estateStageMapping[sourcePd.estate_stage_id] || null,
              lot_id: null,
              compaction_report_url: null,
              is_sample_data: true,
            }, { transaction });
            targetPropertyDetailId = pd.property_detail_id;
            propertyDetailMapping[lead.property_detail_id] = pd.property_detail_id;
            idMapping[pd.property_detail_id] = pd.property_detail_id;
            sourceCompactionFileId = sourcePd.compaction_report_url;
          }
        }
      } else if (lead.property_detail_id) {
        const pd = await db.PropertyDetail.findByPk(lead.property_detail_id, {
          transaction,
          skipImageResolve: true,
        });
        if (pd) {
          const clonedPd = await db.PropertyDetail.create({
            ...pd.get({ plain: true }),
            property_detail_id: undefined,
            estate_id: estateMapping[pd.estate_id] || null,
            estate_stage_id: estateStageMapping[pd.estate_stage_id] || null,
            lot_id: null,
            compaction_report_url: null,
            is_sample_data: true,
          }, { transaction });
          targetPropertyDetailId = clonedPd.property_detail_id;
          propertyDetailMapping[lead.property_detail_id] = clonedPd.property_detail_id;
          idMapping[pd.property_detail_id] = clonedPd.property_detail_id;
          sourceCompactionFileId = pd.compaction_report_url;
        }
      }

      // 3. Update Lead
      await existingLead.update({
        ...lead.get({ plain: true }),
        leads_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        property_detail_id: targetPropertyDetailId,
        lead_source_id: leadSourceMapping[lead.lead_source_id] || null,
        client_type_id: clientTypeMapping[lead.client_type_id] || null,
        house_land_package_id: null,
        assignee_id: mappedUser(lead.assignee_id),
        created_by: targetUserId,
        updated_by: targetUserId,
        is_sample_data: true,
        sample_data_owner_id: targetUserId,
      }, { transaction });

      targetLeadId = existingLead.leads_id;
      leadMapping[lead.leads_id] = existingLead.leads_id;
      idMapping[lead.leads_id] = existingLead.leads_id;
    } else {
      // Clone PropertyDetail if any. compaction_report_url is a DriveFile UUID
      // FK, so read it raw (see the FloorPlan note above) and copy the file only
      // after the lead exists — the DriveFile row is scoped to the cloned lead.
      if (lead.property_detail_id) {
        const pd = await db.PropertyDetail.findByPk(lead.property_detail_id, {
          transaction,
          skipImageResolve: true,
        });
        if (pd) {
          // Tracked so the property's compaction report and any other file filed
          // against it can find its new owner in the Drive sweep below.
          const clonedPd = await db.PropertyDetail.create({
            ...pd.get({ plain: true }),
            property_detail_id: undefined,
            // The estate this block sits in was cloned above; lot_id is not, so it
            // is dropped rather than left pointing at the demo builder's lot.
            estate_id: estateMapping[pd.estate_id] || null,
            estate_stage_id: estateStageMapping[pd.estate_stage_id] || null,
            lot_id: null,
            compaction_report_url: null,
            is_sample_data: true,
          }, { transaction });
          targetPropertyDetailId = clonedPd.property_detail_id;
          idMapping[pd.property_detail_id] = clonedPd.property_detail_id;
          sourceCompactionFileId = pd.compaction_report_url;
        }
      }

      // Clone Lead. lead_source_id and client_type_id are rewritten to this
      // builder's own rows — carried across unchanged they pointed at the demo
      // builder, which is why the lead's More Info panel came through blank.
      const clonedLead = await db.Leads.create({
        ...lead.get({ plain: true }),
        leads_id: undefined,
        company_id: targetCompanyId,
        builder_id: targetBuilderId,
        property_detail_id: targetPropertyDetailId,
        lead_source_id: leadSourceMapping[lead.lead_source_id] || null,
        client_type_id: clientTypeMapping[lead.client_type_id] || null,
        house_land_package_id: null,
        assignee_id: mappedUser(lead.assignee_id),
        created_by: targetUserId,
        updated_by: targetUserId,
        is_sample_data: true,
        sample_data_owner_id: targetUserId,
      }, { transaction });
      targetLeadId = clonedLead.leads_id;
      leadMapping[lead.leads_id] = clonedLead.leads_id;
      idMapping[lead.leads_id] = clonedLead.leads_id;
    }

    if (targetPropertyDetailId && sourceCompactionFileId) {
      const clonedFileId = await cloneFile({
        sourceFileId: sourceCompactionFileId,
        companyId: targetCompanyId,
        builderId: targetBuilderId,
        uploadedBy: targetUserId,
        referenceId: targetPropertyDetailId,
        leadId: targetLeadId,
      });
      if (clonedFileId) {
        await db.PropertyDetail.update(
          { compaction_report_url: clonedFileId },
          { where: { property_detail_id: targetPropertyDetailId }, transaction },
        );
      }
    }

    // Contact mapping
    const contactMaps = await db.LeadsContactMap.findAll({ where: { leads_id: lead.leads_id }, transaction });
    for (const map of contactMaps) {
      if (map.contact_id) {
        const contactUser = await db.Users.findByPk(map.contact_id, { transaction });
        if (contactUser) {
          let clonedContactUser = await db.Users.findOne({
            where: { email: contactUser.email, company_id: targetCompanyId },
            transaction
          });

          let targetAddressId = null;
          if (clonedContactUser) {
            targetAddressId = clonedContactUser.address_id;
          }

          if (contactUser.address_id) {
            const addr = await db.Address.findByPk(contactUser.address_id, { transaction });
            if (addr) {
              if (targetAddressId) {
                const existingAddr = await db.Address.findByPk(targetAddressId, { transaction });
                if (existingAddr) {
                  await existingAddr.update({
                    ...addr.get({ plain: true }),
                    address_id: undefined,
                    is_sample_data: true,
                  }, { transaction });
                }
              } else {
                const clonedAddr = await db.Address.create({
                  ...addr.get({ plain: true }),
                  address_id: undefined,
                  is_sample_data: true,
                }, { transaction });
                targetAddressId = clonedAddr.address_id;
              }
            }
          }

          // Get Target Contact role
          const contactRole = await db.Role.findOne({
            where: { name: { [Op.iLike]: "contact" }, company_id: targetCompanyId },
            transaction,
          });

          if (!clonedContactUser) {
            clonedContactUser = await db.Users.create({
              ...contactUser.get({ plain: true }),
              users_id: undefined,
              company_id: targetCompanyId,
              builder_id: targetBuilderId,
              role_id: contactRole ? contactRole.role_id : contactUser.role_id,
              address_id: targetAddressId,
              is_sample_data: true,
            }, { transaction });
          } else {
            await clonedContactUser.update({
              ...contactUser.get({ plain: true }),
              users_id: undefined,
              company_id: targetCompanyId,
              builder_id: targetBuilderId,
              role_id: contactRole ? contactRole.role_id : contactUser.role_id,
              address_id: targetAddressId,
              is_sample_data: true,
            }, { transaction });
          }

          leadContactMapping[contactUser.users_id] = clonedContactUser.users_id;

          // Create mapping
          await db.LeadsContactMap.create({
            leads_id: targetLeadId,
            contact_id: clonedContactUser.users_id,
            is_sample_data: true,
          }, { transaction });
        }
      }
    }
  }

  // Opportunities
  const opportunities = await db.Opportunity.findAll({
    where: { leads_id: { [Op.in]: Object.keys(leadMapping) } },
    transaction
  });
  const opportunityMapping = {};
  for (const opp of opportunities) {
    const targetLeadId = leadMapping[opp.leads_id];
    if (targetLeadId) {
      let targetOpp = await db.Opportunity.findOne({
        where: { leads_id: targetLeadId },
        transaction
      });
      if (!targetOpp) {
        targetOpp = await db.Opportunity.create({
          ...opp.get({ plain: true }),
          opportunity_id: undefined,
          leads_id: targetLeadId,
          is_sample_data: true,
        }, { transaction });
      } else {
        await targetOpp.update({
          ...opp.get({ plain: true }),
          opportunity_id: undefined,
          leads_id: targetLeadId,
          is_sample_data: true,
        }, { transaction });
      }
      opportunityMapping[opp.opportunity_id] = targetOpp.opportunity_id;
      idMapping[opp.opportunity_id] = targetOpp.opportunity_id;
    }
  }

  // Quotations
  const quotations = await db.Quotation.findAll({
    where: { leads_id: { [Op.in]: Object.keys(leadMapping) } },
    transaction
  });
  const quotationMapping = {};
  const quotationLeadMapping = {};
  for (const q of quotations) {
    const targetLeadId = leadMapping[q.leads_id];
    if (targetLeadId) {
      let targetQ = await db.Quotation.findOne({
        where: {
          reference_number: q.reference_number,
          leads_id: targetLeadId,
          is_sample_data: true,
        },
        transaction
      });
      if (!targetQ) {
        targetQ = await db.Quotation.create({
          ...q.get({ plain: true }),
          quotation_id: undefined,
          leads_id: targetLeadId,
          is_sample_data: true,
          created_by: targetUserId,
          updated_by: targetUserId,
        }, { transaction });
      } else {
        await targetQ.update({
          ...q.get({ plain: true }),
          quotation_id: undefined,
          leads_id: targetLeadId,
          is_sample_data: true,
          updated_by: targetUserId,
        }, { transaction });
      }
      quotationMapping[q.quotation_id] = targetQ.quotation_id;
      // Files cloned onto this quotation's versions are filed against the lead.
      quotationLeadMapping[q.quotation_id] = targetLeadId;
      idMapping[q.quotation_id] = targetQ.quotation_id;
    }
  }

  // Quotation Versions
  const qVersions = await db.QuotationVersion.findAll({
    where: { quotation_id: { [Op.in]: Object.keys(quotationMapping) } },
    transaction
  });
  const qVersionMapping = {};
  for (const qv of qVersions) {
    const targetQId = quotationMapping[qv.quotation_id];
    if (targetQId) {
      // structure_engineer_report / quotation_version_detail hold DriveFile PKs,
      // so read the row raw and re-point them at freshly cloned files below.
      const rawVersionFiles = await getRawImageColumns(
        "quotation_version",
        "quotation_version_id",
        qv.quotation_version_id,
        ["structure_engineer_report", "quotation_version_detail"],
        transaction,
      );

      // Every one of these is `mapping[sourceId] || null`, and a miss is
      // indistinguishable from "the source had none" once the row is written.
      // That silence is expensive: a version that loses range_id and
      // dwelling_type_id opens with both pickers empty, which disables Plan,
      // Facade, Package and Structural Engineer in turn — the quotation looks
      // blank and nothing says why. Name the drops so the log identifies which
      // catalog pass came up short instead of leaving it to be guessed at.
      const remapCatalogRef = (column, sourceId, mapping) => {
        if (!sourceId) return null;
        const targetId = mapping[sourceId] || null;
        if (!targetId) {
          console.warn(
            `[importDummyProjectData] quotation version ${qv.quotation_version_id}: ` +
            `${column} ${sourceId} has no clone — the source row was not carried across ` +
            "by its catalog pass, so this reference is being dropped.",
          );
        }
        return targetId;
      };

      let targetQv = await db.QuotationVersion.findOne({
        where: {
          quotation_id: targetQId,
          quotation_version_no: qv.quotation_version_no,
          is_sample_data: true,
        },
        transaction
      });

      if (targetQv) {
        const rawTargetVersionFiles = await getRawImageColumns(
          "quotation_version",
          "quotation_version_id",
          targetQv.quotation_version_id,
          ["structure_engineer_report", "quotation_version_detail"],
          transaction,
        );
        await removeImageByRef(rawTargetVersionFiles.structure_engineer_report, transaction);
        await removeImageByRef(rawTargetVersionFiles.quotation_version_detail, transaction);

        await db.QuotationVersionPricelistItemMap.destroy({ where: { quotation_version_id: targetQv.quotation_version_id }, transaction });
        await db.QuotationVersionCustomSection.destroy({ where: { quotation_version_id: targetQv.quotation_version_id }, transaction });
        await db.QuotationVersionPackageMap.destroy({ where: { quotation_version_id: targetQv.quotation_version_id }, transaction });
        await db.QuotationVersionItem.destroy({ where: { quotation_version_id: targetQv.quotation_version_id }, transaction });

        await targetQv.update({
          ...qv.get({ plain: true }),
          quotation_version_id: undefined,
          quotation_id: targetQId,
          floor_plan_id: remapCatalogRef("floor_plan_id", qv.floor_plan_id, floorPlanMapping),
          facade_id: remapCatalogRef("facade_id", qv.facade_id, facadeMapping),
          package_id: remapCatalogRef("package_id", qv.package_id, packageMapping),
          location_id: remapCatalogRef("location_id", qv.location_id, locationMapping),
          range_id: remapCatalogRef("range_id", qv.range_id, rangeMapping),
          dwelling_type_id: remapCatalogRef(
            "dwelling_type_id", qv.dwelling_type_id, dwellingTypeMapping,
          ),
          structure_engineer_id: remapCatalogRef(
            "structure_engineer_id", qv.structure_engineer_id, structureEngineerMapping,
          ),
          structure_engineer_report: null,
          quotation_version_detail: null,
          esign_envelope_id: null,
          is_sample_data: true,
        }, { transaction });
      } else {
        targetQv = await db.QuotationVersion.create({
          ...qv.get({ plain: true }),
          quotation_version_id: undefined,
          quotation_id: targetQId,
          floor_plan_id: remapCatalogRef("floor_plan_id", qv.floor_plan_id, floorPlanMapping),
          facade_id: remapCatalogRef("facade_id", qv.facade_id, facadeMapping),
          package_id: remapCatalogRef("package_id", qv.package_id, packageMapping),
          location_id: remapCatalogRef("location_id", qv.location_id, locationMapping),
          range_id: remapCatalogRef("range_id", qv.range_id, rangeMapping),
          dwelling_type_id: remapCatalogRef(
            "dwelling_type_id", qv.dwelling_type_id, dwellingTypeMapping,
          ),
          structure_engineer_id: remapCatalogRef(
            "structure_engineer_id", qv.structure_engineer_id, structureEngineerMapping,
          ),
          structure_engineer_report: null,
          quotation_version_detail: null,
          esign_envelope_id: null,
          is_sample_data: true,
        }, { transaction });
      }

      qVersionMapping[qv.quotation_version_id] = targetQv.quotation_version_id;
      idMapping[qv.quotation_version_id] = targetQv.quotation_version_id;

      // The engineer's report and the engineering-requirement document. Each
      // gets its own drive_files row and its own S3 object, so deleting the
      // sample data can never remove the demo account's copy.
      //
      // Through `cloneFile`, never `cloneImageDriveFile` directly: that is what
      // carries `folderMapping`, and these two documents live in My Drive
      // buckets (Structure Engineer Reports, Engineering Requirements) rather
      // than only on the version. Cloned without it they landed folder-less —
      // reachable from the quotation, invisible in My Drive — and, holding the
      // polymorphic tuple, they then made `cloneDriveFiles` skip the source
      // file as already imported, so the bucket stayed empty.
      const versionFileUpdates = {};
      for (const column of ["structure_engineer_report", "quotation_version_detail"]) {
        const clonedFileId = await cloneFile({
          sourceFileId: rawVersionFiles[column],
          companyId: targetCompanyId,
          builderId: targetBuilderId,
          uploadedBy: targetUserId,
          referenceId: targetQv.quotation_version_id,
          leadId: quotationLeadMapping[qv.quotation_id] || null,
        });
        if (clonedFileId) versionFileUpdates[column] = clonedFileId;
      }
      if (Object.keys(versionFileUpdates).length > 0) {
        await db.QuotationVersion.update(versionFileUpdates, {
          where: { quotation_version_id: targetQv.quotation_version_id },
          transaction,
        });
      }

      const sourceQvTerms = await db.QuotationVersionTerms.findOne({
        where: { quotation_version_id: qv.quotation_version_id },
        transaction,
      });
      if (sourceQvTerms) {
        let targetQvTerms = await db.QuotationVersionTerms.findOne({
          where: { quotation_version_id: targetQv.quotation_version_id },
          transaction,
        });
        if (targetQvTerms) {
          await targetQvTerms.update({
            quotation_terms_id: termsMapping[sourceQvTerms.quotation_terms_id] || null,
            terms_snapshot: sourceQvTerms.terms_snapshot,
            terms_version: sourceQvTerms.terms_version,
            synced_at: sourceQvTerms.synced_at,
          }, { transaction });
        } else {
          await db.QuotationVersionTerms.create({
            ...sourceQvTerms.get({ plain: true }),
            quotation_version_terms_id: undefined,
            quotation_version_id: targetQv.quotation_version_id,
            quotation_terms_id: termsMapping[sourceQvTerms.quotation_terms_id] || null,
            company_id: targetCompanyId,
            builder_id: targetBuilderId,
            // Same 32-hex format the public route accepts — see above.
            public_token: newPublicToken(),
            // Flagged so the read-only guard refuses a main-account Sync that
            // reached this row: the wording a demo quotation was imported with
            // is not the builder's to re-freeze.
            is_sample_data: true,
            sample_data_owner_id: targetUserId,
          }, { transaction });
        }
      } else {
        await db.QuotationVersionTerms.destroy({
          where: { quotation_version_id: targetQv.quotation_version_id },
          transaction,
        });
      }

      // maps & items
      const pliMaps = await db.QuotationVersionPricelistItemMap.findAll({
        where: { quotation_version_id: qv.quotation_version_id },
        transaction
      });
      for (const map of pliMaps) {
        await db.QuotationVersionPricelistItemMap.create({
          ...map.get({ plain: true }),
          id: undefined,
          quotation_version_id: targetQv.quotation_version_id,
          price_list_item_id: priceListItemMapping[map.price_list_item_id] || null,
          is_sample_data: true,
        }, { transaction });
      }

      const customSecs = await db.QuotationVersionCustomSection.findAll({
        where: { quotation_version_id: qv.quotation_version_id },
        transaction
      });
      for (const sec of customSecs) {
        await db.QuotationVersionCustomSection.create({
          ...sec.get({ plain: true }),
          // This table's PK is custom_section_id, not id — clearing the wrong
          // key left the source PK in place and collided on insert.
          custom_section_id: undefined,
          quotation_version_id: targetQv.quotation_version_id,
          ...(await cloneFileColumns(sec.get({ plain: true }), "QuotationVersionCustomSection")),
          is_sample_data: true,
        }, { transaction });
      }

      const pkgMaps = await db.QuotationVersionPackageMap.findAll({
        where: { quotation_version_id: qv.quotation_version_id },
        transaction
      });
      for (const map of pkgMaps) {
        await db.QuotationVersionPackageMap.create({
          ...map.get({ plain: true }),
          id: undefined,
          quotation_version_id: targetQv.quotation_version_id,
          package_id: packageMapping[map.package_id] || null,
          is_sample_data: true,
        }, { transaction });
      }

      // Quotation line items. These are snapshots — most columns are copied
      // text and prices — but they also keep live pointers back at the catalog,
      // and those have to be rewritten. The quotation screen decides whether a
      // line is "selected" by joining price_list_item_id against
      // package_pricelist_item_map / floor_plan_pricelist_item_map, and the
      // Quotation History drawer matches on price_list_id / price_list_item_id;
      // left on the demo builder's ids every one of those joins misses.
      const qvItems = await db.QuotationVersionItem.findAll({
        where: { quotation_version_id: qv.quotation_version_id },
        transaction
      });
      for (const item of qvItems) {
        await db.QuotationVersionItem.create({
          ...item.get({ plain: true }),
          quotation_version_item_id: undefined,
          quotation_version_id: targetQv.quotation_version_id,
          price_list_id: priceListMapping[item.price_list_id] || null,
          price_list_item_id: priceListItemMapping[item.price_list_item_id] || null,
          package_id: packageMapping[item.package_id] || null,
          price_list_item_range_id: remapIds(item.price_list_item_range_id, rangeMapping),
          price_list_item_dwelling_type_id: remapIds(
            item.price_list_item_dwelling_type_id, dwellingTypeMapping,
          ),
          is_sample_data: true,
        }, { transaction });
      }
    }
  }

  // Jobs
  const jobs = await db.Job.findAll({
    where: { opportunity_id: { [Op.in]: Object.keys(opportunityMapping) } },
    transaction
  });
  const jobMapping = {};
  // Accumulated across every job, because the Documents pass runs once at the
  // end and needs them all. Maintenance owns three reference_types of its own
  // (Maintenance documents, MaintenanceSiteImage, MaintenanceTaskAttachment)
  // whose files are keyed by the maintenance / task id rather than the job's,
  // so without these the site images had no owner to follow and were dropped.
  const maintenanceMappingAll = {};
  const maintenanceTaskMappingAll = {};
  for (const job of jobs) {
    const targetOppId = opportunityMapping[job.opportunity_id];
    const targetQvId = qVersionMapping[job.quotation_version_id] || null;
    const targetCustContactId = leadContactMapping[job.customer_contact_id] || null;

    if (targetOppId) {
      let clonedJob = await db.Job.findOne({
        where: {
          reference_number: job.reference_number,
          opportunity_id: targetOppId,
          is_sample_data: true,
        },
        transaction
      });

      if (clonedJob) {
        const rawTargetJobFiles = await getRawImageColumns(
          "job",
          "job_id",
          clonedJob.job_id,
          ["color_report", "color_document"],
          transaction,
        );
        await removeImageByRef(rawTargetJobFiles.color_report, transaction);
        await removeImageByRef(rawTargetJobFiles.color_document, transaction);

        await deleteSampleJobTrees([clonedJob.job_id], {}, [], transaction);
        await db.JobInvoicePayment.destroy({
          where: {
            job_invoice_id: {
              [Op.in]: (await db.JobInvoice.findAll({ where: { job_id: clonedJob.job_id }, attributes: ["job_invoice_id"], transaction })).map(i => i.job_invoice_id)
            }
          },
          transaction
        });
        await db.JobInvoice.destroy({ where: { job_id: clonedJob.job_id }, transaction });

        const targetTasks = await db.JobTask.findAll({ where: { job_id: clonedJob.job_id }, attributes: ["job_process_task_id"], transaction });
        const targetTaskIds = targetTasks.map(t => t.job_process_task_id);
        if (targetTaskIds.length > 0) {
          await db.JobTaskDependency.destroy({ where: { task_id: { [Op.in]: targetTaskIds } }, transaction });
          await db.JobSubtask.destroy({ where: { job_process_task_id: { [Op.in]: targetTaskIds } }, transaction });
          await db.JobTask.destroy({ where: { job_id: clonedJob.job_id }, transaction });
        }
        await db.JobSubStage.destroy({ where: { job_id: clonedJob.job_id }, transaction });

        await clonedJob.update({
          ...job.get({ plain: true }),
          job_id: undefined,
          // Unique per row (job_tracking_token_unique_idx) and the public
          // tracking link's identity — keep the clone's own token rather than
          // overwriting it with the demo job's.
          tracking_token: clonedJob.tracking_token,
          opportunity_id: targetOppId,
          quotation_version_id: targetQvId,
          customer_contact_id: targetCustContactId,
          supervisor_id: mappedUser(job.supervisor_id),
          completion_approver_user_id: mappedUser(job.completion_approver_user_id),
          company_id: targetCompanyId,
          builder_id: targetBuilderId,
          color_report: null,
          color_document: null,
          is_sample_data: true,
          sample_data_owner_id: targetUserId,
        }, { transaction });
      } else {
        clonedJob = await db.Job.create({
          ...job.get({ plain: true }),
          job_id: undefined,
          // Unique per row (job_tracking_token_unique_idx) — dropped so the
          // column default mints a fresh uuid for the clone.
          tracking_token: undefined,
          opportunity_id: targetOppId,
          quotation_version_id: targetQvId,
          customer_contact_id: targetCustContactId,
          supervisor_id: mappedUser(job.supervisor_id),
          completion_approver_user_id: mappedUser(job.completion_approver_user_id),
          company_id: targetCompanyId,
          builder_id: targetBuilderId,
          color_report: null,
          color_document: null,
          is_sample_data: true,
          sample_data_owner_id: targetUserId,
        }, { transaction });
      }
      jobMapping[job.job_id] = clonedJob.job_id;

      // Through `cloneFile` for the same reason as the quotation version's two
      // documents above: the colour report and colour schedule belong in their
      // My Drive buckets, and only `cloneFile` passes the folder map.
      const jobFileUpdates = {};
      for (const column of ["color_report", "color_document"]) {
        const clonedFileId = await cloneFile({
          sourceFileId: job[column],
          companyId: targetCompanyId,
          builderId: targetBuilderId,
          uploadedBy: targetUserId,
          referenceId: clonedJob.job_id,
        });
        if (clonedFileId) jobFileUpdates[column] = clonedFileId;
      }
      if (Object.keys(jobFileUpdates).length > 0) {
        await db.Job.update(jobFileUpdates, {
          where: { job_id: clonedJob.job_id },
          transaction,
        });
      }
      idMapping[job.job_id] = clonedJob.job_id;

      // SubStages
      const subStages = await db.JobSubStage.findAll({ where: { job_id: job.job_id }, transaction });
      const subStageMapping = {};
      for (const ss of subStages) {
        // A stage this builder does not have is skipped rather than written with
        // the demo builder's stage_id — the workflow screens read the stage to
        // decide which functionality (Preconstruction, Colour, …) a sub-stage
        // belongs to, and a cross-tenant id resolves to nothing there.
        const targetStageId = stageMapping[ss.stage_id];
        if (!targetStageId) continue;

        const clonedSs = await db.JobSubStage.create({
          ...ss.get({ plain: true }),
          sub_stage_id: undefined,
          job_id: clonedJob.job_id,
          stage_id: targetStageId,
          company_id: targetCompanyId,
          builder_id: targetBuilderId,
          is_sample_data: true,
        }, { transaction });
        subStageMapping[ss.sub_stage_id] = clonedSs.sub_stage_id;
        idMapping[ss.sub_stage_id] = clonedSs.sub_stage_id;
      }

      // Tasks
      const jobTasks = await db.JobTask.findAll({ where: { job_id: job.job_id }, transaction });
      const taskMapping = {};
      for (const jt of jobTasks) {
        const targetSsId = subStageMapping[jt.sub_stage_id];
        if (targetSsId) {
          const clonedJt = await db.JobTask.create({
            ...jt.get({ plain: true }),
            job_process_task_id: undefined,
            job_id: clonedJob.job_id,
            sub_stage_id: targetSsId,
            assignee_id: roleMapping[jt.assignee_id] || null,
            // The named assignee and the document folder both belong to the
            // demo builder; the role above is what the workflow actually uses.
            assignee_user_id: mappedUser(jt.assignee_user_id),
            folder_id: null,
            company_id: targetCompanyId,
            builder_id: targetBuilderId,
            is_sample_data: true,
          }, { transaction });
          taskMapping[jt.job_process_task_id] = clonedJt.job_process_task_id;
          idMapping[jt.job_process_task_id] = clonedJt.job_process_task_id;

          // Subtasks
          const subtasks = await db.JobSubtask.findAll({
            where: { job_process_task_id: jt.job_process_task_id },
            transaction
          });
          for (const st of subtasks) {
            await db.JobSubtask.create({
              ...st.get({ plain: true }),
              job_process_subtask_id: undefined,
              job_id: clonedJob.job_id,
              job_process_task_id: clonedJt.job_process_task_id,
              company_id: targetCompanyId,
              builder_id: targetBuilderId,
              is_sample_data: true,
            }, { transaction });
          }
        }
      }

      // Dependencies
      const dependencies = await db.JobTaskDependency.findAll({
        where: { task_id: { [Op.in]: Object.keys(taskMapping) } },
        transaction
      });
      for (const dep of dependencies) {
        const targetTaskId = taskMapping[dep.task_id];
        const targetPredId = taskMapping[dep.predecessor_task_id];
        if (targetTaskId && targetPredId) {
          await db.JobTaskDependency.create({
            task_id: targetTaskId,
            predecessor_task_id: targetPredId,
            is_sample_data: true,
          }, { transaction });
        }
      }

      // Invoices & Payments
      const invoices = await db.JobInvoice.findAll({ where: { job_id: job.job_id }, transaction });
      for (const inv of invoices) {
        const clonedInv = await db.JobInvoice.create({
          ...inv.get({ plain: true }),
          job_invoice_id: undefined,
          job_id: clonedJob.job_id,
          is_sample_data: true,
          created_by: targetUserId,
          updated_by: targetUserId,
        }, { transaction });
        idMapping[inv.job_invoice_id] = clonedInv.job_invoice_id;

        const payments = await db.JobInvoicePayment.findAll({
          where: { job_invoice_id: inv.job_invoice_id },
          transaction
        });
        for (const p of payments) {
          await db.JobInvoicePayment.create({
            ...p.get({ plain: true }),
            job_invoice_payment_id: undefined,
            job_invoice_id: clonedInv.job_invoice_id,
            is_sample_data: true,
            created_by: targetUserId,
          }, { transaction });
        }
      }

      // ── Job → Colour ──────────────────────────────────────────────────────
      // The job takes its own copy of the colour catalogue when colour
      // selection starts, so this whole tree is per-job data rather than a
      // pointer back into Settings → Colour.
      const jobScope = { job_id: clonedJob.job_id };
      const jobColorMapping = await cloneChildRows("JobColor", {
        pk: "color_id",
        parentKey: "job_id",
        parentMapping: { [job.job_id]: clonedJob.job_id },
        ownership: { ...tenancy, ...audit },
        remap: (row) => ({ template_color_id: colorMapping[row.template_color_id] || null }),
      }, transaction);

      const jobColorCategoryMapping = await cloneChildRows("JobColorCategory", {
        pk: "color_category_id",
        parentKey: "color_id",
        parentMapping: jobColorMapping,
        ownership: { ...jobScope, ...audit },
        remap: (row) => ({
          suppliers: remapIds(row.suppliers, supplierMapping),
          color_group: remapIds(row.color_group, colorGroupMapping),
        }),
      }, transaction);

      await cloneChildRows("JobColorSubCategory", {
        pk: "color_sub_category_id",
        parentKey: "color_category_id",
        parentMapping: jobColorCategoryMapping,
        ownership: { ...jobScope, created_by_id: targetUserId, updated_by_id: targetUserId },
        extraWhere: { is_deleted: false },
      }, transaction);

      const jobColorItemMapping = await cloneChildRows("JobColorItem", {
        pk: "color_item_id",
        parentKey: "color_category_id",
        parentMapping: jobColorCategoryMapping,
        ownership: { ...jobScope, ...tenancy },
        remap: (row) => ({
          color_id: jobColorMapping[row.color_id] || null,
          supplier_id: supplierMapping[row.supplier_id] || null,
          color_type_id: remapIds(row.color_type_id, colorTypeMapping),
          range_id: remapIds(row.range_id, rangeMapping),
        }),
      }, transaction);

      await cloneChildRows("JobColorItemCustomField", {
        pk: "color_item_custom_field_id",
        parentKey: "color_item",
        parentMapping: jobColorItemMapping,
        ownership: jobScope,
      }, transaction);

      await cloneChildRows("JobColorGroupItemMap", {
        pk: "id",
        parentKey: "color_item_id",
        parentMapping: jobColorItemMapping,
        ownership: jobScope,
        remap: (row) => ({ color_group_id: colorGroupMapping[row.color_group_id] || null }),
      }, transaction);

      // What the customer actually picked. color_item_id is NOT NULL here, so a
      // selection whose item did not come across is skipped.
      const colorSelections = await db.JobColorSelection.findAll({
        where: { job_id: job.job_id },
        transaction,
      });
      for (const selection of colorSelections) {
        const targetItemId = jobColorItemMapping[selection.color_item_id];
        if (!targetItemId) continue;
        await db.JobColorSelection.create({
          ...selection.get({ plain: true }),
          id: undefined,
          job_id: clonedJob.job_id,
          color_item_id: targetItemId,
          is_sample_data: true,
        }, { transaction });
      }

      // ── Job → Maintenance ─────────────────────────────────────────────────
      const maintenanceMapping = await cloneChildRows("Maintenance", {
        pk: "maintenance_id",
        parentKey: "job_id",
        parentMapping: { [job.job_id]: clonedJob.job_id },
        ownership: { ...tenancy, ...audit, customer_contact_id: targetCustContactId },
        remap: (row) => ({ supervisor_id: mappedUser(row.supervisor_id) }),
      }, transaction);

      // Requests are renumbered rather than copied wholesale — see
      // uniqueMaintenanceReference for why the source value cannot be kept.
      // maintenance.job_id is unique, so there is at most one maintenance per
      // job and a single counter is enough.
      const maintenanceRequestMapping = {};
      let requestSequence = 0;
      const sourceRequests = await db.MaintenanceRequest.findAll({
        where: { maintenance_id: { [Op.in]: Object.keys(maintenanceMapping) } },
        order: [["created_at", "ASC"]],
        transaction,
      });
      for (const request of sourceRequests) {
        const targetMaintenanceId = maintenanceMapping[request.maintenance_id];
        if (!targetMaintenanceId) continue;

        requestSequence += 1;
        const clonedRequest = await db.MaintenanceRequest.create({
          ...request.get({ plain: true }),
          maintenance_request_id: undefined,
          maintenance_id: targetMaintenanceId,
          reference_number: await uniqueMaintenanceReference(
            `${clonedJob.reference_number}-MR${requestSequence}`, transaction,
          ),
          ...tenancy,
          ...audit,
          ...(await cloneFileColumns(request.get({ plain: true }), "MaintenanceRequest")),
          is_sample_data: true,
        }, { transaction });
        maintenanceRequestMapping[request.maintenance_request_id] =
          clonedRequest.maintenance_request_id;
      }

      // request_sequence is the counter the app reads when the builder adds
      // their own request, so it has to match how many actually landed.
      if (requestSequence > 0) {
        await db.Maintenance.update({ request_sequence: requestSequence }, {
          where: { maintenance_id: { [Op.in]: Object.values(maintenanceMapping) } },
          transaction,
        });
      }

      const maintenanceTaskMapping = await cloneChildRows("MaintenanceRequestTask", {
        pk: "maintenance_request_task_id",
        parentKey: "maintenance_request_id",
        parentMapping: maintenanceRequestMapping,
        ownership: audit,
      }, transaction);

      Object.assign(maintenanceMappingAll, maintenanceMapping);
      Object.assign(maintenanceTaskMappingAll, maintenanceTaskMapping);

      // ── Job → Variations (the Variation report reads these) ───────────────
      // `items` is a JSONB snapshot of the line items and is copied as-is; the
      // relational rows below are what the report totals actually come from.
      const variationMapping = await cloneChildRows("JobVariation", {
        pk: "variation_id",
        parentKey: "job_id",
        parentMapping: { [job.job_id]: clonedJob.job_id },
        ownership: { ...tenancy, ...audit },
        // One `remap`, not two. These were separate keys in the same object
        // literal, so the second silently replaced the first and the approver
        // was never rewritten — every cloned variation kept the demo builder's
        // user id, which belongs to another tenant.
        remap: (row) => ({
          approved_by: mappedUser(row.approved_by),
          // Both are DriveFile FKs on the demo builder's files, and the invoice
          // belongs to a job invoice this clone did not track.
          signed_document: null,
          invoice_document: null,
          invoice_id: null,
        }),
      }, transaction);

      await cloneChildRows("JobVariationItem", {
        pk: "job_variation_item_id",
        parentKey: "variation_id",
        parentMapping: variationMapping,
        remap: (row) => ({
          price_list_id: priceListMapping[row.price_list_id] || null,
          price_list_item_id: priceListItemMapping[row.price_list_item_id] || null,
          range_id: remapIds(row.range_id, rangeMapping),
          dwelling_type_id: remapIds(row.dwelling_type_id, dwellingTypeMapping),
        }),
      }, transaction);

      // These three are the last ids the drive sweep and the Activity clone need
      // in order to place a maintenance attachment and a "Maintenance" log line;
      // without them both fall back to "owner not cloned" and drop the row.
      Object.assign(idMapping, maintenanceMapping, maintenanceRequestMapping, variationMapping);
    }
  }

  await reportPhase("pipeline");

  // --- 3. Copy the activity records that hang off leads and jobs ---
  //
  // These come last because they point at both: a task can belong to a lead's
  // Sales → Action timeline or a job's, and a note can be either.

  /**
   * A lead / job / maintenance id as it exists in THIS company, whether this run
   * cloned it or an earlier one did.
   *
   * Only for records that de-duplicate on their own before inserting. The
   * timeline clones below (actions, notes, SMS) have no such check and must keep
   * reading `leadMapping` alone, or a sync would copy a lead's whole history a
   * second time.
   */
  const resolvedSampleId = (sourceId) =>
    (sourceId && (idMapping[sourceId] || priorImportMapping[sourceId])) || null;

  // Lead → More Info: the brokers, consultants and other business contacts.
  await cloneChildRows("BusinessContact", {
    pk: "business_contact_id",
    parentKey: "leads_id",
    parentMapping: leadMapping,
  }, transaction);

  // Lead → Sales → Action: the task / note / appointment / SMS timeline.
  await cloneChildRows("Actions", {
    pk: "action_id",
    parentKey: "leads_id",
    parentMapping: leadMapping,
    remap: (row) => ({
      location_id: locationMapping[row.location_id] || null,
      link_to_user: mappedUser(row.link_to_user),
      users_id: remapIds(row.users_id, userMapping),
      // Note tags are seeded per builder rather than copied, so a demo tag id
      // would resolve to nothing here.
      notes_tag_id: [],
    }),
  }, transaction);

  // Standalone tasks and appointments. Both carry the flag themselves because
  // they exist with or without a lead, and both may belong to a job instead.
  //
  // `dateColumns` is the DATEONLY each one is scheduled by — the column the
  // Today / This Week tabs filter on, so it is carried forward with the rest of
  // the diary rather than left on the demo account's own week.
  for (const [modelName, pk, titleField, dateColumns] of [
    ["Task", "task_id", "name", ["due_date"]],
    ["Appointment", "appointment_id", "title", ["date"]],
  ]) {
    const rows = await db[modelName].findAll({
      where: { ...sourceBuilderScope, is_deleted: false },
      transaction,
    });
    for (const row of rows) {
      const plain = row.get({ plain: true });
      // Anything tied to a lead or job that is not present here is skipped —
      // copying it unattached would put an orphan on the target's task list.
      //
      // A lead an EARLIER import brought across counts as present: this used to
      // consult only what the current run cloned, so on a sync — where the leads
      // are all already here and none are re-cloned — every task and appointment
      // hanging off one was dropped, and a diary entry added to the demo account
      // could never reach a company that had already onboarded. Attaching them is
      // safe because the title check below is what stops a second copy, not the
      // absence of a mapping.
      const targetLeadId = resolvedSampleId(plain.lead_id);
      const targetJobId = resolvedSampleId(plain.job_id);
      if (plain.lead_id && !targetLeadId) continue;
      if (plain.job_id && !targetJobId) continue;

      // Same reason as the lead skip above — a sync must not double up on the
      // standalone records it already brought over.
      const alreadyImported = await db[modelName].findOne({
        where: {
          [titleField]: plain[titleField],
          builder_id: targetBuilderId,
          ...ownSample,
        },
        transaction,
      });
      if (alreadyImported) {
        await alreadyImported.update({
          ...plain,
          [pk]: undefined,
          ...tenancy,
          ...audit,
          lead_id: targetLeadId,
          job_id: targetJobId,
          link_to: mappedUser(plain.link_to),
          ...(modelName === "Task"
            ? { assignee_id: mappedUser(plain.assignee_id) }
            : { select_users: remapIds(plain.select_users, userMapping) }),
          ...Object.fromEntries(
            dateColumns.map(column => [column, shiftDateOnly(plain[column], scheduleOffset)]),
          ),
          ...(await cloneFileColumns(plain, modelName)),
          is_sample_data: true,
          sample_data_owner_id: targetUserId,
        }, { transaction });
        continue;
      }

      await db[modelName].create({
        ...plain,
        [pk]: undefined,
        ...tenancy,
        ...audit,
        lead_id: targetLeadId,
        job_id: targetJobId,
        link_to: mappedUser(plain.link_to),
        ...(modelName === "Task"
          ? { assignee_id: mappedUser(plain.assignee_id) }
          : { select_users: remapIds(plain.select_users, userMapping) }),
        ...Object.fromEntries(
          dateColumns.map(column => [column, shiftDateOnly(plain[column], scheduleOffset)]),
        ),
        ...(await cloneFileColumns(plain, modelName)),
        is_sample_data: true,
        sample_data_owner_id: targetUserId,
      }, { transaction });
    }
  }

  // Notes live on the lead (or on a job's timeline). task_id and parent_note_id
  // point at rows that were not copied, so both are dropped — a note keeps its
  // text and tags either way.
  await cloneChildRows("Notes", {
    pk: "notes_id",
    parentKey: "leads_id",
    parentMapping: leadMapping,
    remap: (row) => ({
      job_id: jobMapping[row.job_id] || null,
      task_id: null,
      parent_note_id: null,
      note_tag_id: [],
    }),
  }, transaction);

  await cloneChildRows("Sms", {
    pk: "sms_id",
    parentKey: "leads_id",
    parentMapping: leadMapping,
    remap: (row) => ({ recipient_id: leadContactMapping[row.recipient_id] || null }),
  }, transaction);

  // Lead → Activity: the audit trail the Activity tab renders. module_id points
  // at whichever record changed; it is display-only, so it is left as-is.
  await cloneChildRows("LeadActivityLog", {
    pk: "lead_activity_log_id",
    parentKey: "leads_id",
    parentMapping: leadMapping,
    remap: (row) => ({ user_id: mappedUser(row.user_id) }),
  }, transaction);

  // Job → Activity: the same audit trail on the job side, which the Activity tab
  // of a job renders. Without this a seeded job opens with an empty Activity tab
  // while its lead has a full history. module_id is display-only here too, so it
  // is left alone exactly as for the lead log above.
  await cloneChildRows("JobActivityLog", {
    pk: "job_activity_log_id",
    parentKey: "job_id",
    parentMapping: jobMapping,
    remap: (row) => ({ user_id: mappedUser(row.user_id) }),
  }, transaction);

  // Lead → Surveys, and the Survey report that reads the same rows. Each
  // response gets a fresh access_token: the column is globally UNIQUE, and the
  // token is the credential on the public survey link — copying the demo
  // account's would both collide and hand out a working link to its survey.
  const surveyResponses = await db.SurveyResponse.findAll({
    where: { lead_id: { [Op.in]: Object.keys(leadMapping) } },
    transaction,
  });
  for (const response of surveyResponses) {
    const plain = response.get({ plain: true });
    const targetTemplateId = surveyTemplateMapping[plain.survey_template_id];
    // survey_template_id is NOT NULL, so a response whose template did not come
    // across cannot be recreated.
    if (!targetTemplateId) continue;
    if (plain.job_id && !jobMapping[plain.job_id]) continue;

    const clonedResponse = await db.SurveyResponse.create({
      ...plain,
      survey_response_id: undefined,
      survey_template_id: targetTemplateId,
      lead_id: leadMapping[plain.lead_id],
      job_id: jobMapping[plain.job_id] || null,
      ...tenancy,
      access_token: randomUUID(),
      sent_by: mappedUser(plain.sent_by),
      is_sample_data: true,
    }, { transaction });

    const answers = await db.SurveyResponseAnswer.findAll({
      where: { survey_response_id: plain.survey_response_id },
      transaction,
    });
    for (const answer of answers) {
      await db.SurveyResponseAnswer.create({
        ...answer.get({ plain: true }),
        survey_response_answer_id: undefined,
        survey_response_id: clonedResponse.survey_response_id,
        // The question text is snapshotted on the answer, so a question that
        // did not map still renders in the report.
        survey_question_id: surveyQuestionMapping[answer.survey_question_id] || null,
        is_sample_data: true,
      }, { transaction });
    }
  }

  // To-dos. Job-scoped when a job is set, otherwise a standalone reminder.
  const todos = await db.Todo.findAll({ where: sourceBuilderScope, transaction });
  for (const todo of todos) {
    const plain = todo.get({ plain: true });
    // Same as the tasks above: a job an earlier import brought across still
    // counts, and the task_name check below is what prevents a second copy.
    const todoJobId = resolvedSampleId(plain.job_id);
    if (plain.job_id && !todoJobId) continue;

    const alreadyImported = await db.Todo.findOne({
      where: {
        task_name: plain.task_name,
        builder_id: targetBuilderId,
        ...ownSample,
      },
      transaction,
    });
    if (alreadyImported) {
      await alreadyImported.update({
        ...plain,
        todo_id: undefined,
        ...tenancy,
        ...audit,
        job_id: todoJobId,
        supplier_id: supplierMapping[plain.supplier_id] || null,
        site_supervisor_id: mappedUser(plain.site_supervisor_id),
        booking_date: shiftDateOnly(plain.booking_date, scheduleOffset),
        start_date: shiftDateOnly(plain.start_date, scheduleOffset),
        finish_date: shiftDateOnly(plain.finish_date, scheduleOffset),
        is_sample_data: true,
        sample_data_owner_id: targetUserId,
      }, { transaction });
      continue;
    }

    await db.Todo.create({
      ...plain,
      todo_id: undefined,
      ...tenancy,
      ...audit,
      job_id: todoJobId,
      supplier_id: supplierMapping[plain.supplier_id] || null,
      site_supervisor_id: mappedUser(plain.site_supervisor_id),
      // The three dates a to-do is scheduled by, moved with the rest of the
      // diary. All by the same amount, so a booking still precedes its start
      // and a start still precedes its finish.
      booking_date: shiftDateOnly(plain.booking_date, scheduleOffset),
      start_date: shiftDateOnly(plain.start_date, scheduleOffset),
      finish_date: shiftDateOnly(plain.finish_date, scheduleOffset),
      is_sample_data: true,
      sample_data_owner_id: targetUserId,
    }, { transaction });
  }

  // The jobs and maintenance rows under a lead an earlier import already
  // brought across. The lead itself was recorded when it was skipped, but its
  // pipeline was never walked — no opportunity was mapped, so the job loop
  // above never saw it — and both of the clones below name jobs directly.
  //
  // Jobs are found by reference_number, the same natural key the maintenance
  // numbering already trusts; maintenance is one row per job, so the job it
  // hangs off is enough to pair the two sides up.
  const priorLeadIds = Object.keys(priorImportMapping);
  if (priorLeadIds.length > 0) {
    const priorOpportunities = await db.Opportunity.findAll({
      where: { leads_id: { [Op.in]: priorLeadIds } },
      attributes: ["opportunity_id"],
      transaction,
    });
    const priorSourceJobs = priorOpportunities.length > 0
      ? await db.Job.findAll({
        where: { opportunity_id: { [Op.in]: priorOpportunities.map(o => o.opportunity_id) } },
        attributes: ["job_id", "reference_number"],
        transaction,
      })
      : [];

    const priorJobIdPairs = [];
    for (const job of priorSourceJobs) {
      const existingJob = await db.Job.findOne({
        where: {
          reference_number: job.reference_number,
          builder_id: targetBuilderId,
          ...ownSample,
        },
        attributes: ["job_id"],
        transaction,
      });
      if (!existingJob) continue;
      priorImportMapping[job.job_id] = existingJob.job_id;
      priorJobIdPairs.push([job.job_id, existingJob.job_id]);
    }

    if (priorJobIdPairs.length > 0) {
      const byJobId = async (jobIds, extra) => {
        const rows = await db.Maintenance.findAll({
          where: { job_id: { [Op.in]: jobIds }, ...extra },
          attributes: ["maintenance_id", "job_id"],
          transaction,
        });
        return new Map(rows.map(r => [r.job_id, r.maintenance_id]));
      };
      const sourceMaintenance = await byJobId(priorJobIdPairs.map(([source]) => source), {});
      const targetMaintenance = await byJobId(
        priorJobIdPairs.map(([, target]) => target), { is_sample_data: true },
      );
      // No owner filter on the target side: the jobs it reads were matched by
      // `ownSample` just above, so these rows are already this user's.

      for (const [sourceJobId, targetJobId] of priorJobIdPairs) {
        const sourceId = sourceMaintenance.get(sourceJobId);
        const targetId = targetMaintenance.get(targetJobId);
        if (sourceId && targetId) priorImportMapping[sourceId] = targetId;
      }
    }
  }

  // ── Settings → Site Check-In: the QR form's field template ─────────────────
  //
  // Read by company rather than by builder, which is how the module itself is
  // scoped: the QR link carries company_id as its token and every lookup, on
  // both the builder and the public side, keys on that alone. A row filed under
  // a demo builder whose builder_id is null would be invisible to the builder
  // scope the rest of this importer uses.
  const siteCheckinFieldMapping = {};
  const sourceCheckinFields = await db.SiteCheckinField.findAll({
    where: { company_id: sourceCompanyId },
    order: [["display_order", "ASC"], ["created_at", "ASC"]],
    transaction,
  });
  for (const field of sourceCheckinFields) {
    const plain = field.get({ plain: true });

    // The module seeds its own default template the first time Settings →
    // Site Check-In is opened, and the demo account's list started from that
    // same template. Matching on the label reuses whatever is already here
    // instead of showing the supplier two "Hard Hat" tick-boxes.
    let target = await db.SiteCheckinField.findOne({
      where: { company_id: targetCompanyId, label: plain.label },
      transaction,
    });
    if (!target) {
      target = await db.SiteCheckinField.create({
        ...plain,
        site_checkin_field_id: undefined,
        ...tenancy,
        ...audit,
        is_sample_data: true,
      }, { transaction });
    } else {
      await target.update({
        ...plain,
        site_checkin_field_id: undefined,
        ...tenancy,
        ...audit,
        is_sample_data: true,
      }, { transaction });
    }
    siteCheckinFieldMapping[plain.site_checkin_field_id] = target.site_checkin_field_id;
  }

  // The check-ins themselves — what the Site Check-In list and its detail
  // drawer render.
  //
  // `responses` is a JSONB object keyed by site_checkin_field_id, so every key
  // has to be rewritten onto this company's own fields: the drawer looks each
  // answer up by field id and renders nothing at all for one it cannot resolve.
  // An answer whose field did not come across is dropped rather than kept under
  // a key pointing into the demo company.
  let checkinsCloned = 0;
  let checkinsRelinked = 0;
  const sourceCheckins = await db.SiteCheckinRecord.findAll({
    where: { company_id: sourceCompanyId },
    transaction,
  });
  for (const record of sourceCheckins) {
    const plain = record.get({ plain: true });

    // job_id is a STRING here, not a UUID FK: usually a real job, but the
    // public form also posts sentinels ("default_job"). A value that maps is
    // rewritten; a UUID that does not names a demo job this company has no copy
    // of and is dropped rather than left pointing across tenants; a sentinel is
    // carried through. The job's own Site Check-In tab filters on this column,
    // so an unrewritten value is the difference between the tab listing the
    // check-ins and showing "No site check-ins yet".
    const targetJobId = jobMapping[plain.job_id]
      || priorImportMapping[plain.job_id]
      || (isUuid(plain.job_id) ? null : plain.job_id || null);

    // Same reason as the standalone tasks above — a sync must not double up on
    // what it already brought over. A check-in has no reference of its own, so
    // the visitor is what identifies it.
    //
    // Deliberately NOT keyed on checked_in_at, even though that is the more
    // precise identifier: the timestamp is shifted onto this company's calendar
    // below, and the size of that shift grows with every week that passes. A key
    // including it would match on the sync that wrote the row and never again,
    // re-adding the same visitor over and over.
    const responses = {};
    for (const [sourceFieldId, value] of Object.entries(plain.responses || {})) {
      const targetFieldId = siteCheckinFieldMapping[sourceFieldId];
      if (targetFieldId) responses[targetFieldId] = value;
    }

    const alreadyImported = await db.SiteCheckinRecord.findOne({
      where: {
        company_id: targetCompanyId,
        supplier_name: plain.supplier_name,
        email: plain.email,
        ...ownSample,
      },
      transaction,
    });
    if (alreadyImported) {
      await alreadyImported.update({
        ...plain,
        site_checkin_record_id: undefined,
        ...tenancy,
        job_id: targetJobId,
        responses,
        checked_in_at: shiftTimestamp(plain.checked_in_at, scheduleOffset),
        confirmed_at: shiftTimestamp(plain.confirmed_at, scheduleOffset),
        is_sample_data: true,
      }, { transaction });
      continue;
    }

    await db.SiteCheckinRecord.create({
      ...plain,
      site_checkin_record_id: undefined,
      ...tenancy,
      job_id: targetJobId,
      responses,
      // Moved with the rest of the diary. A check-in is a record of someone
      // signing on to site, so a fresh import showing its most recent visitor
      // as a year ago reads as broken data rather than as history.
      checked_in_at: shiftTimestamp(plain.checked_in_at, scheduleOffset),
      confirmed_at: shiftTimestamp(plain.confirmed_at, scheduleOffset),
      is_sample_data: true,
    }, { transaction });
    checkinsCloned += 1;
  }

  // ── The global Activity timeline ──────────────────────────────────────────
  //
  // Every module writes here through activityLogger, so this is copied last:
  // a log names whichever record changed, and all of them have to exist first.
  //
  // `reference_id` is NOT NULL and polymorphic — there is no foreign key saying
  // what it points at — so the test for "is this log worth copying?" is whether
  // the record it names is present in this company. `idMapping` holds what this
  // run produced (leads, jobs, quotations, versions, invoices, maintenance,
  // variations), `priorImportMapping` what an earlier one did, and the team and
  // their roles cover the USER and ROLE lines. Anything else is dropped rather
  // than left pointing into the demo tenant — most of all the EMAIL lines,
  // whose reference is a notification row sample data excludes.
  const activityReferenceMapping = {
    ...idMapping, ...priorImportMapping, ...userMapping, ...roleMapping,
  };

  // Sync re-runs this importer without purging first, and a log carries no
  // natural key. What the log SAYS is the key: the record it names plus the
  // change it describes. Deliberately not keyed on the timestamp — a clone does
  // not reliably keep the source's, and a key that drifts would re-add the whole
  // timeline on every sync.
  const activityLogKey = (row) =>
    [
      row.reference_id, row.reference_type, row.action,
      row.field_name, row.description, row.old_value, row.new_value,
    ]
      .map((value) => value ?? "")
      .join("|");

  const seenActivityLogs = new Set(
    (
      await db.ActivityLog.findAll({
        where: { ...tenancy, ...ownSample },
        attributes: [
          "reference_id", "reference_type", "action",
          "field_name", "description", "old_value", "new_value",
        ],
        transaction,
      })
    ).map(activityLogKey),
  );

  const sourceActivityLogs = await db.ActivityLog.findAll({
    where: { company_id: sourceCompanyId },
    order: [["created_at", "ASC"]],
    transaction,
  });

  const activityLogPayloads = [];
  for (const log of sourceActivityLogs) {
    const plain = log.get({ plain: true });

    const targetReferenceId = activityReferenceMapping[plain.reference_id];
    if (!targetReferenceId) continue;

    const candidate = {
      ...plain,
      reference_id: targetReferenceId,
      sub_reference_id: activityReferenceMapping[plain.sub_reference_id] || null,
      // Display-only, and it names a row from whichever module wrote the line —
      // a notification in the common case, which is not cloned. Kept when the
      // import produced that row, dropped otherwise so it cannot resolve back
      // into the demo company.
      module_id: activityReferenceMapping[plain.module_id] || null,
    };

    const key = activityLogKey(candidate);
    if (seenActivityLogs.has(key)) continue;
    seenActivityLogs.add(key);

    activityLogPayloads.push({
      ...candidate,
      activity_log_id: undefined,
      ...tenancy,
      // A foreign key onto the target's own users, and the screen filters on
      // the actor's role — so it has to name someone who exists here.
      user_id: plain.user_id ? mappedUser(plain.user_id) : null,
      // The timeline reads created_at DESC. Keeping the demo account's own
      // timestamps is what makes it read as a history rather than as several
      // hundred entries all stamped with the moment onboarding ran.
      created_at: plain.created_at,
      createdAt: plain.created_at,
      is_sample_data: true,
    });
  }

  // Inserted in batches rather than one at a time: this is the one table whose
  // row count grows with every edit the demo account has ever made, so it is
  // routinely an order of magnitude larger than anything else cloned here and
  // a row-at-a-time loop is what would make onboarding feel like it hung.
  const ACTIVITY_LOG_BATCH = 500;
  for (let start = 0; start < activityLogPayloads.length; start += ACTIVITY_LOG_BATCH) {
    await db.ActivityLog.bulkCreate(
      activityLogPayloads.slice(start, start + ACTIVITY_LOG_BATCH),
      { transaction },
    );
  }
  const activityLogsCloned = activityLogPayloads.length;

  console.log(
    `[importDummyProjectData] cloned ${Object.keys(leadMapping).length} lead(s), ` +
    `${Object.keys(jobMapping).length} job(s), ${Object.keys(userMapping).length} team member(s), ` +
    `${Object.keys(siteCheckinFieldMapping).length} check-in field(s), ${checkinsCloned} check-in(s) ` +
    `(${checkinsRelinked} re-linked to their job), ${activityLogsCloned} activity log(s)`,
  );

  await reportPhase("activity");

  // --- 4. Documents ---
  //
  // Last, because a file follows whichever row owns it and every one of those
  // has to exist first. reference_type is how a file finds its new owner.
  await cloneDriveDocuments({
    sourceBuilderScope,
    targetCompanyId,
    targetBuilderId,
    targetUserId,
    leadMapping,
    // The My Drive tree cloned in step 0. Without it this pass cannot see the
    // company-level report buckets and files it. See `mappedFolderId`.
    driveFolderMapping: folderMapping,
    referenceMappings: {
      FloorPlan: floorPlanMapping,
      Facade: facadeMapping,
      Quotation: quotationMapping,
      QuotationVersion: qVersionMapping,
      PropertyDetail: propertyDetailMapping,
      Lead: leadMapping,
      LeadDocument: leadMapping,
      Job: jobMapping,
      JobDocument: jobMapping,
      // Maintenance's own files: the Documents tab (Maintenance), the Site
      // Images gallery (MaintenanceSiteImage — both keyed by maintenance_id)
      // and a request task's attachments (keyed by the task id).
      //
      // `priorImportMapping` is folded in for the first two so a SYNC can carry
      // across an image the demo account added to a maintenance an earlier run
      // already cloned; only this run's maintenances live in the other map.
      Maintenance: { ...priorImportMapping, ...maintenanceMappingAll },
      MaintenanceSiteImage: { ...priorImportMapping, ...maintenanceMappingAll },
      MaintenanceTaskAttachment: maintenanceTaskMappingAll,
    },
  }, transaction);

  await reportPhase("documents");

  // --- 3. Clone the S Drive files ---
  //
  // Last, because every id these files point at (lead, property detail,
  // quotation version, job, invoice) is only mapped once the passes above have
  // run. This is what actually fills the folders cloned in step 0: the
  // generated reports and hand-uploaded documents that make up My Drive.
  const driveResult = await cloneDriveFiles(
    {
      sourceCompanyId,
      sourceBuilderId,
      targetCompanyId,
      targetBuilderId,
      targetUserId,
      folderMapping,
      idMapping,
      skipSourceFileIds: clonedSourceFileIds,
    },
    transaction,
  );

  console.log(
    `[importDummyProjectData] S Drive: ${Object.keys(folderMapping).length} folder(s), ` +
    `${driveResult.created} file(s) copied, ${driveResult.skippedDuplicate} skipped as duplicates, ` +
    `${driveResult.skippedCopyFailed} skipped after a failed S3 copy.`,
  );

  await reportPhase("drive-files");
}

/**
 * Phase 3 — Onboarding details. Saves company logo and any supplementary
 * fields. Once successful, flips is_onboarding_finished=true.
 *
 * Ownership: the caller's company_id must match the company being patched.
 */
export async function completeCompanyOnboarding(companyId, payload, requesterCompanyId) {
  const { Company } = db;

  const company = await Company.findOne({ where: { company_id: companyId } });
  if (!company) {
    throw { statusCode: 404, message: "Company not found." };
  }

  if (requesterCompanyId && company.company_id !== requesterCompanyId) {
    throw { statusCode: 403, message: "You do not have access to this company." };
  }

  const updatePayload = {};
  if (payload.name !== undefined && payload.name !== null && payload.name !== "") {
    updatePayload.name = payload.name.trim();
  }
  if (payload.company_logo !== undefined && payload.company_logo !== null && payload.company_logo !== "") {
    updatePayload.company_logo = payload.company_logo;
  }
  if (payload.email_signature_logo !== undefined && payload.email_signature_logo !== null && payload.email_signature_logo !== "") {
    updatePayload.email_signature_logo = payload.email_signature_logo;
  }
  if (payload.abn_number !== undefined && payload.abn_number !== "") {
    updatePayload.abn_number = payload.abn_number;
  }
  if (payload.timezone_id !== undefined && payload.timezone_id !== "") {
    updatePayload.timezone_id = payload.timezone_id;
  }

  const { address, website } = payload;

  if (website !== undefined) {
    updatePayload.website = website;
  }

  // Resolved inside the transaction, acted on after it commits.
  let wantsSampleData = null;

  const t = await db.sequelize.transaction();
  try {
    let addressId = company.address_id;

    if (address) {
      addressId = await createOrUpdateAddress(addressId, address, t);
      updatePayload.address_id = addressId;
    }

    // Phase 3: once submitted, flip the flag.
    updatePayload.is_onboarding_finished = true;

    await Company.update(updatePayload, { where: { company_id: companyId }, transaction: t });

    if (updatePayload.name) {
      await db.Builder.update(
        { name: updatePayload.name },
        { where: { company_id: companyId }, transaction: t }
      );
    }

    // Sample data is NOT imported here. Cloning the demo dataset takes seconds
    // to minutes, and doing it inside this transaction made the onboarding
    // request hang for the whole duration (and rolled the entire onboarding back
    // if the import failed). Instead we record the intent and queue the work
    // after commit, so onboarding returns immediately and the Settings → Sample
    // Data screen tracks progress.
    if (payload.import_sample_data === true || payload.import_sample_data === "true") {
      wantsSampleData = await db.Users.findOne({
        where: { company_id: companyId, root_user: true },
        attributes: ["users_id", "builder_id"],
        transaction: t,
      });
    }

    await t.commit();
  } catch (error) {
    await t.rollback();
    throw error;
  }

  // Post-commit: onboarding itself is already saved, so a queue hiccup here
  // must not fail the response — the user is onboarded either way.
  if (wantsSampleData) {
    try {
      const request = await db.SampleDataRequest.create({
        company_id: companyId,
        builder_id: wantsSampleData.builder_id,
        // Requested and granted in the same step — the person completing
        // onboarding is the Company Administrator, so there is nobody else to
        // ask. It goes straight to IMPORTING rather than PENDING.
        status: SAMPLE_REQUEST_STATUS.IMPORTING,
        approval_token: randomUUID(),
        requested_by: wantsSampleData.users_id,
        approver_user_id: wantsSampleData.users_id,
        decided_by: wantsSampleData.users_id,
        decided_at: new Date(),
        decision_note: "Requested during company onboarding.",
      });

      await enqueueSampleDataImport({
        companyId,
        builderId: wantsSampleData.builder_id,
        userId: wantsSampleData.users_id,
        requestId: request.sample_data_request_id,
      });
    } catch (error) {
      console.error("Could not queue onboarding sample data import:", error.message);
    }
  }

  const refreshed = await Company.findByPk(companyId, {
    include: [
      { model: db.Address, as: "address" },
      { model: db.Timezones, as: "timezone" },
    ],
  });
  return refreshed.get({ plain: true });
}

/**
 * Fail fast, with a sentence that names the problem, on the things that
 * otherwise surface as an opaque constraint violation partway through the
 * import — by which point the transaction has rolled back and the log shows
 * only a stack.
 *
 * Checks, in the order they bite:
 *   1. the schema is migrated (leads.is_sample_data is the first column the
 *      importer writes that a pending migration would be missing),
 *   2. the demo account exists and is not this very company,
 *   3. the user every seeded record is attributed to actually exists — a
 *      deleted or missing one fails the leads insert on a foreign key.
 */
async function assertSampleDataPreconditions(companyId, builderId, userId) {
  const describedLeads = await db.sequelize.getQueryInterface().describeTable("leads");
  if (!describedLeads.is_sample_data) {
    throw {
      statusCode: 500,
      message:
        "The database is behind the code: leads.is_sample_data is missing. " +
        "Run the pending migrations before importing sample data.",
    };
  }

  await assertImportableTarget(companyId);

  const owner = await db.Users.findOne({
    where: { users_id: userId, is_deleted: false },
    attributes: ["users_id"],
  });
  if (!owner) {
    // "Does not exist or is deleted" is two very different faults wearing one
    // sentence, and the second one is not even about this user.
    //
    // A job carries ids and nothing else, and ids only mean anything in the
    // database they were written in. Bull's keyspace used to be unnamespaced
    // against a shared Redis, so a worker would pick up an import queued by a
    // different environment and refuse it here — reporting a deleted user for a
    // user that was alive and well in the database that queued the job. The
    // prefix in redisBull.config now keeps jobs on their own environment; this
    // tells them apart if anything ever crosses again.
    const [known, company] = await Promise.all([
      db.Users.findOne({ where: { users_id: userId }, attributes: ["users_id", "is_deleted"] }),
      db.Company.findOne({ where: { company_id: companyId }, attributes: ["company_id"] }),
    ]);

    if (!known && !company) {
      throw {
        statusCode: 400,
        message:
          `Neither the user (${userId}) nor the company (${companyId}) this import names ` +
          `exists in the database this worker is connected to (${env.DB.DB_NAME}). ` +
          "That is a job queued against a different database, not a deleted user — check " +
          "that the API and the worker share one .env, and that QUEUE_PREFIX separates this " +
          "environment from anything else using the same Redis.",
      };
    }

    throw {
      statusCode: 400,
      message: known?.is_deleted
        ? `The user this import would be attributed to (${userId}) has been deleted. ` +
          "Every seeded record points at them, so the import cannot proceed."
        : `The user this import would be attributed to (${userId}) does not exist. ` +
          "Every seeded record points at them, so the import cannot proceed.",
    };
  }

  const company = await db.Company.findOne({
    where: { company_id: companyId, builder_id: builderId },
    attributes: ["company_id"],
  });
  if (!company) {
    throw {
      statusCode: 400,
      message: `Company ${companyId} has no builder ${builderId} — the tenant scope is wrong.`,
    };
  }
}

/**
 * Refuse a company that can never be a valid import target.
 *
 * Split out of the worker's pre-flight so the same rule can run the moment
 * somebody asks. Requesting sample data for the demo account used to be
 * accepted: the request row was created, an approval email went to the Company
 * Administrator, they approved, a job was queued — and only then did the worker
 * reject it and mark the request FAILED. The person who asked found out after
 * the whole round trip, from a red banner, for something knowable at the click.
 *
 * @throws {{statusCode: number, message: string}}
 */
async function assertImportableTarget(companyId) {
  const dummyEmail = env.DUMMY_DATA_EMAIL || "dummy@inbuildify.com";
  const sourceUser = await db.Users.findOne({
    where: { email: dummyEmail },
    attributes: ["users_id", "company_id", "builder_id"],
  });

  if (!sourceUser) {
    throw {
      statusCode: 400,
      message: `No demo account found for "${dummyEmail}". Set DUMMY_DATA_EMAIL or seed that account.`,
    };
  }

  // The demo account is the source every import copies from — importing into
  // itself would clone its own rows back over the top of them.
  if (sourceUser.company_id === companyId) {
    throw {
      statusCode: 400,
      message: "This IS the demo account — there is nothing to import into it.",
    };
  }
}

/** Best-effort S3 cleanup, run only after the deleting transaction committed. */
async function removeS3Objects(keys) {
  for (const key of keys) {
    await deleteFromS3(key);
  }
}

/**
 * Re-seed this user's sample data.
 *
 * Clears whatever sample data they are still carrying first — including rows
 * orphaned by an earlier partial delete — then re-runs the importer, so calling
 * this twice never leaves duplicates behind.
 *
 * The clear is scoped to `userId`: a colleague's demo records are not this
 * import's to replace, however much of the tenant they share.
 */
/**
 * Seeded rows are read-only to the application; this is one of the few paths
 * allowed to write them, so it runs inside the maintenance context.
 */
/**
 * Progress reporting for one run of the sample-data job.
 *
 * `report(percent)` records a fixed checkpoint; `slice(from, to)` hands a stage
 * a reporter that maps the stage's own 0–1 progress into the share of the whole
 * job it occupies, so the importer does not need to know what runs around it.
 *
 * Everything here swallows its errors. Progress is a courtesy to the screen;
 * an import that has done its work must never fail because a status write did.
 */
function sampleDataProgress(onProgress) {
  const write = async (percent) => {
    if (typeof onProgress !== "function") {
      return;
    }
    try {
      await onProgress(Math.max(0, Math.min(100, Math.round(percent))));
    } catch (error) {
      console.warn("[sampleData] could not report progress:", error?.message || error);
    }
  };

  return {
    report: write,
    slice: (from, to) => (fraction) => write(from + (to - from) * fraction),
  };
}

export async function restoreCompanySampleData(companyId, builderId, userId, onProgress) {
  return runSampleDataMaintenance(() =>
    restoreCompanySampleDataImpl(companyId, builderId, userId, onProgress),
  );
}

async function restoreCompanySampleDataImpl(companyId, builderId, userId, onProgress) {
  const progress = sampleDataProgress(onProgress);

  await assertSampleDataPreconditions(companyId, builderId, userId);
  await progress.report(5);

  const t = await db.sequelize.transaction();
  let s3Keys = [];
  try {
    ({ s3Keys } = await deleteCompanySampleData(companyId, builderId, userId, t));
    await progress.report(10);
    // The import owns the bulk of the run, so it owns the bulk of the bar. It
    // stops at 95 rather than 100: the S3 cleanup and the recount below are
    // still to come, and a bar that reads 100% while work continues is the one
    // thing worse than a coarse bar.
    await importDummyProjectData(companyId, builderId, userId, t, progress.slice(10, 95));
    await t.commit();
  } catch (error) {
    await t.rollback();
    // The raw error's message is usually empty; without this the worker logs a
    // bare stack and the request row stores a blank reason.
    rethrowWithCause(error, "Sample data restore failed");
  }

  await removeS3Objects(s3Keys);

  // Report what actually landed so the Settings screen can show it immediately.
  const summary = await getCompanySampleDataSummary(companyId, builderId, userId);
  await progress.report(100);
  return { success: true, ...summary };
}

/**
 * Top this company's sample data up with whatever the demo account has gained
 * since it was last imported.
 *
 * Purely additive, and deliberately so. The importer reuses a settings master
 * whose natural key is already present and skips a lead it has already brought
 * over, so only genuinely new demo records land — nothing this company holds is
 * removed to make room for them.
 *
 * A sync used to carry a second pass that propagated deletions the other way:
 * a record the demo account had dropped was pruned from every company that had
 * copied it. It has been taken out. Sync is the one button a builder presses on
 * data they are using, and a button that can delete is not one they can press
 * freely — the reported cost of an unexpected deletion is far higher than the
 * cost of a demo record outstaying its welcome. The consequence is worth
 * stating plainly: deleting something in the demo account no longer removes it
 * from companies that already have it. Restore (which purges first) and
 * Settings → Sample Data's Delete are the paths that remove sample data now,
 * and both say so before they run.
 */
/**
 * Seeded rows are read-only to the application; this is one of the few paths
 * allowed to write them, so it runs inside the maintenance context.
 */
export async function syncCompanySampleData(companyId, builderId, userId, onProgress) {
  return runSampleDataMaintenance(() =>
    syncCompanySampleDataImpl(companyId, builderId, userId, onProgress),
  );
}

async function syncCompanySampleDataImpl(companyId, builderId, userId, onProgress) {
  const progress = sampleDataProgress(onProgress);

  await assertSampleDataPreconditions(companyId, builderId, userId);
  await progress.report(5);

  const t = await db.sequelize.transaction();
  try {
    // No clear pass to make room for, so the import starts sooner than it does
    // on a restore and owns proportionally more of the bar.
    await importDummyProjectData(companyId, builderId, userId, t, progress.slice(5, 95));
    await t.commit();
  } catch (error) {
    await t.rollback();
    rethrowWithCause(error, "Sample data sync failed");
  }

  const summary = await getCompanySampleDataSummary(companyId, builderId, userId);
  await progress.report(100);
  return { success: true, ...summary };
}

/**
 * Is this caller a Company Administrator?
 *
 * The root user created at sign-up always is. Everyone else is judged on the
 * company-scoped copy of the role, which is what seed-company-rbac gives them —
 * a company can have more than one administrator, so the nominated approver is
 * not the test.
 */
async function isCompanyAdministrator(user) {
  if (!user) return false;
  if (user.root_user === true) return true;
  if (!user.role_id) return false;

  const role = await db.Role.findOne({
    where: { role_id: user.role_id },
    attributes: ["name"],
  });

  return role?.name === COMPANY_ADMIN_ROLE_NAME;
}

/**
 * Which sample data this caller's Settings → Sample Data screen may see and
 * clear: their own, or — for a Company Administrator — the whole company's.
 *
 * Everyone under a company shares its builder_id, so scoping on the tenant alone
 * meant a user created by the administrator deleted the demo data out from under
 * every colleague. Their own id is the missing half of that scope. Null is the
 * administrator's deliberate company-wide reach: they own the company's data,
 * and somebody has to be able to clear what a departed colleague left behind.
 *
 * @returns {Promise<string|null>} the owner to scope by, or null for company-wide
 */
export async function resolveSampleDataOwnerId(user) {
  return user?.users_id || null;
}

/**
 * Has sample data ever been approved for this account?
 *
 * What makes Restore safe to offer without going back through the approval
 * flow. Somebody already said yes to this person having the demo dataset;
 * re-importing what they were granted is not a new decision, and nothing but
 * their own seeded rows is touched either way. Importing from scratch still
 * requires a request — that is the decision this cannot stand in for.
 *
 * A null owner asks the question of the whole company, for an administrator.
 */
async function hasApprovedSampleDataRequest(companyId, builderId, ownerId) {
  const request = await db.SampleDataRequest.findOne({
    where: {
      company_id: companyId,
      builder_id: builderId,
      ...(ownerId ? { requested_by: ownerId } : {}),
      status: SAMPLE_REQUEST_STATUS.APPROVED,
    },
    attributes: ["sample_data_request_id"],
  });

  return Boolean(request);
}

/**
 * How much sample data this account is still carrying. Drives the Settings →
 * Sample Data screen (badge counts + whether "Delete" is offered at all).
 *
 * Counted for `ownerId` alone, which is what the screen offers to delete: a
 * colleague's demo records are not this person's to clear, so showing them here
 * would put a number on the Delete button that the purge then leaves untouched.
 * A null owner counts the whole company, for the Company Administrator.
 */
export async function getCompanySampleDataSummary(companyId, builderId, ownerId) {
  const scope = {
    company_id: companyId,
    builder_id: builderId,
    is_sample_data: true,
    ...sampleOwnerWhere(ownerId),
  };

  const sampleLeads = await db.Leads.findAll({
    where: scope,
    attributes: ["leads_id"],
  });
  const leadIds = sampleLeads.map((l) => l.leads_id);

  const opportunities = leadIds.length
    ? await db.Opportunity.findAll({
      where: { leads_id: { [Op.in]: leadIds } },
      attributes: ["opportunity_id"],
    })
    : [];
  const opportunityIds = opportunities.map((o) => o.opportunity_id);

  const flaggedEntities = [...SAMPLE_CATALOG_ENTITIES, ...SAMPLE_ACTIVITY_ENTITIES];

  // Exactly five names before the rest element, matching the five fixed counts
  // below. Naming a sixth and seventh (driveFolders / driveFiles) silently ate
  // the first two flagged counts and shifted every remaining one two places
  // along, so each tile on the Sample Data screen showed another entity's
  // number and the last two showed nothing at all. The S Drive tiles read the
  // same two counts under their own names further down.
  const [quotations, jobs, contacts, documents, documentFolders, ...flaggedCounts] =
    await Promise.all([
      leadIds.length ? db.Quotation.count({ where: { leads_id: { [Op.in]: leadIds } } }) : 0,
      // Jobs carry the flag directly now, so count them that way rather than
      // walking the opportunity chain — it also catches any that lost their lead.
      db.Job.count({ where: scope }),
      db.Users.count({ where: scope }),
      // The Documents screen's contents: every seeded file, plus the folders.
      db.DriveFile.count({ where: scope }),
      db.Drive.count({ where: scope }),
      ...flaggedEntities.map((entity) =>
        db[entity.model].count({ where: sampleScopeFor(entity, companyId, builderId, ownerId) }),
      ),
    ]);

  const catalog = {};
  flaggedEntities.forEach((entity, index) => {
    catalog[entity.key] = flaggedCounts[index];
  });

  // const total =
  //   leadIds.length +
  //   opportunityIds.length +
  //   quotations +
  //   jobs +
  //   contacts +
  //   catalogCounts.reduce((sum, n) => sum + n, 0);
  const total =
    leadIds.length +
    opportunityIds.length +
    quotations +
    jobs +
    contacts +
    documents +
    documentFolders +
    flaggedCounts.reduce((sum, n) => sum + n, 0);
  // catalogCounts.reduce((sum, n) => sum + n, 0);

  // This account's OWN records, without the shared settings masters and catalog.
  //
  // Not what Delete removes — that is `total`, since the shared rows go with it
  // — but what an import put here under this person's name. Restore keys off it:
  // somebody who cleared their own pipeline should be offered it back even if a
  // master a colleague's quotation pins is still sitting in the tenant.
  const ownTotal =
    leadIds.length +
    opportunityIds.length +
    quotations +
    jobs +
    contacts +
    documents +
    documentFolders +
    flaggedEntities.reduce(
      (sum, entity, index) => (entity.shared ? sum : sum + flaggedCounts[index]),
      0,
    );

  // Restore is offered only to an account that has none of its own left. It
  // exists to bring the demo dataset back after a delete, so an account still
  // holding it has nothing to restore — the button would clear records they are
  // looking at in order to rebuild them, which is not what "restore" reads as.
  // Topping an existing set up is what Sync is for.
  const canRestore =
    ownTotal === 0 && (await hasApprovedSampleDataRequest(companyId, builderId, ownerId));

  return {
    hasSampleData: total > 0,
    // Delete clears everything on the screen, shared rows included, so this is
    // the same question as `hasSampleData` — kept as its own field because the
    // UI reads it for the button and the two could diverge again.
    canDelete: total > 0,
    canRestore,
    total,
    ownTotal,
    leads: leadIds.length,
    opportunities: opportunityIds.length,
    quotations,
    jobs,
    contacts,
    documents,
    documentFolders,
    // The S Drive tiles are the same two counts under the names that screen
    // reads them by — every seeded folder and the files inside them.
    driveFolders: documentFolders,
    driveFiles: documents,
    ...catalog,
  };
}

/**
 * Permanently drop everything the sample-data importer created for this account:
 * the flagged leads plus all that cascades off them (opportunities, quotations,
 * jobs and their colour selections and maintenance requests, demo contacts and
 * their addresses, property details, the Sales → Action timeline), the
 * standalone tasks / appointments / to-dos, the global Activity timeline and
 * the Site Check-In fields and check-ins, AND the flagged catalog and Settings
 * masters — price list items, price lists, floor plans, facades, packages,
 * dwelling types, ranges, locations, colours, suppliers, structural engineers,
 * estates, cost centres, contract formats, survey templates, workflow processes,
 * services, lead sources, holidays, user groups and maintenance areas —
 * including their files in S3.
 *
 * Only rows the importer actually created carry `is_sample_data`; anything the
 * builder made themselves, or an existing row the importer reused by name, is
 * untouched. A seeded row that a real record still points at is skipped and
 * reported back rather than failing the whole purge.
 *
 * Scoped to `ownerId` — the person asking. Everyone the Company Administrator
 * creates shares the company's builder_id, so a sweep without it was the whole
 * company's sample data, and one user clearing theirs emptied everyone else's
 * demo account at the same time. A Company Administrator passes null, which is
 * the deliberate company-wide clean-up.
 */
/**
 * Seeded rows are read-only to the application; this is one of the few paths
 * allowed to write them, so it runs inside the maintenance context.
 */
export async function removeCompanySampleData(companyId, builderId, ownerId) {
  return runSampleDataMaintenance(() => removeCompanySampleDataImpl(companyId, builderId, ownerId));
}

async function removeCompanySampleDataImpl(companyId, builderId, ownerId) {
  const summary = await getCompanySampleDataSummary(companyId, builderId, ownerId);
  // Everything on the screen, shared settings masters and catalog included.
  if (!summary.canDelete) {
    return { removed: false, skipped: [], ...summary };
  }

  const t = await db.sequelize.transaction();
  let result;
  try {
    result = await deleteCompanySampleData(companyId, builderId, ownerId, t);
    await t.commit();
  } catch (error) {
    await t.rollback();
    throw error;
  }

  await removeS3Objects(result.s3Keys);

  return {
    removed: true,
    ...summary,
    deleted: result.removed,
    skipped: result.skipped,
  };
}

/* ─── SAMPLE DATA REQUEST / APPROVAL ──────────────────────────── */

const SAMPLE_REQUEST_STATUS = Object.freeze({
  PENDING: "PENDING",
  // Approved and handed to the queue — the import is running in the background.
  IMPORTING: "IMPORTING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  FAILED: "FAILED",
});

/**
 * Hand the import to the background worker.
 *
 * Cloning the demo dataset is slow enough to time out an HTTP request, so both
 * onboarding and request-approval enqueue instead of importing inline. The
 * request row is what the UI polls for progress.
 */
export async function enqueueSampleDataImport({ companyId, builderId, userId, requestId, mode = "RESTORE" }) {
  return sampleDataQueue.add(
    SAMPLE_DATA_IMPORT_JOB,
    { companyId, builderId, userId, requestId, mode },
    {
      attempts: 2,
      backoff: { type: "exponential", delay: 15000 },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );
}

/**
 * Who signs off a sample-data request for this company.
 *
 * The root user created at sign-up is the Company Administrator, so that is the
 * primary lookup; the company-scoped admin role is the fallback for companies
 * whose root user was since removed.
 */
async function resolveCompanyApprover(companyId) {
  const { Users, Role } = db;

  const rootUser = await Users.findOne({
    where: { company_id: companyId, root_user: true, is_deleted: false },
    attributes: ["users_id", "name", "email"],
  });
  if (rootUser?.email) return rootUser;

  const adminRole = await Role.findOne({
    where: { name: COMPANY_ADMIN_ROLE_NAME, company_id: companyId },
    attributes: ["role_id"],
  });
  if (!adminRole) return null;

  return Users.findOne({
    where: { company_id: companyId, role_id: adminRole.role_id, is_deleted: false },
    attributes: ["users_id", "name", "email"],
  });
}

async function dispatchSampleDataApprovalEmail({ approver, requesterName, token }) {
  const subject = "Approval required: sample data request";
  const reviewLink = `${env.EMAIL.FRONTEND_BASE_URL}/sample-data-approval?token=${token}`;

  const text =
    `${requesterName} has requested that demo sample data be loaded into your InBuildify account.\n\n` +
    `Approve or decline here: ${reviewLink}\n\n` +
    "Approving imports demo leads, quotations, jobs and catalog records. Every one is tagged " +
    "Sample and can be deleted later from Settings → Sample Data.";

  const html = wrapAuthEmailHTML({
    subject,
    pillText: "Approval",
    bodyHtml: `
      <p style="margin: 0 0 16px;"><strong>${requesterName}</strong> has requested that demo sample data be loaded into your InBuildify account.</p>
      <p style="margin: 0 0 16px;">Approving imports demo leads, opportunities, quotations, jobs and catalog records. Each one is tagged <strong>Sample</strong> in the app and can be deleted at any time from Settings → Sample Data.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${reviewLink}" target="_blank" style="display: inline-block; box-sizing: border-box; background-color: #0056b3; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 700;">Review request</a>
      </div>
      <p style="margin: 16px 0 0; color: #64748b; font-size: 13px;">Nothing is imported until you approve.</p>
    `,
  });

  try {
    return await sendEmail(approver.email, subject, text, html);
  } catch (error) {
    console.error("Sample data approval email error:", error.message);
    return false;
  }
}

/** Shape a request row for the API — never leaks approval_token. */
function serialiseSampleDataRequest(request) {
  if (!request) return null;
  const plain = request.get ? request.get({ plain: true }) : request;

  return {
    requestId: plain.sample_data_request_id,
    status: plain.status,
    requestedAt: plain.created_at || plain.createdAt,
    requestedByName: plain.requestedByUser?.name || null,
    // The UI shows the in-app Approve/Reject buttons only to this user; the
    // service re-checks it, so this is a display hint, not the access control.
    approverUserId: plain.approver_user_id || null,
    approverName: plain.approverUser?.name || null,
    approverEmail: plain.approver_email || null,
    decidedAt: plain.decided_at || null,
    decidedByName: plain.decidedByUser?.name || null,
    decisionNote: plain.decision_note || null,
    errorMessage: plain.error_message || null,
    // How far the worker has got, 0–100. Only meaningful while IMPORTING —
    // that is the only state the screen draws a bar in.
    progress: Number.isFinite(Number(plain.progress)) ? Number(plain.progress) : 0,
  };
}

const REQUEST_INCLUDES = () => [
  { model: db.Users, as: "requestedByUser", attributes: ["users_id", "name"], required: false },
  { model: db.Users, as: "approverUser", attributes: ["users_id", "name"], required: false },
  { model: db.Users, as: "decidedByUser", attributes: ["users_id", "name"], required: false },
];

/**
 * The request the Settings screen should be showing — the newest one that is
 * this user's business.
 *
 * Sample data is imported per person now, so "the company's latest request" is
 * the wrong thing to report: a colleague's pending request would show on this
 * user's screen as though it were theirs, and their own request would disappear
 * behind it. Requests they are the nominated approver of stay in, because that
 * is what the in-app Approve / Reject buttons are rendered from.
 */
export async function getLatestSampleDataRequest(companyId, builderId, userId) {
  const where = {
    company_id: companyId,
    builder_id: builderId,
    ...(userId
      ? { [Op.or]: [{ requested_by: userId }, { approver_user_id: userId }] }
      : {}),
  };

  const request = await db.SampleDataRequest.findOne({
    where,
    include: REQUEST_INCLUDES(),
    order: [["created_at", "DESC"]],
  });

  // This endpoint is what the screen polls while an import runs, so it is also
  // the one place guaranteed to be running when the worker is not. If the row
  // says IMPORTING but the queue holds nothing working on it, say so here rather
  // than serving a spinner that nothing will ever resolve.
  if (request?.status === SAMPLE_REQUEST_STATUS.IMPORTING) {
    const reconciled = await reconcileSampleDataRequestsQuietly(
      [request.sample_data_request_id],
      // The screen asks every five seconds; the queue does not change that fast,
      // and a lost import stays lost for the fifteen seconds this waits.
      { throttleMs: 15_000 },
    );

    if (reconciled > 0) {
      const refreshed = await db.SampleDataRequest.findByPk(
        request.sample_data_request_id,
        { include: REQUEST_INCLUDES() },
      );
      return serialiseSampleDataRequest(refreshed || request);
    }
  }

  return serialiseSampleDataRequest(request);
}

/**
 * The request standing in the way of a new one — once it has been checked that
 * it is genuinely still in flight.
 *
 * Every entry point refuses a second request while one is PENDING or IMPORTING,
 * which is right for a request being worked on and a trap for one that is not:
 * an import whose worker died leaves the row on IMPORTING forever, and that row
 * then locks the builder out of the retry that would have fixed it. Reconciling
 * before refusing is what turns "Sample data is already being imported" back
 * into a statement that is true.
 */
async function findBlockingSampleDataRequest(companyId, builderId, userId) {
  const where = {
    company_id: companyId,
    builder_id: builderId,
    requested_by: userId || null,
    status: {
      [Op.in]: [SAMPLE_REQUEST_STATUS.PENDING, SAMPLE_REQUEST_STATUS.IMPORTING],
    },
  };

  const found = await db.SampleDataRequest.findOne({ where });
  if (!found || found.status !== SAMPLE_REQUEST_STATUS.IMPORTING) return found;

  const reconciled = await reconcileSampleDataRequestsQuietly([
    found.sample_data_request_id,
  ]);
  if (reconciled === 0) return found;

  // It was dead. Re-read rather than returning null: a second request could have
  // been raised in the meantime, and that one still blocks.
  return db.SampleDataRequest.findOne({ where });
}

/**
 * Raise a sample-data request and email the Company Administrator.
 *
 * Nothing is imported here — the import runs only when the request is approved.
 */
export async function createSampleDataRequest(companyId, builderId, user) {
  // Before anything else: an import that could never succeed must not reach an
  // approver's inbox.
  await assertImportableTarget(companyId);

  // Block on IMPORTING too: a second request while the worker is mid-import
  // would queue a competing clone of the same dataset.
  //
  // This user's own requests only. Sample data belongs to the person it was
  // imported for, so a colleague waiting on approval is not a reason to refuse
  // someone else theirs — scoping this to the company would have let the first
  // person to ask lock everyone else out until an administrator got round to it.
  const existing = await findBlockingSampleDataRequest(
    companyId,
    builderId,
    user?.users_id,
  );
  if (existing) {
    throw {
      statusCode: 409,
      message:
        existing.status === SAMPLE_REQUEST_STATUS.IMPORTING
          ? "Sample data is already being imported."
          : "A sample data request is already awaiting approval.",
    };
  }

  const approver = await resolveCompanyApprover(companyId);
  if (!approver?.email) {
    throw {
      statusCode: 400,
      message:
        "No Company Administrator with an email address was found to approve this request.",
    };
  }

  const request = await db.SampleDataRequest.create({
    company_id: companyId,
    builder_id: builderId,
    status: SAMPLE_REQUEST_STATUS.PENDING,
    approval_token: randomUUID(),
    requested_by: user?.users_id || null,
    approver_user_id: approver.users_id,
    approver_email: approver.email,
  });

  await dispatchSampleDataApprovalEmail({
    approver,
    requesterName: user?.name || "A team member",
    token: request.approval_token,
  });

  const created = await db.SampleDataRequest.findByPk(request.sample_data_request_id, {
    include: REQUEST_INCLUDES(),
  });
  return serialiseSampleDataRequest(created);
}

/**
 * Settings → Sample Data "Sync": pull across whatever the demo account has
 * gained since this company's sample data was imported.
 *
 * This does not go through the request/approval flow, and deliberately so: it
 * only runs once sample data is already here — which means it was approved — and
 * only for the person who would have approved it. Nothing is deleted and no
 * record the builder owns is touched, so there is nothing for a second approval
 * to protect. Importing from scratch still requires a request.
 */
export async function requestSampleDataSync(companyId, builderId, user) {
  // The caller's own sample data: a sync tops up what they already hold, and the
  // importer will only add to rows attributed to them. A colleague's demo
  // records are not something this can top up.
  const summary = await getCompanySampleDataSummary(companyId, builderId, user?.users_id);
  // Their own records, not the shared masters: a sync tops up what this account
  // holds, and shared rows a colleague imported are not that.
  if (summary.ownTotal === 0) {
    throw {
      statusCode: 400,
      message:
        "There is no sample data to sync yet. Use Request Sample Data to import it first.",
    };
  }

  const approver = await resolveCompanyApprover(companyId);
  if (approver && approver.users_id !== user?.users_id) {
    throw {
      statusCode: 403,
      message: "Only the Company Administrator can sync sample data.",
    };
  }

  const inFlight = await findBlockingSampleDataRequest(
    companyId,
    builderId,
    user?.users_id,
  );
  if (inFlight) {
    throw {
      statusCode: 409,
      message:
        inFlight.status === SAMPLE_REQUEST_STATUS.IMPORTING
          ? "Sample data is already being imported."
          : "A sample data request is already awaiting approval.",
    };
  }

  // The UI polls this row for progress, exactly as it does for an import.
  const request = await db.SampleDataRequest.create({
    company_id: companyId,
    builder_id: builderId,
    status: SAMPLE_REQUEST_STATUS.IMPORTING,
    approval_token: randomUUID(),
    requested_by: user?.users_id || null,
    approver_user_id: user?.users_id || null,
    decided_by: user?.users_id || null,
    decided_at: new Date(),
    decision_note: "Sync of new demo records — sample data was already approved.",
  });

  try {
    await enqueueSampleDataImport({
      companyId,
      builderId,
      userId: user?.users_id,
      requestId: request.sample_data_request_id,
      mode: "SYNC",
    });
  } catch (error) {
    await request.update({
      status: SAMPLE_REQUEST_STATUS.FAILED,
      error_message: `Could not queue the sync: ${error?.message || "queue unavailable"}`,
    });
    throw error;
  }

  const created = await db.SampleDataRequest.findByPk(request.sample_data_request_id, {
    include: REQUEST_INCLUDES(),
  });
  return serialiseSampleDataRequest(created);
}

/**
 * Settings → Sample Data "Restore": bring this account's demo dataset back after
 * it was deleted.
 *
 * Offered only to an account holding none of its own — `canRestore` is
 * `ownTotal === 0` plus a request that was approved once, so a master a
 * colleague's quotation still pins does not stand in the way of getting the
 * demo dataset back. An account that still has its sample data has
 * nothing to restore, and is refused here rather than quietly clearing records
 * they are looking at in order to rebuild them; Sync is what tops an existing
 * set up. The approved request is the other half: this rebuilds what somebody
 * already said yes to rather than granting it, which is what keeps it off the
 * approval flow rather than around it.
 *
 * Everything it touches is scoped to the caller, so a colleague's demo records
 * are neither cleared nor rebuilt.
 *
 * Queued rather than run inline for the same reason every other import is: the
 * clone takes seconds to minutes and would time the request out. The UI polls
 * the returned request row, exactly as it does for an import or a sync.
 */
export async function requestSampleDataRestore(companyId, builderId, user) {
  // Nothing to re-import if the demo account is gone or this IS it.
  await assertImportableTarget(companyId);

  // Always the caller's own, even for an administrator: the import rebuilds one
  // account's records, and clearing the company's on the way would take a
  // colleague's demo data with it. Their company-wide Delete is a separate,
  // deliberate action.
  const ownerId = user?.users_id || null;
  if (!ownerId) {
    throw { statusCode: 400, message: "Could not tell whose sample data to restore." };
  }

  const summary = await getCompanySampleDataSummary(companyId, builderId, ownerId);

  // Already holding it — the two reasons Restore is unavailable are worth
  // telling apart, since one of them says "you already have what you asked for"
  // and the other says "ask for it first".
  if (summary.ownTotal > 0) {
    throw {
      statusCode: 409,
      message:
        "Your sample data is already here — there is nothing to restore. " +
        "Delete it first if you want a fresh copy, or use Sync to pull across " +
        "any new demo records.",
    };
  }

  if (!summary.canRestore) {
    throw {
      statusCode: 400,
      message:
        "Sample data has not been approved for your account yet. " +
        "Use Request Sample Data to import it first.",
    };
  }

  const inFlight = await findBlockingSampleDataRequest(
    companyId,
    builderId,
    user?.users_id,
  );
  if (inFlight) {
    throw {
      statusCode: 409,
      message:
        inFlight.status === SAMPLE_REQUEST_STATUS.IMPORTING
          ? "Sample data is already being imported."
          : "A sample data request is already awaiting approval.",
    };
  }

  const request = await db.SampleDataRequest.create({
    company_id: companyId,
    builder_id: builderId,
    status: SAMPLE_REQUEST_STATUS.IMPORTING,
    approval_token: randomUUID(),
    requested_by: user?.users_id || null,
    approver_user_id: user?.users_id || null,
    decided_by: user?.users_id || null,
    decided_at: new Date(),
    decision_note: "Restore of sample data that was already approved.",
  });

  try {
    await enqueueSampleDataImport({
      companyId,
      builderId,
      // The import — and the purge it starts with — runs as this user, so the
      // rebuilt records come back owned by them.
      userId: user?.users_id,
      requestId: request.sample_data_request_id,
      mode: "RESTORE",
    });
  } catch (error) {
    await request.update({
      status: SAMPLE_REQUEST_STATUS.FAILED,
      error_message: `Could not queue the restore: ${error?.message || "queue unavailable"}`,
    });
    throw error;
  }

  const created = await db.SampleDataRequest.findByPk(request.sample_data_request_id, {
    include: REQUEST_INCLUDES(),
  });
  return serialiseSampleDataRequest(created);
}

/**
 * Apply an approve/reject decision.
 *
 * On approval the import runs immediately and the request records the outcome —
 * a thrown import (missing master dummy account, for instance) lands as FAILED
 * with the reason attached rather than a request stuck on PENDING.
 */
async function applySampleDataDecision(request, { decision, note, decidedBy }) {
  if (request.status !== SAMPLE_REQUEST_STATUS.PENDING) {
    throw {
      statusCode: 409,
      message: `This request has already been ${request.status.toLowerCase()}.`,
    };
  }

  if (decision === "REJECT") {
    await request.update({
      status: SAMPLE_REQUEST_STATUS.REJECTED,
      decided_by: decidedBy || null,
      decided_at: new Date(),
      decision_note: note || null,
    });
    return;
  }

  // Record the approval and hand the import to the worker. The decision request
  // returns straight away — the UI polls this row and shows IMPORTING until the
  // worker flips it to APPROVED or FAILED.
  await request.update({
    status: SAMPLE_REQUEST_STATUS.IMPORTING,
    decided_by: decidedBy || null,
    decided_at: new Date(),
    decision_note: note || null,
    error_message: null,
    // Nothing has run yet — a row approved a second time must not open on the
    // last run's percentage.
    progress: 0,
  });

  try {
    await enqueueSampleDataImport({
      companyId: request.company_id,
      builderId: request.builder_id,
      userId: request.requested_by || decidedBy,
      requestId: request.sample_data_request_id,
    });
  } catch (error) {
    // Redis down / queue unreachable — surface it now rather than leaving the
    // request stuck on IMPORTING with no worker ever picking it up.
    await request.update({
      status: SAMPLE_REQUEST_STATUS.FAILED,
      error_message: `Could not queue the import: ${error?.message || "queue unavailable"}`,
    });
    throw error;
  }
}

/** Public, token-authenticated read for the emailed approval page. */
export async function getSampleDataRequestByToken(token) {
  const request = await db.SampleDataRequest.findOne({
    where: { approval_token: token },
    include: [
      ...REQUEST_INCLUDES(),
      { model: db.Company, as: "company", attributes: ["company_id", "name"], required: false },
    ],
  });
  if (!request) {
    throw { statusCode: 404, message: "This approval link is not valid." };
  }

  return {
    ...serialiseSampleDataRequest(request),
    companyName: request.company?.name || null,
  };
}

/** Public, token-authenticated decision from the emailed link. */
export async function decideSampleDataRequestByToken(token, decision, note) {
  const request = await db.SampleDataRequest.findOne({ where: { approval_token: token } });
  if (!request) {
    throw { statusCode: 404, message: "This approval link is not valid." };
  }

  await applySampleDataDecision(request, {
    decision,
    note,
    decidedBy: request.approver_user_id,
  });

  const refreshed = await db.SampleDataRequest.findByPk(request.sample_data_request_id, {
    include: REQUEST_INCLUDES(),
  });
  return serialiseSampleDataRequest(refreshed);
}

/** In-app decision, for the approver working inside Settings → Sample Data. */
export async function decideSampleDataRequest(requestId, decision, note, user) {
  const request = await db.SampleDataRequest.findOne({
    where: {
      sample_data_request_id: requestId,
      company_id: user?.company_id,
    },
  });
  if (!request) {
    throw { statusCode: 404, message: "Request not found." };
  }

  // Only the nominated approver may decide in-app. The emailed link carries its
  // own per-request token and is handled separately.
  if (request.approver_user_id && request.approver_user_id !== user?.users_id) {
    throw {
      statusCode: 403,
      message: "Only the Company Administrator can approve this request.",
    };
  }

  await applySampleDataDecision(request, {
    decision,
    note,
    decidedBy: user?.users_id || null,
  });

  const refreshed = await db.SampleDataRequest.findByPk(requestId, {
    include: REQUEST_INCLUDES(),
  });
  return serialiseSampleDataRequest(refreshed);
}

export default {
  companySignUp,
  completeCompanyOnboarding,
  restoreCompanySampleData,
  syncCompanySampleData,
  resolveSampleDataOwnerId,
  getCompanySampleDataSummary,
  removeCompanySampleData,
  requestSampleDataRestore,
  getLatestSampleDataRequest,
  createSampleDataRequest,
  requestSampleDataSync,
  getSampleDataRequestByToken,
  decideSampleDataRequestByToken,
  decideSampleDataRequest,
};
