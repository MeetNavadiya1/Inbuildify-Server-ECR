import db from "../../config/database/models/postgre-models/index.js";
import {
  runAcrossAllSampleDataOwners,
  runAsSampleDataSideEffect,
} from "../../config/database/models/postgre-models/sampleDataFlag.js";
import { templateSet, jobSet, resolveByColorId } from "./color-table-router.js";
// import { runAcrossAllSampleDataOwners } from "../../config/database/models/postgre-models/sampleDataFlag.js";

/**
 * The builder whose colour catalogue a job's colours are cloned from.
 *
 * Colours are stamped with a builder_id, and the clone matches company_id AND
 * builder_id — which holds only while the job and the catalogue sit under the
 * same builder. A company that set its colours up once, under the builder
 * created at sign-up, and later added a second builder has ONE catalogue and
 * jobs under both: for those jobs the template query matched nothing, the clone
 * wrote nothing, and every colour screen for that job came back empty — the
 * customer's included, where it reads as "your builder has not published any
 * colour options".
 *
 * So a builder with a catalogue of its own keeps using it, and a builder with
 * none falls back to the company's — the earliest one, so the choice is stable
 * across calls rather than flipping between two catalogues mid-clone.
 *
 * Existence is asked of the database, not of the caller: seeded colours belong
 * to the person who imported them, and "this builder has no catalogue" must not
 * mean "none that you personally can see". Which owner's copy is then read is a
 * separate question, decided by the caller.
 *
 * @returns {Promise<string|null>} the builder_id to clone from
 */
export async function resolveCatalogueBuilderId(companyId, builderId, transaction = null) {
  const { Color } = db;
  if (!companyId) return builderId;

  const hasOwn = builderId
    ? await runAcrossAllSampleDataOwners(() => Color.count({
      where: { company_id: companyId, builder_id: builderId },
      transaction,
    }))
    : 0;
  if (hasOwn > 0) return builderId;

  const [fallback] = await runAcrossAllSampleDataOwners(() => Color.findAll({
    where: { company_id: companyId },
    attributes: ["builder_id"],
    order: [["created_at", "ASC"]],
    limit: 1,
    transaction,
    raw: true,
  }));

  return fallback?.builder_id || builderId;
}

/**
 * Is this master colour row seeded demo content?
 *
 * The job colour tree is a COPY of the Settings → Colour catalogue, taken per
 * job, and nothing in the copy points back at the master beyond
 * `job_color.template_color_id`. So a job whose builder has not built their own
 * catalogue yet is filled entirely with demo colours that look, to every screen
 * reading `job_color`, exactly like colours the builder entered themselves —
 * the flag the badge reads was left at its `false` default by every clone path
 * below.
 *
 * The master row is the only thing that knows, so its answer is carried down
 * the whole cloned subtree at the moment the copy is made. See
 * `sampleDataFlag.js` for how the column reaches the client as `isSampleData`.
 */
const isSeeded = (row) => row?.is_sample_data === true;

/**
 * Bring an already-cloned job colour's subtree into line with its master's flag.
 *
 * The clone paths below stamp the flag at copy time, which settles every job
 * whose colours are copied from now on. It does not settle the two ways an
 * existing copy can end up disagreeing with the master it came from:
 *
 *   - it was copied before the stamp existed, and the backfill migration could
 *     not reach it because `template_color_id` was still null — the self-heal in
 *     step 2 fills that in later, from a name match, and nothing re-reads the
 *     flag afterwards;
 *   - the builder ADOPTED the master colour, which clears the flag on it. The
 *     copies would keep a demo badge on content that is now the builder's own.
 *
 * Cheap in the steady state: the subtree is only touched when the colour's own
 * flag already disagrees, which after the first pass it never does.
 *
 * Every statement names `is_sample_data` in its WHERE, which is what tells the
 * read-only guard this is the flag being maintained rather than seeded content
 * being edited (see `sampleDataFlag.js`).
 */
async function syncJobColorSampleFlag(models, jobColor, seeded, t) {
  if (isSeeded(jobColor) === seeded) return;

  const {
    JobColor, JobColorCategory, JobColorSubCategory,
    JobColorItem, JobColorItemCustomField, JobColorGroupItemMap,
  } = models;
  const { Op } = db.Sequelize;
  const colorId = jobColor.color_id;

  await runAsSampleDataSideEffect(async () => {
    const differs = { is_sample_data: { [Op.not]: seeded } };
    const set = { is_sample_data: seeded };

    const categories = await JobColorCategory.findAll({
      where: { color_id: colorId },
      attributes: ["color_category_id"],
      transaction: t,
    });
    const categoryIds = categories.map((c) => c.color_category_id);

    // `color_id` is carried on the item itself, so the items are reachable
    // without walking the categories.
    const items = await JobColorItem.findAll({
      where: { color_id: colorId },
      attributes: ["color_item_id"],
      transaction: t,
    });
    const itemIds = items.map((i) => i.color_item_id);

    if (itemIds.length > 0) {
      await JobColorItemCustomField.update(set, {
        where: { color_item: { [Op.in]: itemIds }, ...differs },
        transaction: t,
      });
      await JobColorGroupItemMap.update(set, {
        where: { color_item_id: { [Op.in]: itemIds }, ...differs },
        transaction: t,
      });
      await JobColorItem.update(set, {
        where: { color_item_id: { [Op.in]: itemIds }, ...differs },
        transaction: t,
      });
    }

    if (categoryIds.length > 0) {
      await JobColorSubCategory.update(set, {
        where: { color_category_id: { [Op.in]: categoryIds }, ...differs },
        transaction: t,
      });
      await JobColorCategory.update(set, {
        where: { color_category_id: { [Op.in]: categoryIds }, ...differs },
        transaction: t,
      });
    }

    await JobColor.update(set, {
      where: { color_id: colorId, ...differs },
      transaction: t,
    });
  });

  // Keep the in-hand instance honest without marking the field dirty, so the
  // name/sort sync that follows does not try to write it a second time.
  jobColor.setDataValue("is_sample_data", seeded);
  jobColor.changed("is_sample_data", false);
}

/**
 * Creates a new color for a builder/company, re-ordering existing colors if necessary.
 * @param {Object} userData - req.user data
 * @param {Object} colorData - req.body data
 */
export const createColorService = async (userData, colorData) => {
  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;
    const userId = userData?.users_id;

    if (!builderId || !companyId) {
      throw { status: 401, message: "Unauthorized." };
    }

    const { color_name, sort_order, status, job_id: jobId } = colorData;
    const { Color } = jobId ? jobSet() : templateSet();
    const scope = jobId ? { job_id: jobId } : {};

    if (!color_name || color_name.trim() === "") {
      throw { status: 400, message: "Color name is required." };
    }

    const finalSortOrder = sort_order || 1;

    // 1. Shift existing colors' sort_order
    await Color.increment(
      { sort_order: 1 },
      {
        where: {
          company_id: companyId,
          builder_id: builderId,
          sort_order: { [Op.gte]: finalSortOrder },
          ...scope,
        },
        transaction,
      },
    );

    // 2. Duplicate Check (Case-insensitive)
    const duplicate = await Color.findOne({
      where: {
        company_id: companyId,
        builder_id: builderId,
        is_sample_data: false,
        ...scope,
        [Op.and]: [
          db.sequelize.where(
            db.sequelize.fn("LOWER", db.sequelize.col("color_name")),
            Op.eq,
            color_name.trim().toLowerCase(),
          ),
        ],
      },
      transaction,
    });

    if (duplicate) {
      throw { status: 409, message: "Color with this name already exists." };
    }

    // 3. Insert New Color
    const newColor = await Color.create(
      {
        company_id: companyId,
        builder_id: builderId,
        color_name: color_name.trim(),
        sort_order: finalSortOrder,
        status: status !== undefined ? status : true,
        created_by: userId,
        updated_by: userId,
        ...scope,
      },
      { transaction },
    );

    await transaction.commit();

    return newColor.get({ plain: true });

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Fetches colors for a builder/company with pagination.
 * @param {Object} userData - req.user data
 * @param {Object} queryData - req.query data (page, limit)
 */
export const getColorsService = async (userData, queryData) => {
  const { Op } = db.Sequelize;
  const builderId = userData?.builder_id;
  const companyId = userData?.company_id;

  if (!builderId || !companyId) {
    throw { status: 401, message: "Unauthorized." };
  }

  const jobId = queryData.job_id || null;
  const { Color, ColorCategory, ColorItem } = jobId ? jobSet() : templateSet();
  const scope = jobId ? { job_id: jobId } : {};

  // Lazy cloning trigger
  await ensureJobColorsCloned(jobId, builderId, companyId);

  const page = parseInt(queryData.page) || 1;
  const limit = parseInt(queryData.limit) || 10;
  const offset = (page - 1) * limit;

  const search = queryData.search || queryData.searchQuery || queryData.color_name || "";
  const where = {
    company_id: companyId,
    builder_id: builderId,
    ...scope,
  };

  const include = [
    {
      model: ColorCategory,
      as: "colorCategories",
      required: false,
      include: [
        {
          model: ColorItem,
          as: "colorItems",
          required: false,
        },
      ],
    },
  ];

  if (search && search.trim() !== "") {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { color_name: { [Op.iLike]: term } },
      { "$colorCategories.category_name$": { [Op.iLike]: term } },
      { "$colorCategories.colorItems.item_name$": { [Op.iLike]: term } },
      { "$colorCategories.colorItems.item_code$": { [Op.iLike]: term } },
    ];
  }

  const { count, rows } = await Color.findAndCountAll({
    where,
    include,
    distinct: true,
    subQuery: false,
    attributes: [
      "color_id",
      "company_id",
      "builder_id",
      "color_name",
      "sort_order",
      "status",
      "created_at",
      "updated_at",
    ],
    order: [
      ["sort_order", "ASC"],
      ["created_at", "ASC"],
    ],
    limit,
    offset,
  });

  const totalPages = Math.ceil(count / limit);

  return {
    colors: rows.map((r) => r.get({ plain: true })),
    pagination: {
      currentPage: page,
      totalPages,
      totalRecords: count,
      limit,
    },
  };
};

/**
 * Updates an existing color, re-balancing sort orders if necessary.
 * @param {Object} userData - req.user data
 * @param {string} colorId - ID of the color to update
 * @param {Object} colorData - req.body data
 */
export const updateColorService = async (userData, colorId, colorData) => {
  const { Color, isJob } = await resolveByColorId(colorId);
  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;
    const userId = userData?.users_id;

    const { color_name, sort_order, status } = colorData;

    // 1. Check Existence
    const existingColor = await Color.findOne({
      where: {
        color_id: colorId,
        builder_id: builderId,
        company_id: companyId,
      },
      transaction,
    });

    if (!existingColor) {
      throw { status: 404, message: "Color not found." };
    }

    const scope = isJob ? { job_id: existingColor.job_id } : {};

    // 2. Sort Order Shifting
    if (sort_order !== undefined && sort_order !== existingColor.sort_order) {
      if (sort_order > existingColor.sort_order) {
        // Moving down: decrement colors in between
        await Color.decrement(
          { sort_order: 1 },
          {
            where: {
              company_id: companyId,
              builder_id: builderId,
              sort_order: {
                [Op.gt]: existingColor.sort_order,
                [Op.lte]: sort_order,
              },
              color_id: { [Op.ne]: colorId },
              ...scope,
            },
            transaction,
          },
        );
      } else {
        // Moving up: increment colors in between
        await Color.increment(
          { sort_order: 1 },
          {
            where: {
              company_id: companyId,
              builder_id: builderId,
              sort_order: {
                [Op.gte]: sort_order,
                [Op.lt]: existingColor.sort_order,
              },
              color_id: { [Op.ne]: colorId },
              ...scope,
            },
            transaction,
          },
        );
      }
    }

    // 3. Prepare Update Data
    const updateData = {};
    if (color_name !== undefined) {
      updateData.color_name = color_name;
    }
    if (sort_order !== undefined) {
      updateData.sort_order = sort_order;
    }
    if (status !== undefined) {
      updateData.status = status;
    }
    updateData.updated_by = userId;

    // Logic from original: At least one field (besides updated_by) must be provided
    if (Object.keys(updateData).length <= 1) {
      throw { status: 400, message: "At least one field must be provided for update." };
    }

    // 4. Perform Update
    await existingColor.update(updateData, { transaction });

    await transaction.commit();

    return existingColor.get({ plain: true });

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Deletes an existing color and re-balances sort orders of remaining colors.
 * @param {Object} userData - req.user data
 * @param {string} colorId - ID of the color to delete
 */
export const deleteColorService = async (userData, colorId) => {
  const { Color, ColorCategory, ColorItem, ColorSubCategory, ColorItemCustomField, ColorGroupItemMap, isJob } = await resolveByColorId(colorId);
  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;

    if (!builderId || !companyId) {
      throw { status: 401, message: "Unauthorized." };
    }

    // 1. Check Existence
    const existingColor = await Color.findOne({
      where: {
        color_id: colorId,
        builder_id: builderId,
        company_id: companyId,
      },
      transaction,
    });

    if (!existingColor) {
      throw { status: 404, message: "Color not found." };
    }

    // 2. Cascade Delete Orchestration
    const categories = await ColorCategory.findAll({
      where: { color_id: colorId },
      attributes: ["color_category_id"],
      transaction,
    });

    const categoryIds = categories.map((c) => c.color_category_id);

    if (categoryIds.length > 0) {
      // Find all color items for these categories
      const items = await ColorItem.findAll({
        where: { color_category_id: { [Op.in]: categoryIds } },
        attributes: ["color_item_id"],
        transaction,
      });

      const itemIds = items.map((i) => i.color_item_id);

      if (itemIds.length > 0) {
        // Delete mappings and custom fields for these items
        await ColorGroupItemMap.destroy({
          where: { color_item_id: { [Op.in]: itemIds } },
          transaction,
        });

        await ColorItemCustomField.destroy({
          where: { color_item: { [Op.in]: itemIds } },
          transaction,
        });

        // Delete the items themselves
        await ColorItem.destroy({
          where: { color_item_id: { [Op.in]: itemIds } },
          transaction,
        });
      }

      // Delete sub-categories for these categories
      await ColorSubCategory.destroy({
        where: { color_category_id: { [Op.in]: categoryIds } },
        transaction,
      });

      // Delete the categories themselves
      await ColorCategory.destroy({
        where: { color_id: colorId },
        transaction,
      });
    }

    const scope = isJob ? { job_id: existingColor.job_id } : {};
    // 3. Sort Order Shifting (Decrement all colors after this one)
    await Color.decrement(
      { sort_order: 1 },
      {
        where: {
          company_id: companyId,
          builder_id: builderId,
          sort_order: { [Op.gt]: existingColor.sort_order },
          ...scope,
        },
        transaction,
      },
    );

    // 3. Delete the Color
    await existingColor.destroy({ transaction });

    await transaction.commit();

    return existingColor.get({ plain: true });

  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

/**
 * Fetches a single color by ID after verifying ownership.
 * @param {Object} userData - req.user data
 * @param {string} colorId - ID of the color to fetch
 */
export const getColorByIdService = async (userData, colorId) => {
  const { Color } = await resolveByColorId(colorId);
  const builderId = userData?.builder_id;
  const companyId = userData?.company_id;

  if (!builderId || !companyId) {
    throw { status: 401, message: "Unauthorized." };
  }

  const color = await Color.findOne({
    where: {
      color_id: colorId,
      builder_id: builderId,
      company_id: companyId,
    },
  });

  if (!color) {
    throw { status: 404, message: "Color not found." };
  }

  return color.get({ plain: true });
};

/**
 * Copies a color with all its categories, items, and custom fields.
 * Performs sort rebalancing and uniqueness checks.
 */
export const copyColorService = async (userData, colorId, bodyData) => {
  const targetJobId = bodyData?.job_id || null;
  const sourceSet = await resolveByColorId(colorId);
  const targetSet = targetJobId ? jobSet() : templateSet();

  const ColorSource = sourceSet.Color;
  const ColorCategorySource = sourceSet.ColorCategory;
  const ColorItemSource = sourceSet.ColorItem;
  const ColorItemCustomFieldSource = sourceSet.ColorItemCustomField;

  const ColorTarget = targetSet.Color;
  const ColorCategoryTarget = targetSet.ColorCategory;
  const ColorItemTarget = targetSet.ColorItem;
  const ColorItemCustomFieldTarget = targetSet.ColorItemCustomField;

  const { Op } = db.Sequelize;
  const transaction = await db.sequelize.transaction();

  try {
    const builderId = userData?.builder_id;
    const companyId = userData?.company_id;
    const userId = userData?.users_id;
    const { color_name, sort_order } = bodyData;

    if (!builderId || !companyId) {
      throw { status: 401, message: "Unauthorized." };
    }

    if (!colorId) {
      throw { status: 400, message: "Color ID is required." };
    }

    if (!color_name || color_name.trim() === "") {
      throw { status: 400, message: "Color name is required." };
    }

    // 1. Fetch Source Color
    const sourceColor = await ColorSource.findOne({
      where: {
        color_id: colorId,
        [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
      },
      transaction,
    });

    if (!sourceColor) {
      throw { status: 404, message: "Source color not found." };
    }

    const targetScope = targetJobId ? { job_id: targetJobId } : {};

    // 2. Duplicate Check
    const duplicate = await ColorTarget.findOne({
      where: {
        company_id: companyId,
        builder_id: builderId,
        is_sample_data: false,
        ...targetScope,
        [Op.and]: [
          db.sequelize.where(
            db.sequelize.fn("LOWER", db.sequelize.col("color_name")),
            Op.eq,
            color_name.trim().toLowerCase(),
          ),
        ],
      },
      transaction,
    });

    if (duplicate) {
      throw { status: 409, message: "Color with this name already exists." };
    }

    // 3. Sort Order Calculation
    const totalColors = await ColorTarget.count({
      where: {
        [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
        ...targetScope,
      },
      transaction,
    });

    const maxAllowedSortOrder = totalColors + 1;

    if (sort_order && sort_order > maxAllowedSortOrder) {
      throw {
        status: 400,
        message: `Sort order cannot be more than ${maxAllowedSortOrder}. Current total colors: ${totalColors}`,
      };
    }

    const finalSortOrder = sort_order || maxAllowedSortOrder;

    // 4. Shift Colors
    await ColorTarget.increment(
      { sort_order: 1 },
      {
        where: {
          company_id: companyId,
          builder_id: builderId,
          sort_order: { [Op.gte]: finalSortOrder },
          ...targetScope,
        },
        transaction,
      },
    );

    // 5. Create New Color
    const newColor = await ColorTarget.create(
      {
        company_id: companyId,
        builder_id: builderId,
        color_name: color_name.trim(),
        sort_order: finalSortOrder,
        status: true,
        created_by: userId,
        updated_by: userId,
        ...targetScope,
      },
      { transaction },
    );

    const newColorId = newColor.color_id;

    // 6. Copy Categories
    const categories = await ColorCategorySource.findAll({
      where: { color_id: colorId },
      order: [["sort_order", "ASC"]],
      transaction,
    });

    const categoryMapping = {}; // Old Category ID -> New Category Record

    for (const category of categories) {
      const categoryData = category.get({ plain: true });
      delete categoryData.color_category_id;
      categoryData.color_id = newColorId;
      categoryData.created_by = userId;
      categoryData.updated_by = userId;
      categoryData.createdAt = new Date();
      categoryData.updatedAt = new Date();
      if (targetJobId) {
        categoryData.job_id = targetJobId;
      }

      const newCategory = await ColorCategoryTarget.create(categoryData, { transaction });
      categoryMapping[category.color_category_id] = newCategory.color_category_id;
    }

    // 7. Copy Items
    const sourceCategoryIds = Object.keys(categoryMapping);
    if (sourceCategoryIds.length > 0) {
      const items = await ColorItemSource.findAll({
        where: { color_category_id: { [Op.in]: sourceCategoryIds } },
        transaction,
      });

      for (const item of items) {
        const itemData = item.get({ plain: true });
        const oldItemId = itemData.color_item_id;
        delete itemData.color_item_id;

        itemData.color_category_id = categoryMapping[itemData.color_category_id];
        itemData.color_id = newColorId;
        itemData.company_id = companyId;
        itemData.builder_id = builderId;
        itemData.createdAt = new Date();
        itemData.updatedAt = new Date();
        if (targetJobId) {
          itemData.job_id = targetJobId;
        }

        const newItem = await ColorItemTarget.create(itemData, { transaction });
        const newColorItemId = newItem.color_item_id;

        // 8. Copy Custom Fields for this item
        const customFields = await ColorItemCustomFieldSource.findAll({
          where: { color_item: oldItemId },
          order: [["sort_order", "ASC"]],
          transaction,
        });

        for (const customField of customFields) {
          const fieldData = customField.get({ plain: true });
          delete fieldData.color_item_custom_field_id;
          fieldData.color_item = newColorItemId;
          fieldData.createdAt = new Date();
          fieldData.updatedAt = new Date();
          if (targetJobId) {
            fieldData.job_id = targetJobId;
          }

          await ColorItemCustomFieldTarget.create(fieldData, { transaction });
        }
      }
    }

    await transaction.commit();
    return newColor.get({ plain: true });

  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * Ensures the builder/company template colors have been cloned into this job's
 * instance tables, exactly once, even under concurrent first-load requests.
 *
 * The job color page fires several reads together on first open (colors,
 * categories, items) and React StrictMode double-invokes effects. Previously
 * each read that found an empty job table started its own clone, so two requests
 * could both pass the `count === 0` check and clone in parallel, producing
 * DUPLICATE job color category/item trees. A subsequent item query for one
 * category id then resolved to the empty duplicate ("No Color Sub Category Item
 * found"), while a re-fetch hit the populated copy — the "call the API again and
 * it shows up" symptom.
 *
 * We serialize the first-time clone per job with a transaction-scoped Postgres
 * advisory lock: the first caller clones and commits; concurrent callers block
 * on the lock, then re-check and find the data already there. Callers also wait
 * for the in-flight clone instead of reading a half-populated table.
 */
export async function ensureJobColorsCloned(jobId, builderId, companyId) {
  if (!jobId || !builderId || !companyId) return;

  // Runs seeing EVERY seeded row, whoever asked, because it decides by what it
  // reads and both read filters cut it off from half the picture:
  //
  //   - an empty `job_color` means "this job has no colours yet, copy the
  //     catalogue in", so a caller who cannot see seeded rows would lay a second
  //     catalogue on top of the demo one already there;
  //   - `Color` is owner-scoped, so a caller who is not the person the demo data
  //     was imported for reads a template list with the seeded masters missing —
  //     and the deletion sync at the end of `cloneAndSyncJobColors` withdraws
  //     every job colour whose master is "gone". That is a cascade delete of the
  //     job's whole demo colour tree, triggered by nothing more than a colleague
  //     opening the page.
  //
  // Neither is a decision about what this user may look at. That is settled by
  // the read that follows this call, which is still filtered normally.
  return runAcrossAllSampleDataOwners(() =>
    cloneAndSyncJobColors(jobId, builderId, companyId));
}

/** The clone/sync itself. Always called through `ensureJobColorsCloned`. */
async function cloneAndSyncJobColors(jobId, builderId, companyId) {
  // Which builder's catalogue this job clones from — its own when it has one,
  // otherwise the company's. See resolveCatalogueBuilderId.
  const catalogueBuilderId = await resolveCatalogueBuilderId(companyId, builderId);

  const {
    JobColor, Color, ColorCategory, ColorSubCategory, ColorItem, ColorItemCustomField, ColorGroupItemMap,
    JobColorCategory, JobColorSubCategory, JobColorItem, JobColorItemCustomField, JobColorGroupItemMap
  } = db;
  const { Op } = db.Sequelize;

  await db.sequelize.transaction(async (t) => {
    // Serialize concurrent requests for this job. The lock is released
    // automatically when the transaction commits/rolls back.
    await db.sequelize.query("SELECT pg_advisory_xact_lock(hashtext(:key))", {
      replacements: { key: `job_colors_clone:${jobId}` },
      transaction: t,
    });

    // 1. Fetch all template colors and all job colors for this job
    const templates = await Color.findAll({
      where: { company_id: companyId, builder_id: catalogueBuilderId },
      include: [
        {
          model: ColorCategory,
          as: "colorCategories",
          include: [
            { model: ColorSubCategory, as: "colorSubCategories" },
            {
              model: ColorItem,
              as: "colorItems",
              include: [
                { model: ColorItemCustomField, as: "customFields" },
                { model: ColorGroupItemMap, as: "colorGroupItemMaps" }
              ]
            }
          ]
        }
      ],
      transaction: t
    });

    const jobColors = await JobColor.findAll({
      where: { job_id: jobId },
      transaction: t
    });

    // A seeded JOB makes its whole colour tree demo content whatever the master
    // says, so it is OR'd into every decision below. Without it, a builder
    // adopting a demo master colour — which clears the flag on it — would strip
    // the badge off the colours of the demo jobs that were imported with it.
    const job = await db.Job.findByPk(jobId, { attributes: ["job_id", "is_sample_data"], transaction: t });
    const jobSeeded = isSeeded(job);

    /** A copy is demo content if the master it came from is, or if the job is. */
    const seededFrom = (row) => isSeeded(row) || jobSeeded;

    // If job has absolutely no colors, perform a full clone and return.
    if (jobColors.length === 0) {
      await cloneTemplateColorsToJob(jobId, builderId, companyId, t, jobSeeded);
      return;
    }

    // 2. Perform Self-Healing for older records:
    // Sync JobColor template_color_id
    for (const jc of jobColors) {
      if (!jc.template_color_id) {
        const matchedTpl = templates.find(
          (tc) => tc.color_name.toLowerCase().trim() === jc.color_name.toLowerCase().trim()
        );
        if (matchedTpl) {
          jc.template_color_id = matchedTpl.color_id;
          await runAsSampleDataSideEffect(() =>
            jc.update({ template_color_id: matchedTpl.color_id }, { transaction: t }));
        }
      }
    }

    // Load all categories, subcategories, items for the job
    const allJobCats = await JobColorCategory.findAll({ where: { job_id: jobId }, transaction: t });
    const allJobSubs = await JobColorSubCategory.findAll({ where: { job_id: jobId }, transaction: t });
    const allJobItems = await JobColorItem.findAll({ where: { job_id: jobId }, transaction: t });

    // Sync template_category_id on JobColorCategory
    for (const jc of allJobCats) {
      if (!jc.template_category_id) {
        const jobColor = jobColors.find((jcColor) => jcColor.color_id === jc.color_id);
        if (jobColor?.template_color_id) {
          const tplColor = templates.find((tc) => tc.color_id === jobColor.template_color_id);
          const tplCat = tplColor?.colorCategories?.find(
            (cat) => cat.category_name.toLowerCase().trim() === jc.category_name.toLowerCase().trim()
          );
          if (tplCat) {
            jc.template_category_id = tplCat.color_category_id;
            await runAsSampleDataSideEffect(() => jc.update({ template_category_id: tplCat.color_category_id }, { transaction: t }));
          }
        }
      }
    }

    // Sync template_sub_category_id on JobColorSubCategory
    for (const js of allJobSubs) {
      if (!js.template_sub_category_id) {
        const jobCat = allJobCats.find((jc) => jc.color_category_id === js.color_category_id);
        if (jobCat?.template_category_id) {
          let tplSub = null;
          for (const tc of templates) {
            const tplCat = tc.colorCategories?.find((cat) => cat.color_category_id === jobCat.template_category_id);
            if (tplCat) {
              tplSub = tplCat.colorSubCategories?.find((sub) => sub.name.toLowerCase().trim() === js.name.toLowerCase().trim());
              if (tplSub) break;
            }
          }
          if (tplSub) {
            js.template_sub_category_id = tplSub.color_sub_category_id;
            await runAsSampleDataSideEffect(() => js.update({ template_sub_category_id: tplSub.color_sub_category_id }, { transaction: t }));
          }
        }
      }
    }

    // Sync template_item_id on JobColorItem
    for (const ji of allJobItems) {
      if (!ji.template_item_id) {
        const jobCat = allJobCats.find((jc) => jc.color_category_id === ji.color_category_id);
        if (jobCat?.template_category_id) {
          let tplItem = null;
          for (const tc of templates) {
            const tplCat = tc.colorCategories?.find((cat) => cat.color_category_id === jobCat.template_category_id);
            if (tplCat) {
              tplItem = tplCat.colorItems?.find((item) => String(item.item_code || "").toLowerCase().trim() === String(ji.item_code || "").toLowerCase().trim());
              if (tplItem) break;
            }
          }
          if (tplItem) {
            ji.template_item_id = tplItem.color_item_id;
            await runAsSampleDataSideEffect(() => ji.update({ template_item_id: tplItem.color_item_id }, { transaction: t }));
          }
        }
      }
    }

    // 3. Sync Templates to Job Colors:
    for (const tc of templates) {
      let existingJobColor = jobColors.find((jc) => jc.template_color_id === tc.color_id);

      if (!existingJobColor) {
        // A template color was added! Clone it now.
        existingJobColor = await JobColor.create({
          job_id: jobId,
          template_color_id: tc.color_id,
          company_id: companyId,
          builder_id: catalogueBuilderId,
          color_name: tc.color_name,
          sort_order: tc.sort_order,
          status: tc.status,
          created_by: tc.created_by,
          updated_by: tc.updated_by,
          is_sample_data: seededFrom(tc),
        }, { transaction: t });
        jobColors.push(existingJobColor);
      } else {
        await syncJobColorSampleFlag(
          { JobColor, JobColorCategory, JobColorSubCategory, JobColorItem, JobColorItemCustomField, JobColorGroupItemMap },
          existingJobColor,
          seededFrom(tc),
          t,
        );

        const needsColorUpdate =
          existingJobColor.color_name !== tc.color_name ||
          existingJobColor.sort_order !== tc.sort_order ||
          existingJobColor.status !== tc.status;

        if (needsColorUpdate) {
          await runAsSampleDataSideEffect(() => existingJobColor.update({
            color_name: tc.color_name,
            sort_order: tc.sort_order,
            status: tc.status,
          }, { transaction: t }));
        }
      }

      // Sync categories under this color
      for (const cat of (tc.colorCategories || [])) {
        let jobCat = allJobCats.find((jc) => jc.template_category_id === cat.color_category_id);

        if (!jobCat) {
          jobCat = await JobColorCategory.create({
            job_id: jobId,
            color_id: existingJobColor.color_id,
            template_category_id: cat.color_category_id,
            category_name: cat.category_name,
            selection_type: cat.selection_type,
            sort_order: cat.sort_order,
            status: cat.status,
            suppliers: cat.suppliers,
            color_group: cat.color_group,
            created_by: cat.created_by,
            updated_by: cat.updated_by,
            is_sample_data: seededFrom(cat),
          }, { transaction: t });
          allJobCats.push(jobCat);
        } else {
          // Update category if details changed
          const needsCatUpdate =
            jobCat.category_name !== cat.category_name ||
            jobCat.selection_type !== cat.selection_type ||
            jobCat.sort_order !== cat.sort_order ||
            jobCat.status !== cat.status ||
            JSON.stringify(jobCat.suppliers || []) !== JSON.stringify(cat.suppliers || []) ||
            JSON.stringify(jobCat.color_group || []) !== JSON.stringify(cat.color_group || []);

          if (needsCatUpdate) {
            await runAsSampleDataSideEffect(() => jobCat.update({
              category_name: cat.category_name,
              selection_type: cat.selection_type,
              sort_order: cat.sort_order,
              status: cat.status,
              suppliers: cat.suppliers,
              color_group: cat.color_group,
            }, { transaction: t }));
          }
        }

        // Sync subcategories under this category
        for (const sub of (cat.colorSubCategories || [])) {
          let jobSub = allJobSubs.find((js) => js.template_sub_category_id === sub.color_sub_category_id);

          if (!jobSub) {
            jobSub = await JobColorSubCategory.create({
              job_id: jobId,
              color_category_id: jobCat.color_category_id,
              template_sub_category_id: sub.color_sub_category_id,
              name: sub.name,
              description: sub.description,
              created_by_id: sub.created_by_id,
              updated_by_id: sub.updated_by_id,
              is_deleted: sub.is_deleted,
              is_sample_data: seededFrom(sub),
            }, { transaction: t });
            allJobSubs.push(jobSub);
          } else {
            // Update subcategory if details changed
            const needsSubUpdate =
              jobSub.name !== sub.name ||
              jobSub.description !== sub.description ||
              jobSub.is_deleted !== sub.is_deleted;

            if (needsSubUpdate) {
              await runAsSampleDataSideEffect(() => jobSub.update({
                name: sub.name,
                description: sub.description,
                is_deleted: sub.is_deleted,
              }, { transaction: t }));
            }
          }
        }

        // Sync items under this category
        for (const item of (cat.colorItems || [])) {
          let jobItem = allJobItems.find((ji) => ji.template_item_id === item.color_item_id);

          if (!jobItem) {
            jobItem = await JobColorItem.create({
              is_sample_data: seededFrom(item),
              job_id: jobId,
              color_id: existingJobColor.color_id,
              color_category_id: jobCat.color_category_id,
              template_item_id: item.color_item_id,
              company_id: companyId,
              builder_id: catalogueBuilderId,
              item_name: item.item_name,
              item_code: item.item_code,
              supplier_id: item.supplier_id,
              upgrade_option: item.upgrade_option,
              cost_type: item.cost_type,
              cost: item.cost,
              features: item.features,
              description: item.description,
              specification_name: item.specification_name,
              color_type_id: item.color_type_id,
              range_id: item.range_id,
              sort_order: item.sort_order,
              units: item.units,
              color_image: item.color_image,
              specification: item.specification,
              status: item.status,
            }, { transaction: t });
            allJobItems.push(jobItem);

            for (const cf of (item.customFields || [])) {
              await JobColorItemCustomField.create({
                is_sample_data: seededFrom(cf),
                job_id: jobId,
                color_item: jobItem.color_item_id,
                field_type: cf.field_type,
                field_name: cf.field_name,
                required_field: cf.required_field,
                sort_order: cf.sort_order,
              }, { transaction: t });
            }

            for (const map of (item.colorGroupItemMaps || [])) {
              await JobColorGroupItemMap.create({
                is_sample_data: seededFrom(map),
                job_id: jobId,
                color_group_id: map.color_group_id,
                color_item_id: jobItem.color_item_id,
              }, { transaction: t });
            }
          } else {
            // Update item details if changed
            const needsItemUpdate =
              jobItem.item_name !== item.item_name ||
              jobItem.item_code !== item.item_code ||
              jobItem.supplier_id !== item.supplier_id ||
              jobItem.upgrade_option !== item.upgrade_option ||
              jobItem.cost_type !== item.cost_type ||
              Number(jobItem.cost) !== Number(item.cost) ||
              jobItem.features !== item.features ||
              jobItem.description !== item.description ||
              jobItem.specification_name !== item.specification_name ||
              JSON.stringify(jobItem.color_type_id || []) !== JSON.stringify(item.color_type_id || []) ||
              JSON.stringify(jobItem.range_id || []) !== JSON.stringify(item.range_id || []) ||
              jobItem.sort_order !== item.sort_order ||
              jobItem.units !== item.units ||
              JSON.stringify(jobItem.color_image || []) !== JSON.stringify(item.color_image || []) ||
              JSON.stringify(jobItem.specification || []) !== JSON.stringify(item.specification || []) ||
              jobItem.status !== item.status;

            if (needsItemUpdate) {
              await runAsSampleDataSideEffect(() => jobItem.update({
                item_name: item.item_name,
                item_code: item.item_code,
                supplier_id: item.supplier_id,
                upgrade_option: item.upgrade_option,
                cost_type: item.cost_type,
                cost: item.cost,
                features: item.features,
                description: item.description,
                specification_name: item.specification_name,
                color_type_id: item.color_type_id,
                range_id: item.range_id,
                sort_order: item.sort_order,
                units: item.units,
                color_image: item.color_image,
                specification: item.specification,
                status: item.status,
              }, { transaction: t }));
            }
          }
        }
      }
    }

    // 4. Sync Deletions:
    // Perform deletions for Categories, Subcategories, and Items that were deleted from the template.
    const allTemplateCatIds = [];
    const allTemplateSubIds = [];
    const allTemplateItemIds = [];
    for (const tc of templates) {
      for (const cat of (tc.colorCategories || [])) {
        allTemplateCatIds.push(cat.color_category_id);
        for (const sub of (cat.colorSubCategories || [])) {
          allTemplateSubIds.push(sub.color_sub_category_id);
        }
        for (const item of (cat.colorItems || [])) {
          allTemplateItemIds.push(item.color_item_id);
        }
      }
    }

    // Delete obsolete items
    for (const ji of allJobItems) {
      if (!ji.template_item_id || !allTemplateItemIds.includes(ji.template_item_id)) {
        await runAsSampleDataSideEffect(async () => {
          await JobColorGroupItemMap.destroy({ where: { color_item_id: ji.color_item_id }, transaction: t });
          await JobColorItemCustomField.destroy({ where: { color_item: ji.color_item_id }, transaction: t });
          await ji.destroy({ transaction: t });
        });
      }
    }

    // Delete obsolete subcategories
    for (const js of allJobSubs) {
      if (!js.template_sub_category_id || !allTemplateSubIds.includes(js.template_sub_category_id)) {
        await runAsSampleDataSideEffect(async () => {
          await js.destroy({ transaction: t });
        });
      }
    }

    // Delete obsolete categories
    for (const jc of allJobCats) {
      if (!jc.template_category_id || !allTemplateCatIds.includes(jc.template_category_id)) {
        await runAsSampleDataSideEffect(async () => {
          // Clean up items first
          const itemsToDel = allJobItems.filter((ji) => ji.color_category_id === jc.color_category_id);
          for (const ji of itemsToDel) {
            await JobColorGroupItemMap.destroy({ where: { color_item_id: ji.color_item_id }, transaction: t });
            await JobColorItemCustomField.destroy({ where: { color_item: ji.color_item_id }, transaction: t });
            await ji.destroy({ transaction: t });
          }
          await JobColorSubCategory.destroy({ where: { color_category_id: jc.color_category_id }, transaction: t });
          await jc.destroy({ transaction: t });
        });
      }
    }

    // Delete obsolete colors
    const templateIds = templates.map((tc) => tc.color_id);
    for (const jc of jobColors) {
      if (jc.template_color_id && !templateIds.includes(jc.template_color_id)) {
        await runAsSampleDataSideEffect(async () => {
          const categories = await JobColorCategory.findAll({
            where: { color_id: jc.color_id },
            attributes: ["color_category_id"],
            transaction: t
          });

          const categoryIds = categories.map((c) => c.color_category_id);

          if (categoryIds.length > 0) {
            const items = await JobColorItem.findAll({
              where: { color_category_id: { [Op.in]: categoryIds } },
              attributes: ["color_item_id"],
              transaction: t
            });

            const itemIds = items.map((i) => i.color_item_id);

            if (itemIds.length > 0) {
              await JobColorGroupItemMap.destroy({
                where: { color_item_id: { [Op.in]: itemIds } },
                transaction: t
              });

              await JobColorItemCustomField.destroy({
                where: { color_item: { [Op.in]: itemIds } },
                transaction: t
              });

              await JobColorItem.destroy({
                where: { color_item_id: { [Op.in]: itemIds } },
                transaction: t
              });
            }

            await JobColorSubCategory.destroy({
              where: { color_category_id: { [Op.in]: categoryIds } },
              transaction: t
            });

            await JobColorCategory.destroy({
              where: { color_id: jc.color_id },
              transaction: t
            });
          }

          await jc.destroy({ transaction: t });
        });
      }
    }
  });
}

/**
 * Lazy-clones builder/company template colors into job color instance tables.
 *
 * @param {boolean} jobSeeded the job itself is sample data, which makes every
 *   colour copied into it sample data too regardless of the master it came
 *   from. Defaults to reading the job when the caller has not already.
 */
export async function cloneTemplateColorsToJob(jobId, builderId, companyId, t, jobSeeded) {
  const {
    Color, ColorCategory, ColorSubCategory, ColorItem, ColorItemCustomField, ColorGroupItemMap,
    JobColor, JobColorCategory, JobColorSubCategory, JobColorItem, JobColorItemCustomField, JobColorGroupItemMap
  } = db;

  // Exported, so a caller may arrive without having read the job already.
  const seededJob = jobSeeded === undefined
    ? isSeeded(await db.Job.findByPk(jobId, { attributes: ["job_id", "is_sample_data"], transaction: t }))
    : jobSeeded === true;

  /** A copy is demo content if the master it came from is, or if the job is. */
  const seededFrom = (row) => isSeeded(row) || seededJob;

  const templates = await Color.findAll({
    where: { company_id: companyId, builder_id: builderId },
    include: [
      {
        model: ColorCategory,
        as: "colorCategories",
        include: [
          { model: ColorSubCategory, as: "colorSubCategories" },
          {
            model: ColorItem,
            as: "colorItems",
            include: [
              { model: ColorItemCustomField, as: "customFields" },
              { model: ColorGroupItemMap, as: "colorGroupItemMaps" }
            ]
          }
        ]
      }
    ],
    transaction: t
  });

  for (const c of templates) {
    const newColor = await JobColor.create({
      job_id: jobId,
      template_color_id: c.color_id,
      company_id: companyId,
      builder_id: builderId,
      color_name: c.color_name,
      sort_order: c.sort_order,
      status: c.status,
      created_by: c.created_by,
      updated_by: c.updated_by,
      // Each row answers for itself rather than inheriting the colour's answer:
      // a builder who adds a category or an item of their own underneath a demo
      // colour owns that row, and the copy of it should not be badged as demo.
      is_sample_data: seededFrom(c),
    }, { transaction: t });

    for (const cat of (c.colorCategories || [])) {
      const newCat = await JobColorCategory.create({
        job_id: jobId,
        color_id: newColor.color_id,
        template_category_id: cat.color_category_id,
        category_name: cat.category_name,
        selection_type: cat.selection_type,
        sort_order: cat.sort_order,
        status: cat.status,
        suppliers: cat.suppliers,
        color_group: cat.color_group,
        created_by: cat.created_by,
        updated_by: cat.updated_by,
        is_sample_data: seededFrom(cat),
      }, { transaction: t });

      for (const sub of (cat.colorSubCategories || [])) {
        await JobColorSubCategory.create({
          job_id: jobId,
          color_category_id: newCat.color_category_id,
          template_sub_category_id: sub.color_sub_category_id,
          name: sub.name,
          description: sub.description,
          created_by_id: sub.created_by_id,
          updated_by_id: sub.updated_by_id,
          is_deleted: sub.is_deleted,
          is_sample_data: seededFrom(sub),
        }, { transaction: t });
      }

      for (const item of (cat.colorItems || [])) {
        const newItem = await JobColorItem.create({
          job_id: jobId,
          color_id: newColor.color_id,
          color_category_id: newCat.color_category_id,
          template_item_id: item.color_item_id,
          company_id: companyId,
          builder_id: builderId,
          item_name: item.item_name,
          item_code: item.item_code,
          supplier_id: item.supplier_id,
          upgrade_option: item.upgrade_option,
          cost_type: item.cost_type,
          cost: item.cost,
          features: item.features,
          description: item.description,
          specification_name: item.specification_name,
          color_type_id: item.color_type_id,
          range_id: item.range_id,
          sort_order: item.sort_order,
          units: item.units,
          color_image: item.color_image,
          specification: item.specification,
          status: item.status,
          is_sample_data: seededFrom(item),
        }, { transaction: t });

        for (const cf of (item.customFields || [])) {
          await JobColorItemCustomField.create({
            job_id: jobId,
            color_item: newItem.color_item_id,
            field_type: cf.field_type,
            field_name: cf.field_name,
            required_field: cf.required_field,
            sort_order: cf.sort_order,
            is_sample_data: seededFrom(cf),
          }, { transaction: t });
        }

        for (const map of (item.colorGroupItemMaps || [])) {
          await JobColorGroupItemMap.create({
            job_id: jobId,
            color_group_id: map.color_group_id,
            color_item_id: newItem.color_item_id,
            is_sample_data: seededFrom(map),
          }, { transaction: t });
        }
      }
    }
  }
}

export default {
  createColorService,
  getColorsService,
  updateColorService,
  deleteColorService,
  getColorByIdService,
  copyColorService,
  ensureJobColorsCloned,
  cloneTemplateColorsToJob,
};
