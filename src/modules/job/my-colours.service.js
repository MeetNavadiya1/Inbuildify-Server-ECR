/**
 * "My Colours" — the homebuyer's own colour stage.
 *
 * The customer-facing half of colour selection. Everything the builder's colour
 * screen does per job, this does for the one job that belongs to the signed-in
 * Contact — and it takes NO job id, because letting the customer name a job is
 * the one thing that would let them name somebody else's. The job is resolved
 * from the caller, server-side, on every request.
 *
 * Reads the same tables the builder's screen writes (`job_color_*` and
 * `job_color_selection`), so a pick made here shows up on the consultant's
 * screen immediately and vice versa. The write delegates to
 * `jobService.saveColorSelections`, which owns the id-healing, the
 * mandatory-unit rules and the stored colour report — this file adds the two
 * things that are specific to the customer: their job, and the approval lock.
 */

import { Op } from "sequelize";

import db from "../../config/database/models/postgre-models/index.js";
import { runAsSampleDataSideEffect } from "../../config/database/models/postgre-models/sampleDataFlag.js";
import { applyTenantScope } from "../../helper/rbac.helper.js";
import { resolvePermission } from "../../helper/permissionResolver.helper.js";
import { MODULES, ACTIONS } from "../../constants/rbac.js";
import { ensureJobColorsCloned } from "../color/color.service.js";
import jobService from "./job.service.js";

/**
 * No job points at this contact.
 *
 * 404 is what the client reads as "not linked yet" and renders as a waiting
 * state rather than an error — see `useMyColoursHook`. Nothing else in this
 * file may answer 404, or a real failure would be shown to the customer as a
 * reassuring "your builder hasn't set your job up yet".
 */
const NO_JOB = {
  success: false,
  statusCode: 404,
  message: "No build is linked to your account yet.",
};

/** The consultant has approved. Reading still works; the picks are frozen. */
const LOCKED = {
  success: false,
  statusCode: 409,
  message: "Your colours have been approved and can no longer be changed.",
};

/** Job columns this feature reads. */
const JOB_ATTRIBUTES = [
  "job_id",
  "reference_number",
  "builder_id",
  "company_id",
  "opportunity_id",
  "customer_contact_id",
  "color_approved_at",
];

/** Guards a runaway payload without capping any real colour schedule. */
const MAX_SELECTIONS = 500;

/**
 * The job belonging to the signed-in customer, or null.
 *
 * `job.customer_contact_id` is the link, and it holds a `users_id` — the
 * homebuyer's own portal login, taken from the lead's first contact map row
 * when the opportunity was converted (see `convertOpportunityToJob`).
 *
 * That stamp only happens at conversion, which leaves a gap this has to close:
 * a job converted before the contact was attached to the lead — or before the
 * column existed — has `customer_contact_id` null forever, and the customer is
 * told no build is linked while the builder is looking at their name on it. So
 * when the direct link misses, the lead's contact map is walked instead and the
 * link is stamped on the way through.
 *
 * The self-heal only ever claims a job whose `customer_contact_id` is still
 * NULL. An unclaimed job is being repaired; one already pointing at somebody
 * else is not this caller's to take.
 */
async function resolveMyJob(user) {
  const { Job, Opportunity, LeadsContactMap } = db.sequelize.models;

  const userId = user?.users_id || user?.user_id;
  if (!userId) return null;

  // Still tenant-scoped. The link alone should be enough, but a stale
  // customer_contact_id must not reach across builders.
  const tenantScope = applyTenantScope({}, user);

  const linked = await Job.findOne({
    where: { ...tenantScope, customer_contact_id: userId },
    attributes: JOB_ATTRIBUTES,
    order: [["created_at", "DESC"]],
  });
  if (linked) return linked;

  const maps = await LeadsContactMap.findAll({
    where: { contact_id: userId },
    attributes: ["leads_id"],
    raw: true,
  });
  const leadIds = [...new Set(maps.map((m) => m.leads_id).filter(Boolean))];
  if (leadIds.length === 0) return null;

  const opportunities = await Opportunity.findAll({
    where: { leads_id: { [Op.in]: leadIds } },
    attributes: ["opportunity_id"],
    raw: true,
  });
  const opportunityIds = opportunities.map((o) => o.opportunity_id).filter(Boolean);
  if (opportunityIds.length === 0) return null;

  const job = await Job.findOne({
    where: {
      ...tenantScope,
      opportunity_id: { [Op.in]: opportunityIds },
      customer_contact_id: null,
    },
    attributes: JOB_ATTRIBUTES,
    order: [["created_at", "DESC"]],
  });
  if (!job) return null;

  // Filling in a link the conversion should have written is bookkeeping, not an
  // edit of the job's content — but on a seeded demo job the read-only guard
  // cannot tell the two apart and would fail the whole page load.
  await runAsSampleDataSideEffect(() => job.update({ customer_contact_id: userId }));

  return job;
}

/**
 * The builder's two "hide this from the colour screen" switches.
 *
 * One row per builder/company, the same one the consultant's screen toggles, so
 * the customer sees exactly what the builder chose to show.
 */
async function colourDisplaySettings(user, job) {
  const { JobColorSettings } = db.sequelize.models;

  const builderId = job?.builder_id || user?.builder_id;
  const companyId = job?.company_id || user?.company_id;

  const scope = [];
  if (builderId) scope.push({ builder_id: builderId });
  if (companyId) scope.push({ company_id: companyId });

  const settings = scope.length
    ? await JobColorSettings.findOne({ where: { [Op.or]: scope } })
    : null;

  // Absent settings means nothing has been hidden — both default to shown.
  return {
    showImages: !settings?.hide_color_item_images,
    showPrices: !settings?.hide_color_item_price,
  };
}

/**
 * The first image on a colour item.
 *
 * `color_image` is JSONB holding `[{ url }, …]`, but rows written through
 * different paths have it as a JSON *string*, so both are handled — the same
 * tolerance the colour document builder needs.
 */
const firstImageUrl = (raw) => {
  let images = [];

  if (Array.isArray(raw)) {
    images = raw;
  } else if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) images = parsed;
    } catch {
      // Not JSON — treat as "no images" rather than failing the whole page.
    }
  }

  return images[0]?.url || null;
};

/**
 * Which of the job's items are picked, keyed both ways.
 *
 * A selection saved before the job's colours were cloned still names the
 * TEMPLATE item rather than the job's copy of it, so the id alone misses it.
 * Matching on `item_code` as well is the same reconciliation the builder's
 * colour screen performs when it heals the stored ids.
 */
async function loadSelections(jobId) {
  const { JobColorSelection, ColorItem } = db.sequelize.models;

  const rows = await JobColorSelection.findAll({
    where: { job_id: jobId },
    attributes: ["color_item_id", "unit"],
    raw: true,
  });

  const unitById = {};
  const selectedIds = new Set();
  rows.forEach((r) => {
    selectedIds.add(r.color_item_id);
    unitById[r.color_item_id] = r.unit;
  });

  const selectedCodes = new Set();
  const unitByCode = {};
  if (selectedIds.size > 0) {
    const templates = await ColorItem.findAll({
      where: { color_item_id: { [Op.in]: [...selectedIds] } },
      attributes: ["color_item_id", "item_code"],
      raw: true,
    });
    templates.forEach((t) => {
      if (!t.item_code) return;
      selectedCodes.add(t.item_code);
      unitByCode[t.item_code] = unitById[t.color_item_id];
    });
  }

  return { selectedIds, selectedCodes, unitById, unitByCode };
}

/**
 * The customer's colour schedule: the job's categories, each with the items
 * they may choose from and which ones are already picked.
 */
export async function getMyColours(user) {
  const job = await resolveMyJob(user);
  if (!job) return NO_JOB;

  const builderId = job.builder_id || user?.builder_id;
  const companyId = job.company_id || user?.company_id;

  // The job's colour tree is a per-job COPY of Settings → Colour, made on first
  // read. The customer may well be the first person to open this job's colours,
  // so the copy has to be made for them too — otherwise they see an empty
  // schedule until a consultant happens to visit the builder-side screen.
  await ensureJobColorsCloned(job.job_id, builderId, companyId);

  const { JobColor, JobColorCategory, JobColorItem, Supplier } = db.sequelize.models;

  const [categoryRows, itemRows, picks, display, mayUpdate] = await Promise.all([
    JobColorCategory.findAll({
      // `IS NOT FALSE`, not `= true`: status is nullable on older rows and a
      // null there means nobody ever turned the category off.
      where: { job_id: job.job_id, status: { [Op.not]: false } },
      include: [{ model: JobColor, as: "color", attributes: ["color_id", "color_name"] }],
      order: [["sort_order", "ASC"], ["category_name", "ASC"]],
    }),
    JobColorItem.findAll({
      where: { job_id: job.job_id, status: { [Op.not]: false } },
      include: [{ model: Supplier, as: "supplier", attributes: ["supplier_id", "company_name"] }],
      order: [["sort_order", "ASC"], ["item_name", "ASC"]],
    }),
    loadSelections(job.job_id),
    colourDisplaySettings(user, job),
    resolvePermission(user, MODULES.COLOR_SELECTION, ACTIONS.UPDATE),
  ]);

  const itemsByCategory = new Map();
  for (const row of itemRows) {
    const p = row.get({ plain: true });

    const isSelected =
      picks.selectedIds.has(p.color_item_id) ||
      (!!p.item_code && picks.selectedCodes.has(p.item_code));

    // Only a mandatory-unit item carries a quantity; everything else is one of.
    const rawUnit =
      picks.unitById[p.color_item_id] ?? (p.item_code ? picks.unitByCode[p.item_code] : undefined);
    const parsedUnit = Number.parseFloat(rawUnit);
    const quantity =
      p.units === "mandatory" && Number.isFinite(parsedUnit) && parsedUnit > 0 ? parsedUnit : 1;

    const entry = {
      colorItemId: p.color_item_id,
      itemName: p.item_name,
      itemCode: p.item_code,
      description: p.description || null,
      supplierName: p.supplier?.company_name || null,
      upgradeOption: p.upgrade_option || null,
      isSelected,
      units: p.units || null,
      quantity,
      // Hidden by the builder means hidden from the customer: the value is
      // dropped here rather than sent and merely not rendered.
      image: display.showImages ? firstImageUrl(p.color_image) : null,
      cost: display.showPrices ? p.cost : null,
      costType: p.cost_type || null,
      // Filled from the category below — it is the colour the category hangs
      // off, and the item does not carry its name.
      colorName: null,
    };

    const key = p.color_category_id || "";
    if (!itemsByCategory.has(key)) itemsByCategory.set(key, []);
    itemsByCategory.get(key).push(entry);
  }

  const categories = categoryRows
    .map((row) => {
      const c = row.get({ plain: true });
      const colorName = c.color?.color_name || null;
      return {
        categoryId: c.color_category_id,
        categoryName: c.category_name,
        colorName,
        selectionType: c.selection_type || "multiple",
        items: (itemsByCategory.get(c.color_category_id) || []).map((item) => ({
          ...item,
          colorName,
        })),
      };
    })
    // An empty category is a card with nothing in it — the builder has set the
    // category up but not stocked it yet, which is not the customer's business.
    .filter((c) => c.items.length > 0);

  return {
    success: true,
    data: {
      jobId: job.job_id,
      isLocked: !!job.color_approved_at,
      // The permission alone. The lock is reported separately because they are
      // different reasons the page is read-only and it says so differently.
      canEdit: !!mayUpdate,
      colorApprovedAt: job.color_approved_at || null,
      showPrices: display.showPrices,
      showImages: display.showImages,
      categories,
    },
  };
}

/**
 * Replace the customer's picks.
 *
 * Two gates before the shared save runs: the schedule must not be approved, and
 * every id has to be an item of THIS job. The second matters because the caller
 * is the customer — the ids arrive from a browser, and `saveColorSelections`
 * writes what it is given without asking whose items they are.
 */
export async function saveMyColours(user, body) {
  const job = await resolveMyJob(user);
  if (!job) return NO_JOB;
  if (job.color_approved_at) return LOCKED;

  const { JobColorItem } = db.sequelize.models;

  // Same normaliser the save itself uses, so what is checked here is exactly
  // what gets written — deduplicated, and accepting both body shapes.
  const requestedIds = jobService
    ._normalizeColorSelectionInput(body)
    .map((s) => s.colorItemId);

  if (requestedIds.length > MAX_SELECTIONS) {
    return {
      success: false,
      statusCode: 400,
      message: `A colour schedule cannot hold more than ${MAX_SELECTIONS} items.`,
    };
  }

  if (requestedIds.length > 0) {
    const owned = await JobColorItem.findAll({
      where: { job_id: job.job_id, color_item_id: { [Op.in]: requestedIds } },
      attributes: ["color_item_id"],
      raw: true,
    });

    if (owned.length !== requestedIds.length) {
      return {
        success: false,
        statusCode: 400,
        message: "One or more of the selected colours do not belong to your build.",
      };
    }
  }

  return jobService.saveColorSelections(job.job_id, body, user);
}

export default { getMyColours, saveMyColours };
