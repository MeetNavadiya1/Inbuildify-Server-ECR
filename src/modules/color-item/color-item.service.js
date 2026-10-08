import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { resolveByColorId, resolveByCategoryId, resolveByItemId, jobSet, templateSet } from "../color/color-table-router.js";
import { ensureJobColorsCloned } from "../color/color.service.js";
import { keysToCamelCase, keysToSnakeCase } from "../../utils/common.js";
import { generatePDF } from "../quotation/pdf.service.js";
import { generateColorPdfHTML } from "../../utils/colorPdfTemplate.js";
import { generateColorDocumentHTML } from "../../utils/colorDocumentTemplate.js";
import { getObject, generatePresignedDownloadUrl } from "../../service/s3.service.js";
import { logJobActivity } from "../../utils/jobActivityLogger.js";
import notificationQueue from "../../workers/notificationWorker.js";
import { runAsSampleDataSideEffect } from "../../config/database/models/postgre-models/sampleDataFlag.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const LOGO_BASE64 = (() => {
  try {
    const buf = readFileSync(join(__dirname, "../../assets/logo-full.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
})();

// Parse the JSONB color_image column into an array (tolerates a stringified value).
function parseColorImages(rawImages) {
  return Array.isArray(rawImages)
    ? rawImages
    : typeof rawImages === "string"
      ? (() => { try { return JSON.parse(rawImages); } catch { return []; } })()
      : [];
}

// The uploader writes image entries as { url }, but rows copied between the
// template and job tables have been seen carrying the location under other keys
// (and occasionally as a bare string) — read whichever is present rather than
// silently dropping the image.
function imageEntryUrl(entry) {
  if (!entry) return null;
  if (typeof entry === "string") return entry.trim() || null;
  const candidate = entry.url || entry.fileUrl || entry.imageUrl || entry.location || entry.src;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

const IMAGE_MIME_BY_EXT = {
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function mimeForPath(path) {
  const ext = String(path || "").split(".").pop()?.toLowerCase();
  return IMAGE_MIME_BY_EXT[ext] || "image/jpeg";
}

// Fetch an image URL and return it as a data: URI (base64), or null. Puppeteer
// aborts every http(s) request while rendering, so an image that is not inlined
// here simply never appears in the PDF.
//
// Three routes, in order: the S3 SDK (private objects in our own bucket), a
// short-lived presigned URL, then a plain fetch of the URL exactly as stored.
// That last route is the one that rescues images living outside BUCKET_NAME —
// an object left in an older bucket, a CDN in front of S3, or a plain public
// URL — which the first two look for in the wrong bucket and never find, and
// which used to render as "No image" while the browser showed them fine.
async function imageUrlToBase64(firstUrl) {
  if (!firstUrl) return null;
  if (firstUrl.startsWith("data:")) return firstUrl; // already inline

  let urlObj;
  try {
    urlObj = new URL(firstUrl);
  } catch {
    console.error(`[ColorPdf] not an absolute image URL: ${firstUrl}`);
    return null;
  }
  // Only ever follow web URLs — never file:, and never a non-network scheme.
  if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
    console.error(`[ColorPdf] unsupported image protocol: ${urlObj.protocol}`);
    return null;
  }

  const host = urlObj.hostname;
  const looksLikeS3 = /(^|\.)s3[.-]/i.test(host) || host.endsWith(".amazonaws.com");
  // A stray "%" in the key makes decodeURIComponent throw; that must cost us the
  // S3 shortcut, not the image — the direct fetch below still works.
  let s3Key;
  try {
    s3Key = decodeURIComponent(urlObj.pathname.replace(/^\//, ""));
  } catch {
    s3Key = "";
  }
  if (s3Key && (host.startsWith("s3.") || host === "s3.amazonaws.com")) {
    s3Key = s3Key.split("/").slice(1).join("/"); // path-style: strip the bucket
  }
  const mime = mimeForPath(s3Key);
  const toDataUri = (buf) => (buf?.length ? `data:${mime};base64,${buf.toString("base64")}` : null);

  if (looksLikeS3 && s3Key) {
    try {
      const sdkResult = await getObject(s3Key);
      if (sdkResult?.data) return toDataUri(sdkResult.data);
    } catch { /* wrong bucket or no access — try the next route */ }

    try {
      const presigned = await generatePresignedDownloadUrl(s3Key, 30);
      if (presigned.success) {
        const res = await fetch(presigned.url);
        if (res.ok) return toDataUri(Buffer.from(await res.arrayBuffer()));
      }
    } catch { /* fall through to the URL as given */ }
  }

  try {
    const res = await fetch(firstUrl);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length) {
        const contentType = res.headers.get("content-type");
        const type = contentType?.startsWith("image/") ? contentType.split(";")[0] : mime;
        return `data:${type};base64,${buf.toString("base64")}`;
      }
    } else {
      console.error(`[ColorPdf] image fetch failed (${res.status}): ${firstUrl}`);
    }
  } catch (err) {
    console.error(`[ColorPdf] failed to fetch image ${firstUrl}:`, err?.message || err);
  }
  return null;
}

/**
 * Inline the first image on a colour item that actually resolves. Callers used
 * to take colorImages[0] and give up when it failed, printing "No image" even
 * when the item had other usable images behind it.
 */
export async function resolveItemImageBase64(rawImages) {
  for (const entry of parseColorImages(rawImages)) {
    const inlined = await imageUrlToBase64(imageEntryUrl(entry));
    if (inlined) return inlined;
  }
  return null;
}

/**
 * { colorItemId -> unit } for a job, i.e. the quantity picked on the colour
 * screen. The colour PDF multiplies the item's unit price by this to reach the
 * row cost and the total, exactly as the colour screen does, so an empty map
 * means every row silently bills a single unit.
 */
export async function resolveUnitsByItemId(jobId) {
  const unitByItemId = {};
  if (!jobId) return unitByItemId;

  const { JobColorSelection } = db.sequelize.models;
  const selections = await JobColorSelection.findAll({
    where: { job_id: jobId },
    attributes: ["color_item_id", "unit"],
    raw: true,
  });
  selections.forEach((s) => {
    unitByItemId[s.color_item_id] = s.unit;
  });
  return unitByItemId;
}


/**
 * Common includes for color item retrieval
 */
const getColorItemIncludes = (models = db) => {
  const { ColorCategory, Color, ColorGroupItemMap, ColorItemCustomField } = models;
  const ColorGroup = models.ColorGroup || db.ColorGroup;
  return [
    {
      model: ColorCategory,
      as: "colorCategory",
      attributes: ["color_category_id", "category_name"],
      include: [
        {
          model: Color,
          as: "color",
          attributes: ["color_id", "color_name"],
        },
      ],
    },
    {
      model: ColorGroupItemMap,
      as: "colorGroupItemMaps",
      include: [
        {
          model: ColorGroup,
          as: "colorGroup",
          attributes: ["color_group_id", "name"],
        },
      ],
    },
    {
      model: ColorItemCustomField,
      as: "customFields",
      attributes: [
        "color_item_custom_field_id",
        "field_type",
        "field_name",
        "required_field",
        "sort_order",
      ],
    },
  ];
};

/**
 * Transformation utility to match the complex legacy SQL JSON structure
 */
const transformColorItem = (item) => {
  const plainItem = item.get({ plain: true });
  const transformed = {
    ...keysToCamelCase(plainItem),
    colorCategory: plainItem.colorCategory
      ? {
        id: plainItem.colorCategory.color_category_id,
        name: plainItem.colorCategory.category_name,
      }
      : null,
    color: plainItem.colorCategory?.color
      ? {
        id: plainItem.colorCategory.color.color_id,
        name: plainItem.colorCategory.color.color_name,
      }
      : null,
    colorGroups: (plainItem.colorGroupItemMaps || []).map((map) => ({
      colorGroupId: map.color_group_id,
      colorGroupName: map.colorGroup?.name || null,
    })),
    customFields: (plainItem.customFields || []).map((cf) =>
      keysToCamelCase(cf),
    ),
  };

  // Remove internal association keys
  delete transformed.colorGroupItemMaps;

  return transformed;
};

export async function getColorItemsWithoutCategoryService({ builderId, companyId, colorGroupId, jobId }) {
  const models = jobId ? jobSet() : templateSet();
  const { ColorItem, ColorGroupItemMap } = models;

  const where = {
    [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
    color_category_id: null,
    ...(jobId ? { job_id: jobId } : {}),
  };

  const include = getColorItemIncludes(models);

  if (colorGroupId) {
    include.push({
      model: ColorGroupItemMap,
      as: "filteringGroupMap",
      where: { color_group_id: colorGroupId },
      required: true,
      attributes: [],
    });
  }

  const items = await ColorItem.findAll({
    where,
    include,
    order: [["created_at", "DESC"]],
  });

  return items.map(transformColorItem);
}

export async function getAllColorItemsService({
  builderId,
  companyId,
  page,
  limit,
  status,
  search,
  costType,
  upgradeOption,
  units,
  colorCategoryId,
  colorGroupId,
  jobId,
}) {
  // Ensure the job's colors are cloned before reading, so the item list doesn't
  // return empty when it races ahead of the /colors call on first page load.
  await ensureJobColorsCloned(jobId, builderId, companyId);

  const isJob = jobId ? true : (colorCategoryId ? (await resolveByCategoryId(colorCategoryId)).isJob : false);
  const models = isJob ? jobSet() : templateSet();
  const { ColorItem, ColorGroupItemMap, ColorItemCustomField } = models;

  const where = {
    [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
    ...(jobId ? { job_id: jobId } : {}),
  };

  if (status !== undefined) where.status = status === "true";
  if (costType) where.cost_type = costType;
  if (upgradeOption) where.upgrade_option = upgradeOption;
  if (units) where.units = units;
  if (colorCategoryId) where.color_category_id = colorCategoryId;

  if (search?.trim()) {
    where[Op.or] = [
      { item_name: { [Op.iLike]: `%${search.trim()}%` } },
      { item_code: { [Op.iLike]: `%${search.trim()}%` } },
    ];
  }

  const include = [
    {
      model: ColorItemCustomField,
      as: "customFields",
      attributes: [
        ["color_item_custom_field_id", "color_item_custom_field_id"],
        "field_type",
        "field_name",
        "required_field",
        "sort_order",
      ],
    },
  ];

  if (colorGroupId) {
    include.push({
      model: ColorGroupItemMap,
      as: "filteringGroupMap",
      where: { color_group_id: colorGroupId },
      required: true,
      attributes: [],
    });
  }

  const { rows, count } = await ColorItem.findAndCountAll({
    where,
    include,
    distinct: true,
    order: [["created_at", "DESC"]],
    limit,
    offset: (page - 1) * limit,
  });

  let templateItemsMap = {};
  if (isJob && rows.length > 0) {
    const itemCodes = rows.map((r) => r.item_code).filter(Boolean);
    if (itemCodes.length > 0) {
      const templates = await db.ColorItem.findAll({
        where: {
          item_code: { [Op.in]: itemCodes },
          [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
        },
      });
      templates.forEach((t) => {
        templateItemsMap[t.item_code] = { cost: t.cost, cost_type: t.cost_type, upgrade_option: t.upgrade_option };
      });
    }
  }

  const transformedRows = rows.map((item) => {
    const plain = item.get({ plain: true });
    const templateData = templateItemsMap[plain.item_code];
    const templateCost = templateData ? templateData.cost : undefined;
    const templateCostType = templateData ? templateData.cost_type : undefined;
    const templateUpgradeOption = templateData ? templateData.upgrade_option : undefined;

    const hasCostMismatch = isJob && templateData !== undefined && (
      Number(plain.cost) !== Number(templateCost) ||
      plain.cost_type !== templateCostType ||
      plain.upgrade_option !== templateUpgradeOption
    );
    const isDeletedFromTemplate = isJob && !!plain.item_code && templateData === undefined;

    const result = {
      ...keysToCamelCase(plain),
      customFields: (plain.customFields || []).map((item) => keysToCamelCase(item)),
      ...(isJob ? {
        isPriceMismatch: hasCostMismatch,
        templateCost: templateCost !== undefined ? (templateCost !== null ? Number(templateCost) : null) : null,
        templateCostType: templateCostType !== undefined ? templateCostType : null,
        templateUpgradeOption: templateUpgradeOption !== undefined ? templateUpgradeOption : null,
        isDeletedFromTemplate,
      } : {}),
    };
    return result;
  });

  return {
    rows: transformedRows,
    total: count,
  };
}

/**
 * Fetch full details for a set of color item IDs (tenant-scoped).
 * Used to restore saved colour selections with complete pricing data so the
 * client can show the running total without re-browsing each category.
 */
export async function getColorItemsByIdsService({ ids, companyId, builderId }) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const models = await resolveByItemId(ids[0]);
  const { ColorItem } = models;
  const isJob = models.isJob;

  const items = await ColorItem.findAll({
    where: {
      color_item_id: { [Op.in]: ids },
      [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
    },
    include: getColorItemIncludes(models),
  });

  let templateItemsMap = {};
  if (isJob && items.length > 0) {
    const itemCodes = items.map((r) => r.item_code).filter(Boolean);
    if (itemCodes.length > 0) {
      const templates = await db.ColorItem.findAll({
        where: {
          item_code: { [Op.in]: itemCodes },
          [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
        },
      });
      templates.forEach((t) => {
        templateItemsMap[t.item_code] = { cost: t.cost, cost_type: t.cost_type, upgrade_option: t.upgrade_option };
      });
    }
  }

  return items.map((item) => {
    const transformed = transformColorItem(item);
    if (isJob) {
      const templateData = templateItemsMap[transformed.itemCode];
      const templateCost = templateData ? templateData.cost : undefined;
      const templateCostType = templateData ? templateData.cost_type : undefined;
      const templateUpgradeOption = templateData ? templateData.upgrade_option : undefined;

      transformed.isPriceMismatch = templateData !== undefined && (
        Number(transformed.cost) !== Number(templateCost) ||
        transformed.costType !== templateCostType ||
        transformed.upgradeOption !== templateUpgradeOption
      );
      transformed.templateCost = templateCost !== undefined ? (templateCost !== null ? Number(templateCost) : null) : null;
      transformed.templateCostType = templateCostType !== undefined ? templateCostType : null;
      transformed.templateUpgradeOption = templateUpgradeOption !== undefined ? templateUpgradeOption : null;
      transformed.isDeletedFromTemplate = !!transformed.itemCode && templateData === undefined;
    }
    return transformed;
  });
}

/**
 * Fetch ALL of a job's colour items (from the job-scoped job_color_item table),
 * document-ready: category name, supplier name and the first image are resolved
 * so the "Generate Colors Document" page can render every item directly. Clones
 * the job's colours first if they haven't been created yet.
 */
export async function getJobColorDocumentItemsService({ jobId, companyId, builderId }) {
  if (!jobId) return [];
  await ensureJobColorsCloned(jobId, builderId, companyId);

  const { JobColorItem, JobColorCategory, JobColor, Supplier, ColorType, JobColorSelection, ColorItem } =
    db.sequelize.models;

  const items = await JobColorItem.findAll({
    where: {
      job_id: jobId,
      [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
    },
    include: [
      {
        model: JobColorCategory,
        as: "colorCategory",
        attributes: ["color_category_id", "category_name"],
        include: [{ model: JobColor, as: "color", attributes: ["color_id", "color_name"] }],
      },
      { model: Supplier, as: "supplier", attributes: ["supplier_id", "company_name"] },
    ],
    order: [["created_at", "DESC"]],
  });

  // Resolve colour-type names for the "Color Type" filter. color_type_id is an
  // array of UUIDs referencing the (non-cloned) color_type table.
  const typeIds = [...new Set(items.flatMap((i) => i.color_type_id || []))];
  const typeNameById = {};
  if (typeIds.length > 0) {
    const types = await ColorType.findAll({
      where: { color_type_id: { [Op.in]: typeIds } },
      attributes: ["color_type_id", "color_type_name"],
      raw: true,
    });
    types.forEach((t) => { typeNameById[t.color_type_id] = t.color_type_name; });
  }

  // Which of the job's items the customer actually picked. Selections can still
  // hold template color_item ids from before the job's colours were cloned, so
  // resolve those to item_codes and match on either id or code — same reconciliation
  // getColorSelections() performs when it heals the stored ids.
  const selectionRows = await JobColorSelection.findAll({
    where: { job_id: jobId },
    attributes: ["color_item_id", "unit"],
    raw: true,
  });
  const selectedIds = new Set(selectionRows.map((r) => r.color_item_id));
  // The quantity the customer entered for a mandatory-unit item, keyed the same
  // two ways the selection itself is matched (job item id, and item_code for
  // selections still stored against the template id).
  const unitById = {};
  selectionRows.forEach((r) => { unitById[r.color_item_id] = r.unit; });
  let selectedCodes = new Set();
  const unitByCode = {};
  if (selectedIds.size > 0) {
    const templates = await ColorItem.findAll({
      where: { color_item_id: { [Op.in]: [...selectedIds] } },
      attributes: ["color_item_id", "item_code"],
      raw: true,
    });
    selectedCodes = new Set(templates.map((t) => t.item_code).filter(Boolean));
    templates.forEach((t) => {
      if (t.item_code) unitByCode[t.item_code] = unitById[t.color_item_id];
    });
  }

  return items.map((item) => {
    const p = item.get({ plain: true });
    const rawImages = p.color_image;
    const images = Array.isArray(rawImages)
      ? rawImages
      : typeof rawImages === "string"
        ? (() => { try { return JSON.parse(rawImages); } catch { return []; } })()
        : [];
    const colorTypes = (p.color_type_id || [])
      .map((id) => ({ id, name: typeNameById[id] }))
      .filter((t) => t.name);
    // Quantity: for a mandatory-unit item it's the unit the customer entered on
    // the colour screen; everything else is a single unit. Mirrors how the
    // colour report totals upgrades (unit → qty, falling back to 1).
    const rawUnit = unitById[p.color_item_id] ?? (p.item_code ? unitByCode[p.item_code] : undefined);
    const parsedUnit = Number.parseFloat(rawUnit);
    const quantity =
      p.units === "mandatory" && Number.isFinite(parsedUnit) && parsedUnit > 0 ? parsedUnit : 1;
    return {
      colorItemId: p.color_item_id,
      itemName: p.item_name,
      itemCode: p.item_code,
      costType: p.cost_type,
      cost: p.cost,
      units: p.units,
      quantity,
      upgradeOption: p.upgrade_option || null,
      isSelected: selectedIds.has(p.color_item_id) || (!!p.item_code && selectedCodes.has(p.item_code)),
      image: images[0]?.url || "",
      // Grouping key for callers that build a category tree — the name alone is
      // not safe to group on, two categories may share it.
      colorCategoryId: p.color_category_id || p.colorCategory?.color_category_id || null,
      categoryName: p.colorCategory?.category_name || "",
      colorName: p.colorCategory?.color?.color_name || "",
      supplierName: p.supplier?.company_name || "",
      colorTypes,
    };
  });
}

/**
 * Render the "Colour Schedule" document PDF (server-side) for a job: fetch all
 * of the job's colour items with images inlined as base64, build the HTML via
 * colorDocumentTemplate, and return the PDF buffer. Mirrors generateColorPdfService.
 */
export async function generateJobColorDocumentPdfService({ jobId, jobInfo = {}, companyId, builderId, itemIds }) {
  if (!jobId) throw new Error("generateJobColorDocumentPdfService: jobId is required");
  await ensureJobColorsCloned(jobId, builderId, companyId);

  const { JobColorItem, JobColorCategory, Supplier } = db.sequelize.models;
  const where = {
    job_id: jobId,
    [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
  };
  // Limit to the caller-selected items when provided; otherwise include all.
  if (Array.isArray(itemIds) && itemIds.length > 0) {
    where.color_item_id = { [Op.in]: itemIds };
  }
  const items = await JobColorItem.findAll({
    where,
    include: [
      { model: JobColorCategory, as: "colorCategory", attributes: ["color_category_id", "category_name"] },
      { model: Supplier, as: "supplier", attributes: ["supplier_id", "company_name"] },
    ],
    order: [["created_at", "DESC"]],
  });

  const docItems = await Promise.all(
    items.map(async (item) => {
      const p = item.get({ plain: true });
      return {
        itemName: p.item_name,
        itemCode: p.item_code,
        categoryName: p.colorCategory?.category_name || "",
        supplierName: p.supplier?.company_name || "",
        costType: p.cost_type,
        cost: p.cost,
        _imageBase64: await resolveItemImageBase64(p.color_image),
      };
    }),
  );

  const html = generateColorDocumentHTML({ items: docItems, jobInfo, logoBase64: LOGO_BASE64 });
  return generatePDF(html);
}

export async function getColorItemByIdService({ colorItemId, companyId, builderId }) {
  const models = await resolveByItemId(colorItemId);
  const { ColorItem, ColorItemCustomField } = models;

  const item = await ColorItem.findOne({
    where: {
      color_item_id: colorItemId,
      [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
    },
    include: [
      {
        model: ColorItemCustomField,
        as: "customFields",
      },
    ],
  });

  if (!item) return null;

  const plain = item.get({ plain: true });
  const result = {
    ...keysToCamelCase(plain),
    customFields: (plain.customFields || []).map((cf) => keysToCamelCase(cf)),
  };

  return result;
}

export async function createColorItemService(data, user) {
  const {
    item_name,
    item_code,
    supplier_id,
    color_category_id,
    upgrade_option,
    cost_type,
    cost,
    features,
    description,
    specification_name,
    units,
    sort_order,
    finalColorTypeIds,
    finalRangeIds,
    status,
    colorImageJson,
    specificationJson,
    parsedCustomFields,
    color_id,
    color_group_id,
  } = data;

  const { company_id: companyId, builder_id: builderId } = user;
  const isJob = color_category_id
    ? (await resolveByCategoryId(color_category_id)).isJob
    : (color_id ? (await resolveByColorId(color_id)).isJob : false);

  const models = isJob ? jobSet() : templateSet();
  const { ColorItem, ColorCategory, ColorItemCustomField, Color, ColorGroupItemMap } = models;
  const { ColorType, Range, Supplier, ColorGroup } = db;

  const transaction = await db.sequelize.transaction();
  let isCommitted = false;

  try {
    let resolvedColorId = color_id;
    let category = null;
    if (color_category_id) {
      category = await ColorCategory.findOne({
        where: { color_category_id },
        include: [{ model: Color, as: "color", where: { [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] }, required: true }],
        transaction,
      });

      if (!category) throw { statusCode: 400, message: "Invalid color category ID." };
      if (!resolvedColorId) resolvedColorId = category.color_id;
    }

    if (finalColorTypeIds?.length > 0) {
      const count = await ColorType.count({ where: { color_type_id: { [Op.in]: finalColorTypeIds }, [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] }, transaction });
      if (count !== finalColorTypeIds.length) throw { statusCode: 400, message: "Invalid color type IDs." };
    }

    const duplicate = await ColorItem.findOne({ where: { item_code: item_code.trim(), [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] }, transaction });
    if (duplicate) throw { statusCode: 409, message: "Item code already exists." };

    // Sort order is kept as a clean 1..N sequence within the category: a blank or
    // out-of-range value appends (length + 1); a valid position inserts there. The
    // whole category is renumbered after the insert (below), which also repairs
    // any pre-existing random/huge values (e.g. 4567891).
    const sortScopeOr = [{ company_id: companyId }, { builder_id: builderId }];
    let existingSortIds = [];
    let insertPos = 1;
    let finalSortOrder = sort_order == null || sort_order === "" ? null : Number(sort_order);
    if (color_category_id) {
      const existingForSort = await ColorItem.findAll({
        where: { color_category_id, [Op.or]: sortScopeOr },
        order: [["sort_order", "ASC"], ["created_at", "ASC"]],
        attributes: ["color_item_id"],
        transaction,
      });
      existingSortIds = existingForSort.map((e) => e.color_item_id);
      const count = existingSortIds.length;
      const requested = Number(sort_order);
      insertPos = Number.isInteger(requested) && requested >= 1 && requested <= count + 1 ? requested : count + 1;
      finalSortOrder = insertPos;
    }

    const scope = isJob ? { job_id: category?.job_id || (resolvedColorId ? (await Color.findByPk(resolvedColorId)).job_id : null) } : {};

    const colorItem = await ColorItem.create({
      company_id: companyId,
      builder_id: builderId,
      color_id: resolvedColorId || null,
      color_category_id: color_category_id || null,
      item_name: item_name.trim(),
      item_code: item_code.trim(),
      supplier_id: supplier_id || null,
      upgrade_option: upgrade_option || null,
      cost_type,
      cost: cost || null,
      features: features?.trim() || null,
      description: description?.trim() || null,
      specification_name: specification_name?.trim() || null,
      units,
      color_image: colorImageJson,
      specification: specificationJson,
      sort_order: finalSortOrder,
      color_type_id: finalColorTypeIds,
      range_id: finalRangeIds,
      status,
      ...scope,
    }, { transaction });

    // Renumber the category to a clean 1..N with the new item at its position
    // (repairs any pre-existing random/huge sort orders in the process).
    if (color_category_id) {
      const orderedIds = [...existingSortIds];
      orderedIds.splice(insertPos - 1, 0, colorItem.color_item_id);
      for (let i = 0; i < orderedIds.length; i++) {
        await ColorItem.update({ sort_order: i + 1 }, { where: { color_item_id: orderedIds[i] }, transaction });
      }
    }

    if (parsedCustomFields?.length > 0) {
      await ColorItemCustomField.bulkCreate(parsedCustomFields.map(f => ({ ...f, color_item: colorItem.color_item_id, ...scope })), { transaction });
    }

    if (color_group_id) {
      await ColorGroupItemMap.create({ color_group_id, color_item_id: colorItem.color_item_id, ...scope }, { transaction });
    }

    await transaction.commit();
    isCommitted = true;
    if (isJob && scope.job_id) {
      await logJobActivity(null, {
        userId: user?.users_id || null,
        jobId: scope.job_id,
        module: "Colour",
        moduleId: colorItem.color_item_id,
        recordName: item_name || item_code,
        action: "CREATE",
        description: `Colour item "${item_name || item_code}" created`,
      });
    }
    return transformColorItem(await ColorItem.findByPk(colorItem.color_item_id, { include: getColorItemIncludes(models) }));
  } catch (error) {
    if (!isCommitted) {
      await transaction.rollback();
    }
    throw error;
  }
}

export async function updateColorItemService({ builderId, companyId, colorItemId, data, userId = null }) {
  const models = await resolveByItemId(colorItemId);
  const { ColorItem } = models;
  const transaction = await db.sequelize.transaction();
  let isCommitted = false;

  try {
    const item = await ColorItem.findOne({
      where: { color_item_id: colorItemId, [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] },
      transaction,
    });

    if (!item) throw { status: 404, message: "Color item not found." };

    if (data.item_code && data.item_code.trim() !== item.item_code) {
      const duplicate = await ColorItem.findOne({
        where: { item_code: data.item_code.trim(), color_item_id: { [Op.ne]: colorItemId }, [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] },
        transaction,
      });
      if (duplicate) throw { status: 409, message: "Item code already exists." };
    }

    const updateData = { ...keysToSnakeCase(data) };

    // Handle images and specifications merging if provided
    if (data.colorImages) {
      const currentImages = item.color_image || [];
      const newImages = data.colorImages.map((img, idx) => ({
        ...img,
        is_default: data.default_image_index !== undefined ? idx === Number(data.default_image_index) : false
      }));
      updateData.color_image = [...currentImages, ...newImages];
    } else if (data.default_image_index !== undefined) {
      const images = (item.color_image || []).map((img, idx) => ({
        ...img,
        is_default: idx === Number(data.default_image_index)
      }));
      updateData.color_image = images;
    }

    if (data.specificationImages) {
      updateData.specification = [...(item.specification || []), ...data.specificationImages];
    }

    // Reposition within the category and renumber to a clean 1..N (repairs any
    // pre-existing random/huge values). An out-of-range position clamps to the end.
    if (updateData.sort_order != null && updateData.sort_order !== "" && item.color_category_id) {
      const sortScopeOr = [{ company_id: companyId }, { builder_id: builderId }];
      const existingForSort = await ColorItem.findAll({
        where: { color_category_id: item.color_category_id, [Op.or]: sortScopeOr },
        order: [["sort_order", "ASC"], ["created_at", "ASC"]],
        attributes: ["color_item_id"],
        transaction,
      });
      const orderedIds = existingForSort.map((e) => e.color_item_id).filter((cid) => cid !== colorItemId);
      const total = orderedIds.length + 1;
      const requested = Number(updateData.sort_order);
      const pos = Number.isInteger(requested) && requested >= 1 && requested <= total ? requested : total;
      orderedIds.splice(pos - 1, 0, colorItemId);
      for (let i = 0; i < orderedIds.length; i++) {
        if (orderedIds[i] === colorItemId) {
          updateData.sort_order = i + 1;
        } else {
          await ColorItem.update({ sort_order: i + 1 }, { where: { color_item_id: orderedIds[i] }, transaction });
        }
      }
    }

    await item.update(updateData, { transaction });
    await transaction.commit();
    isCommitted = true;

    if (item.job_id) {
      await logJobActivity(null, {
        userId,
        jobId: item.job_id,
        module: "Colour",
        moduleId: colorItemId,
        recordName: item.item_name || item.item_code,
        action: "UPDATE",
        description: `Colour item "${item.item_name || item.item_code}" updated`,
      });
    }

    return transformColorItem(await ColorItem.findByPk(colorItemId, { include: getColorItemIncludes(models) }));
  } catch (error) {
    if (!isCommitted) {
      await transaction.rollback();
    }
    throw error;
  }
}

export async function deleteColorItemService({ builderId, companyId, colorItemId, userId = null }) {
  const models = await resolveByItemId(colorItemId);
  const { ColorItem } = models;
  const transaction = await db.sequelize.transaction();

  try {
    const item = await ColorItem.findOne({
      where: { color_item_id: colorItemId, [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] },
      transaction,
    });

    if (!item) throw { status: 404, message: "Color item not found." };

    const { color_category_id, sort_order } = item;
    const deletedJobId = item.job_id;
    const deletedName = item.item_name || item.item_code;
    await item.destroy({ transaction });

    if (color_category_id && sort_order) {
      await ColorItem.decrement("sort_order", {
        by: 1,
        where: { color_category_id, sort_order: { [Op.gt]: sort_order }, [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] },
        transaction,
      });
    }

    await transaction.commit();

    if (deletedJobId) {
      await logJobActivity(null, {
        userId,
        jobId: deletedJobId,
        module: "Colour",
        moduleId: colorItemId,
        recordName: deletedName,
        action: "DELETE",
        description: `Colour item "${deletedName}" deleted`,
      });
    }

    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function deleteImageFieldService({ builderId, companyId, colorItemId, fieldName, index }) {
  const models = await resolveByItemId(colorItemId);
  const { ColorItem } = models;
  const item = await ColorItem.findOne({ where: { color_item_id: colorItemId, [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] } });
  if (!item) throw { status: 404, message: "Color item not found." };

  const dbField = (fieldName === "colorImage" || fieldName === "color_image") ? "color_image" : "specification";
  const list = item[dbField] || [];
  if (index < 0 || index >= list.length) throw { status: 400, message: "Invalid image index." };

  const deletedItem = list[index];
  const updatedList = [...list];
  updatedList.splice(index, 1);
  await runAsSampleDataSideEffect(() => item.update({ [dbField]: updatedList }));

  // If this is a template item, propagate the image deletion to all job-cloned copies immediately
  if (!models.isJob) {
    const deletedUrl = deletedItem?.url;
    if (deletedUrl) {
      // Find all JobColorItem records cloned from this template item
      const jobItems = await db.JobColorItem.findAll({
        where: { template_item_id: colorItemId }
      });

      for (const ji of jobItems) {
        const jiList = ji[dbField] || [];
        const filteredList = jiList.filter(img => img.url !== deletedUrl);
        if (jiList.length !== filteredList.length) {
          await runAsSampleDataSideEffect(() => ji.update({ [dbField]: filteredList }));
        }
      }
    }
  }

  return transformColorItem(await ColorItem.findByPk(colorItemId, { include: getColorItemIncludes(models) }));
}

export async function colorItemMoveService({ builderId, companyId, colorItemId, data, userId = null }) {
  const models = await resolveByItemId(colorItemId);
  const { ColorItem } = models;
  const { target_category_id } = data;

  const transaction = await db.sequelize.transaction();
  let isCommitted = false;
  try {
    const item = await ColorItem.findOne({ where: { color_item_id: colorItemId, [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] }, transaction });
    if (!item) throw { status: 404, message: "Color item not found." };

    const oldCategory = item.color_category_id;
    const oldSort = item.sort_order;

    const maxSort = (await ColorItem.max("sort_order", { where: { color_category_id: target_category_id, [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] }, transaction })) || 0;

    await item.update({ color_category_id: target_category_id, sort_order: maxSort + 1 }, { transaction });

    if (oldCategory && oldSort) {
      await ColorItem.decrement("sort_order", { by: 1, where: { color_category_id: oldCategory, sort_order: { [Op.gt]: oldSort }, [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] }, transaction });
    }

    await transaction.commit();
    isCommitted = true;

    if (item.job_id) {
      await logJobActivity(null, {
        userId,
        jobId: item.job_id,
        module: "Colour",
        moduleId: colorItemId,
        recordName: item.item_name || item.item_code,
        action: "UPDATE",
        description: `Colour item "${item.item_name || item.item_code}" moved to another category`,
      });
    }

    return transformColorItem(await ColorItem.findByPk(colorItemId, { include: getColorItemIncludes(models) }));
  } catch (error) {
    if (!isCommitted) {
      await transaction.rollback();
    }
    throw error;
  }
}

export async function copyColorItemService({ builderId, companyId, colorItemId, data, userId = null }) {
  const sourceModels = await resolveByItemId(colorItemId);
  const targetJobId = data?.job_id || null;
  const targetModels = targetJobId ? jobSet() : templateSet();

  const ColorItemSource = sourceModels.ColorItem;
  const ColorItemCustomFieldSource = sourceModels.ColorItemCustomField;

  const ColorItemTarget = targetModels.ColorItem;
  const ColorItemCustomFieldTarget = targetModels.ColorItemCustomField;

  const { item_name } = data;

  const transaction = await db.sequelize.transaction();
  let isCommitted = false;
  try {
    const item = await ColorItemSource.findOne({
      where: { color_item_id: colorItemId, [Op.or]: [{ company_id: companyId }, { builder_id: builderId }] },
      include: [{ model: ColorItemCustomFieldSource, as: "customFields" }],
      transaction
    });
    if (!item) throw { status: 404, message: "Color item not found." };

    const newItemData = { ...item.get({ plain: true }), item_name: item_name || `${item.item_name} (Copy)`, color_item_id: undefined, createdAt: undefined, updatedAt: undefined };
    if (targetJobId) {
      newItemData.job_id = targetJobId;
    }
    const newItem = await ColorItemTarget.create(newItemData, { transaction });

    if (item.customFields?.length > 0) {
      await ColorItemCustomFieldTarget.bulkCreate(item.customFields.map(cf => {
        const cfData = { ...cf.get({ plain: true }), color_item_custom_field_id: undefined, color_item: newItem.color_item_id };
        if (targetJobId) {
          cfData.job_id = targetJobId;
        }
        return cfData;
      }), { transaction });
    }

    await transaction.commit();
    isCommitted = true;

    if (targetJobId) {
      const copyName = newItemData.item_name;
      await logJobActivity(null, {
        userId,
        jobId: targetJobId,
        module: "Colour",
        moduleId: newItem.color_item_id,
        recordName: copyName,
        action: "CREATE",
        description: `Colour item "${copyName}" copied`,
      });
    }

    return transformColorItem(await ColorItemTarget.findByPk(newItem.color_item_id, { include: getColorItemIncludes(targetModels) }));
  } catch (error) {
    if (!isCommitted) {
      await transaction.rollback();
    }
    throw error;
  }
}

export async function generateColorPdfService({ itemIds, jobInfo, builderId, companyId, showImage = true, showPrice = true }) {
  const models = itemIds?.length > 0 ? await resolveByItemId(itemIds[0]) : templateSet();
  const { ColorItem, ColorCategory, Color } = models;

  const items = await ColorItem.findAll({
    where: {
      color_item_id: itemIds,
      [Op.or]: [
        ...(companyId ? [{ company_id: companyId }] : []),
        ...(builderId ? [{ builder_id: builderId }] : []),
      ],
    },
    include: [
      {
        model: ColorCategory,
        as: "colorCategory",
        attributes: ["color_category_id", "category_name"],
        include: [{ model: Color, as: "color", attributes: ["color_id", "color_name"] }],
      },
    ],
  });

  // The per-item quantity lives on job_color_selection, and the row cost the PDF
  // prints is unit price x quantity. Without a job id every quantity falls back
  // to 1 and the PDF silently bills the unit price — so fall back to the job the
  // colour items themselves belong to when the caller did not pass one.
  const jobId = jobInfo?.jobId || items.find((i) => i.get("job_id"))?.get("job_id") || null;
  const unitByItemId = await resolveUnitsByItemId(jobId);

  // Convert to plain and inline the first resolvable image as base64
  const itemsPlain = await Promise.all(
    items.map(async (item) => {
      const plain = item.get({ plain: true });
      const imageBase64 = await resolveItemImageBase64(plain.color_image);

      return {
        colorItemId: plain.color_item_id,
        itemName: plain.item_name,
        itemCode: plain.item_code,
        costType: plain.cost_type,
        cost: plain.cost,
        unit: unitByItemId[plain.color_item_id] ?? null,
        units: plain.units,
        description: plain.description,
        features: plain.features,
        colorCategory: plain.colorCategory
          ? { name: plain.colorCategory.category_name }
          : null,
        _imageBase64: imageBase64,
      };
    })
  );

  const html = generateColorPdfHTML({ items: itemsPlain, jobInfo, logoBase64: LOGO_BASE64, showImage, showPrice });
  const pdfBuffer = await generatePDF(html);
  return pdfBuffer;
}

export async function generateColorEmailService({ itemIds, jobInfoRaw, emailData, user, showImage = true, showPrice = true }) {
  try {
    const toList = (Array.isArray(emailData.to) ? emailData.to : [emailData.to])
      .filter((e) => typeof e === "string" && e.trim())
      .map((e) => e.trim());

    if (toList.length === 0) {
      return { success: false, statusCode: 400, message: "Recipient email is required." };
    }

    const ccList = (Array.isArray(emailData.cc) ? emailData.cc : [])
      .filter((e) => typeof e === "string" && e.trim())
      .map((e) => e.trim());

    // Hand off to the asynchronous Bull queue worker
    await notificationQueue.add(
      "colorEmail",
      {
        itemIds,
        jobId: jobInfoRaw.job_id || null,
        showImage,
        showPrice,
        jobInfo: {
          jobAddress: jobInfoRaw.job_address ?? '',
          customerName: jobInfoRaw.customer_name ?? '',
          referenceNumber: jobInfoRaw.reference_number ?? '',
          totalAmount: jobInfoRaw.total_amount ?? '',
        },
        emailData: {
          to: toList,
          cc: ccList,
          subject: emailData.subject,
          message: emailData.message,
        },
        userId: user?.users_id || user?.user_id || null,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 10000 },
        removeOnComplete: true,
        removeOnFail: 50,
      }
    );

    return { success: true, message: "Email queued successfully." };
  } catch (error) {
    console.error("Color email service error:", error);
    return { success: false, statusCode: 500, message: error.message || "Failed to queue email" };
  }
}

export default {
  createColorItemService,
  getColorItemsWithoutCategoryService,
  getAllColorItemsService,
  getColorItemByIdService,
  updateColorItemService,
  deleteColorItemService,
  deleteImageFieldService,
  colorItemMoveService,
  copyColorItemService,
  generateColorPdfService,
  generateColorEmailService,
};


