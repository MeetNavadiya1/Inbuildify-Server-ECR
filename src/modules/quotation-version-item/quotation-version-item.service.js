import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";
import { logActivity } from "../../utils/activityLogger.js";
import { sampleDataReadOnlyError } from "../../config/database/models/postgre-models/sampleDataFlag.js";

/**
 * Refuse a write whose target is a seeded quotation version.
 *
 * Every line on this screen — a price list item, a package, an extra item — is a
 * row in `quotation_version_items`, and adding one is a create. The model-level
 * guard only covers updates and deletes, so a demo quotation happily took new
 * lines, stored them unflagged, and showed them as ordinary editable content
 * alongside the seeded ones. Deleting a line was worse: the seeded rows refused
 * while the ones added on top went through, so the same quotation behaved two
 * different ways depending on which row you picked.
 *
 * Checked against the version rather than the item because that is what makes
 * the content demo content. Left where the `is_approve` check already sits: both
 * ask "may this version be changed at all", and answering them together keeps a
 * new write path from picking up one and forgetting the other.
 */
const assertVersionIsNotSampleData = (version, verb = "edited") => {
  if (version?.is_sample_data === true) {
    throw sampleDataReadOnlyError("quotation version", verb);
  }
};

class QuotationVersionItemService {
  /**
   * The package summary row currently attached to a version, or null.
   * Read before a package is swapped or removed so the activity log can show
   * what it changed from.
   */
  async getCurrentPackage(quotationVersionId, transaction = null) {
    const { QuotationVersionItem } = db.sequelize?.models || db;
    const row = await QuotationVersionItem.findOne({
      where: { quotation_version_id: quotationVersionId, package_id: { [Op.ne]: null } },
      attributes: ["package_id", "package_name", "package_cost"],
      transaction,
    });
    return row ? { name: row.package_name, cost: row.package_cost } : null;
  }

  /**
   * Record a package add / swap / removal on the lead's activity feed.
   *
   * Packages are managed by this module, not by updateQuotationVersion, so the
   * diff-based logging there never sees them — without this the feed showed the
   * knock-on grand-total change but never which package caused it.
   *
   * Logged as `package` (name) and `packageCost` so the feed renders them the
   * same way it renders facade / floorPlan / grandTotalCost.
   */
  async logPackageChange({ version, userId, builderId, companyId, oldPackage, newPackage, transaction = null }) {
    const base = {
      userId,
      builderId,
      companyId,
      referenceId: version?.quotation?.leads_id ?? version?.quotation?.lead?.leads_id ?? null,
      referenceType: "LEAD",
      module: "Quotation",
      moduleId: version?.quotation_id,
      recordName: version?.quotation?.reference_number,
      action: "UPDATE",
      metadata: { quotationVersionNo: version?.quotation_version_no },
    };

    const entries = [
      { fieldName: "package", oldValue: oldPackage?.name ?? null, newValue: newPackage?.name ?? null },
      { fieldName: "packageCost", oldValue: oldPackage?.cost ?? null, newValue: newPackage?.cost ?? null },
    ];

    for (const entry of entries) {
      if (String(entry.oldValue ?? "") === String(entry.newValue ?? "")) continue;
      // eslint-disable-next-line no-await-in-loop
      await logActivity(transaction, { ...base, ...entry });
    }
  }

  /**
   * Ownership check: Ensures quotation version belongs to the current organization.
   */
  async verifyVersionOwnership(quotationVersionId, builderId, companyId) {
    const { QuotationVersion, Quotation, Leads } = db.sequelize?.models || db;
    const version = await QuotationVersion.findOne({
      where: { quotation_version_id: quotationVersionId },
      include: [
        {
          model: Quotation,
          as: "quotation",
          include: [
            {
              model: Leads,
              as: "lead",
              where: {
                [Op.or]: [
                  ...(builderId ? [{ builder_id: builderId }] : []),
                  ...(companyId ? [{ company_id: companyId }] : []),
                ],
              },
            },
          ],
        },
      ],
    });
    return version;
  }

  async verifyMetadataOwnership(tableName, idArray, companyId, builderId) {
    if (!idArray || !Array.isArray(idArray) || idArray.length === 0) {
      return true;
    }
    const modelName = tableName === "range" ? "Range" : "DwellingType";
    const Model = db[modelName];
    const count = await Model.count({
      where: {
        [`${tableName}_id`]: { [Op.in]: idArray },
        [Op.or]: [
          ...(companyId ? [{ company_id: companyId }] : []),
          ...(builderId ? [{ builder_id: builderId }] : []),
        ],
      },
    });
    return count === idArray.length;
  }

  async getEnrichedMetadata(rangeIds, dwellingTypeIds) {
    const result = {
      range: [],
      dwelling_type: [],
    };

    const { Range, DwellingType } = db.sequelize?.models || db;

    if (rangeIds && Array.isArray(rangeIds) && rangeIds.length > 0) {
      const ranges = await Range.findAll({
        where: { range_id: { [Op.in]: rangeIds } },
        attributes: [["range_id", "id"], "name"],
      });
      result.range = ranges.map(r => r.get({ plain: true }));
    }

    if (dwellingTypeIds && Array.isArray(dwellingTypeIds) && dwellingTypeIds.length > 0) {
      const dwellings = await DwellingType.findAll({
        where: { dwelling_type_id: { [Op.in]: dwellingTypeIds } },
        attributes: [["dwelling_type_id", "id"], "name"],
      });
      result.dwelling_type = dwellings.map(d => d.get({ plain: true }));
    }

    return result;
  }

  async getQuotationVersionItems(versionId, query, builderId, companyId) {
    const {
      QuotationVersionItem,
      PriceListItem,
      Package,
      PackagePricelistItemMap,
    } = db.sequelize?.models || db;

    const { range_id, dwelling_type_id, package_id: excludePackageId } = query;

    // 1. Verify Ownership
    const version = await this.verifyVersionOwnership(versionId, builderId, companyId);
    if (!version) {
      throw { status: 404, message: "Quotation version not found or unauthorized" };
    }

    // 2. Build where filters
    const where = { quotation_version_id: versionId };

    if (range_id) {
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({
        [Op.or]: [
          { price_list_item_range_id: { [Op.contains]: [range_id] } },
          { price_list_item_range_id: [] },
        ],
      });
    }

    if (dwelling_type_id) {
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({
        [Op.or]: [
          { price_list_item_dwelling_type_id: { [Op.contains]: [dwelling_type_id] } },
          { price_list_item_dwelling_type_id: [] },
        ],
      });
    }

    if (excludePackageId) {
      where[Op.and] = where[Op.and] || [];
      const floorPlanId = version.floor_plan_id;

      const packageOrFloorPlanConditions = [
        { package_id: { [Op.is]: null } },
        { package_id: { [Op.ne]: excludePackageId } },
      ];

      if (floorPlanId) {
        packageOrFloorPlanConditions.push({
          price_list_item_id: {
            [Op.in]: db.sequelize.literal(`(SELECT price_list_item_id FROM floor_plan_pricelist_item_map WHERE floor_plan_id = '${floorPlanId}')`),
          },
        });
      }

      where[Op.and].push({
        [Op.or]: packageOrFloorPlanConditions,
      });
    }

    // 3. Fetch Items
    const items = await QuotationVersionItem.findAll({
      where,
      order: [["created_at", "ASC"]],
    });

    if (items.length === 0) {
      return {
        success: true,
        data: [],
        message: "No items found for this quotation version",
      };
    }

    // 4. Fetch mapped items for floor plan to determine automatic mapping status
    let mappedItemIds = [];
    if (version.floor_plan_id) {
      const { FloorPlanPricelistItemMap } = db.sequelize?.models || db;
      const maps = await FloorPlanPricelistItemMap.findAll({
        where: { floor_plan_id: version.floor_plan_id },
        attributes: ["price_list_item_id"],
      });
      mappedItemIds = maps.map(m => m.price_list_item_id);
    }

    // 5. Enrichment (Cost and Count mismatch logic + Automatic mapping check)
    const priceListItemIds = [...new Set(items.map(i => i.price_list_item_id).filter(id => id))];
    const packageIds = [...new Set(items.map(i => i.package_id).filter(id => id))];

    // Fetch current costs
    const masterCosts = await Promise.all([
      PriceListItem.findAll({
        where: { price_list_item_id: { [Op.in]: priceListItemIds } },
        attributes: ["price_list_item_id", "cost"],
      }),
      Package.findAll({
        where: { package_id: { [Op.in]: packageIds } },
        attributes: ["package_id", "cost"],
      }),
    ]);

    const costMap = {
      items: Object.fromEntries(masterCosts[0].map(c => [c.price_list_item_id, c.cost])),
      packages: Object.fromEntries(masterCosts[1].map(c => [c.package_id, c.cost])),
    };

    // Fetch current counts (for packages)
    const [savedPackageCounts, masterPackageCounts] = await Promise.all([
      // Saved count: items in this version for each package
      QuotationVersionItem.findAll({
        where: { quotation_version_id: versionId, package_id: { [Op.in]: packageIds } },
        attributes: ["package_id", [db.sequelize.fn("COUNT", db.sequelize.col("quotation_version_item_id")), "count"]],
        group: ["package_id"],
      }),
      // Master count: items in master package definition
      PackagePricelistItemMap.findAll({
        where: { package_id: { [Op.in]: packageIds } },
        include: [{
          model: PriceListItem,
          as: "priceListItem",
          where: { status: "active" },
          attributes: [],
        }],
        attributes: ["package_id", [db.sequelize.fn("COUNT", db.sequelize.col("PackagePricelistItemMap.id")), "count"]],
        group: ["package_id"],
      }),
    ]);

    const countMap = {
      saved: Object.fromEntries(savedPackageCounts.map(c => [c.package_id, parseInt(c.get("count"))])),
      master: Object.fromEntries(masterPackageCounts.map(c => [c.package_id, parseInt(c.get("count"))])),
    };

    const result = items.map(item => {
      const row = keysToCamelCase(item.get({ plain: true }));

      // Price List Item Mismatch
      let isPriceListItemCostMismatch = false;
      if (item.price_list_item_id && costMap.items[item.price_list_item_id] !== undefined) {
        const masterPrice = costMap.items[item.price_list_item_id];
        if (parseFloat(item.price_list_item_cost) !== parseFloat(masterPrice)) {
          isPriceListItemCostMismatch = true;
        }
      }

      // Package Mismatch
      let isPackageCostMismatch = false;
      if (item.package_id) {
        const masterPrice = costMap.packages[item.package_id];
        const savedCount = countMap.saved[item.package_id] || 0;
        const masterCount = countMap.master[item.package_id] || 0;

        if (masterPrice !== undefined && parseFloat(item.package_cost) !== parseFloat(masterPrice)) {
          isPackageCostMismatch = true;
        } else if (savedCount !== masterCount) {
          isPackageCostMismatch = true;
        }
      }

      // Automatic Mapping Check
      const isAutomaticallyMapped = item.price_list_item_id && mappedItemIds.includes(item.price_list_item_id) ? true : false;

      return {
        ...row,
        isPriceListItemCostMismatch,
        isPackageCostMismatch,
        isAutomaticallyMapped,
      };
    });

    return {
      success: true,
      data: result,
      message: 200,
    };
  }

  async addQuotationItem(data, builderId, companyId) {
    const { quotation_version_id, price_list_item_id, quantity, note } = data;
    const { QuotationVersionItem, PriceListItem, PriceList } = db.sequelize?.models || db;
    const t = await db.sequelize.transaction();

    try {
      // 1. Verify version ownership and approval status
      const version = await this.verifyVersionOwnership(quotation_version_id, builderId, companyId);
      if (!version) {
        throw { status: 404, message: "Quotation version not found or unauthorized" };
      }

      if (version.is_approve) {
        throw { status: 400, message: "Cannot modify an approved quotation version" };
      }
      assertVersionIsNotSampleData(version);

      // 2. Fetch master item details
      const masterItem = await PriceListItem.findOne({
        where: {
          price_list_item_id,
          status: "active",
          [Op.or]: [
            ...(companyId ? [{ company_id: companyId }] : []),
            ...(builderId ? [{ builder_id: builderId }] : []),
          ],
        },
        include: [{
          model: PriceList,
          as: "priceList",
          attributes: ["name"],
        }],
        transaction: t,
      });

      if (!masterItem) {
        throw { status: 404, message: "Price list item not found or inactive" };
      }

      // 3. Check for duplicate (where package_id is null)
      const duplicateExists = await QuotationVersionItem.findOne({
        where: { quotation_version_id, price_list_item_id, package_id: null },
        transaction: t,
      });

      if (duplicateExists) {
        throw { status: 409, message: "This item is already added to the quotation version" };
      }

      // 4. Calculate total price
      const qty = parseFloat(quantity) || 1;
      const cost = parseFloat(masterItem.cost || 0);
      const totalPrice = parseFloat((qty * cost).toFixed(2));

      // 5. Create snapshot
      const newItem = await QuotationVersionItem.create({
        quotation_version_id,
        price_list_id: masterItem.price_list_id,
        price_list_name: masterItem.priceList?.name,
        price_list_item_id: masterItem.price_list_item_id,
        price_list_item_description: masterItem.item_description,
        price_list_item_short_description: masterItem.short_description,
        price_list_item_cost_type: masterItem.cost_type,
        price_list_item_cost_type_text: masterItem.cost_type_text,
        price_list_item_cost_option: masterItem.cost_option,
        price_list_item_cost: masterItem.cost,
        price_list_item_builder_cost: masterItem.builder_cost,
        price_list_item_sort_order: masterItem.sort_order,
        price_list_item_uom: masterItem.uom,
        price_list_item_status: masterItem.status,
        price_list_item_include_by_default: masterItem.include_by_default,
        price_list_item_allow_remove_from_quotation: masterItem.allow_remove_from_quotation,
        price_list_item_show_in_hl_package: masterItem.show_in_hl_package,
        price_list_item_package_only: masterItem.show_only_in_package,
        price_list_item_range_id: masterItem.range_id,
        price_list_item_dwelling_type_id: masterItem.dwelling_type_id,
        price_list_item_created_at: masterItem.createdAt,
        price_list_item_updated_at: masterItem.updatedAt,
        quantity: qty,
        note: note || null,
        total_price: totalPrice,
      }, { transaction: t });

      await t.commit();
      return {
        success: true,
        data: keysToCamelCase(newItem.get({ plain: true })),
        message: "Item added to quotation version successfully",
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async updateQuotationVersionItem(id, updateData, builderId, companyId) {
    const { quantity, note, price_list_item_description } = updateData;
    const { QuotationVersionItem, QuotationVersion, Quotation, Leads } = db.sequelize?.models || db;
    const t = await db.sequelize.transaction();

    try {
      // 1. Fetch item with includes to verify ownership and approval status
      const item = await QuotationVersionItem.findOne({
        where: { quotation_version_item_id: id },
        include: [{
          model: QuotationVersion,
          as: "quotationVersion",
          required: true,
          include: [{
            model: Quotation,
            as: "quotation",
            required: true,
            include: [{
              model: Leads,
              as: "lead",
              required: true,
              where: {
                [Op.or]: [
                  ...(builderId ? [{ builder_id: builderId }] : []),
                  ...(companyId ? [{ company_id: companyId }] : []),
                ],
              },
            }],
          }],
        }],
        transaction: t,
      });

      if (!item) {
        throw { status: 404, message: "Quotation version item not found or unauthorized" };
      }

      if (item.quotationVersion?.is_approve) {
        throw { status: 400, message: "Cannot modify an approved quotation version" };
      }
      assertVersionIsNotSampleData(item.quotationVersion);

      // 2. Perform calculations
      const qty = quantity !== undefined ? parseFloat(quantity) : parseFloat(item.quantity);
      const cost = parseFloat(item.price_list_item_cost || 0);
      const totalPrice = parseFloat((qty * cost).toFixed(2));

      // 3. Update
      await item.update({
        quantity: qty,
        note: note !== undefined ? note : item.note,
        total_price: totalPrice,
        price_list_item_description: price_list_item_description !== undefined ? price_list_item_description : item.price_list_item_description,
      }, { transaction: t });

      await t.commit();
      return {
        success: true,
        data: keysToCamelCase(item.get({ plain: true })),
        message: "Item updated successfully",
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Adds a package and its associated items to a quotation version.
   */
  async addQuotationPackage(payload) {
    const { quotation_version_id, package_id, builderId, companyId, userId } = payload;
    const { QuotationVersionItem, Package, PackagePricelistItemMap, PriceListItem, PriceList } =
      db.sequelize?.models || db;

    // 1. Ownership & Authorization
    const version = await this.verifyVersionOwnership(quotation_version_id, builderId, companyId);
    if (!version) {
      throw { status: 404, message: "Quotation version not found or unauthorized" };
    }
    if (version.is_approve) {
      throw { status: 400, message: "Cannot modify an approved quotation version" };
    }
    assertVersionIsNotSampleData(version);

    // 2. Fetch Package
    const pkg = await Package.findOne({
      where: {
        package_id,
        status: true,
        [Op.or]: [
          ...(builderId ? [{ builder_id: builderId }] : []),
          ...(companyId ? [{ company_id: companyId }] : []),
        ],
      },
    });
    if (!pkg) {
      throw { status: 404, message: "Package not found or inactive" };
    }

    // 3. Duplicate check - Check if any package already exists in this quotation version
    const existingPackage = await QuotationVersionItem.findOne({
      where: {
        quotation_version_id,
        package_id: { [Op.ne]: null },
      },
    });
    if (existingPackage) {
      throw {
        status: 409,
        message:
          "A package has already been added to this quotation version. Please remove the existing package before adding a new one.",
      };
    }

    // 4. Fetch all items for this package
    const packageItems = await PackagePricelistItemMap.findAll({
      where: { package_id },
      include: [
        {
          model: PriceListItem,
          as: "priceListItem",
          where: { status: "active" },
          include: [{ model: PriceList, as: "priceList" }],
        },
      ],
    });

    const t = await db.sequelize.transaction();
    try {
      const insertedItems = [];

      // 5. Always insert a "Package Summary" row that carries the total price
      const summary = await QuotationVersionItem.create(
        {
          quotation_version_id,
          package_id: pkg.package_id,
          package_name: pkg.name,
          package_cost: pkg.cost,
          package_builder_cost: pkg.builder_cost,
          quantity: 1,
          total_price: pkg.cost || 0,
        },
        { transaction: t },
      );
      insertedItems.push(summary);

      // 6. If there are items, insert them with total_price = 0 (marking them as "Included")
      if (packageItems.length > 0) {
        const itemRows = packageItems.map((itemMap) => {
          const pli = itemMap.priceListItem;
          const pl = pli.priceList;
          return {
            quotation_version_id,
            price_list_id: pli.price_list_id,
            price_list_name: pl?.name || null,
            price_list_item_id: pli.price_list_item_id,
            price_list_item_description: pli.item_description,
            price_list_item_short_description: pli.short_description,
            price_list_item_cost_type: pli.cost_type,
            price_list_item_cost_type_text: pli.cost_type_text,
            price_list_item_cost_option: pli.cost_option,
            price_list_item_cost: pli.cost,
            price_list_item_builder_cost: pli.builder_cost,
            price_list_item_sort_order: pli.sort_order,
            price_list_item_uom: pli.uom,
            price_list_item_status: pli.status,
            price_list_item_include_by_default: pli.include_by_default,
            price_list_item_allow_remove_from_quotation: pli.allow_remove_from_quotation,
            price_list_item_show_in_hl_package: pli.show_in_hl_package,
            price_list_item_package_only: pli.show_only_in_package,
            price_list_item_range_id: pli.range_id,
            price_list_item_dwelling_type_id: pli.dwelling_type_id,
            price_list_item_created_at: pli.createdAt,
            price_list_item_updated_at: pli.updatedAt,
            package_id: pkg.package_id,
            package_name: pkg.name,
            package_cost: pkg.cost,
            package_builder_cost: pkg.builder_cost,
            quantity: 1,
            total_price: 0,
          };
        });

        // Use bulkCreate for performance
        const createdItems = await QuotationVersionItem.bulkCreate(itemRows, {
          transaction: t,
          returning: true,
        });
        insertedItems.push(...createdItems);
      }

      // Keep the canonical quotation_version.package_id FK in sync with the
      // snapshot rows — the Engineering Requirement PDF and version
      // duplication read the selected package via this column, not the items.
      await version.update({ package_id: pkg.package_id }, { transaction: t });

      await this.logPackageChange({
        version,
        userId,
        builderId,
        companyId,
        oldPackage: null,
        newPackage: { name: pkg.name, cost: pkg.cost },
        transaction: t,
      });

      await t.commit();
      return {
        success: true,
        data: insertedItems.map((item) => keysToCamelCase(item.get({ plain: true }))),
        message: "Package added to quotation version successfully",
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async updateQuotationPackage(payload) {
    const { quotation_version_id, package_id, builderId, companyId, userId } = payload;
    const { QuotationVersionItem } = db.sequelize?.models || db;
    const t = await db.sequelize.transaction();
    try {
      const version = await this.verifyVersionOwnership(quotation_version_id, builderId, companyId);
      if (!version) throw { status: 404, message: "Quotation version not found or unauthorized" };
      if (version.is_approve) throw { status: 400, message: "Cannot modify an approved quotation version" };
      assertVersionIsNotSampleData(version);

      // Read the outgoing package before the destroy below wipes it.
      const oldPackage = await this.getCurrentPackage(quotation_version_id, t);

      await QuotationVersionItem.destroy({
        where: { quotation_version_id, package_id: { [Op.ne]: null } },
        transaction: t,
      });

      const pkg = await db.Package.findOne({
        where: { package_id, status: true, [Op.or]: [...(builderId ? [{ builder_id: builderId }] : []), ...(companyId ? [{ company_id: companyId }] : [])] },
        transaction: t,
      });
      if (!pkg) throw { status: 404, message: "Package not found or inactive" };

      const packageItems = await db.PackagePricelistItemMap.findAll({
        where: { package_id },
        include: [{ model: db.PriceListItem, as: "priceListItem", where: { status: "active" }, include: [{ model: db.PriceList, as: "priceList" }] }],
        transaction: t,
      });

      const insertedItems = [];
      const summary = await QuotationVersionItem.create({
        quotation_version_id, package_id: pkg.package_id, package_name: pkg.name,
        package_cost: pkg.cost, package_builder_cost: pkg.builder_cost,
        quantity: 1, total_price: pkg.cost || 0,
      }, { transaction: t });
      insertedItems.push(summary);

      if (packageItems.length > 0) {
        const itemRows = packageItems.map((itemMap) => {
          const pli = itemMap.priceListItem;
          const pl = pli.priceList;
          return {
            quotation_version_id, price_list_id: pli.price_list_id, price_list_name: pl?.name || null,
            price_list_item_id: pli.price_list_item_id, price_list_item_description: pli.item_description,
            price_list_item_short_description: pli.short_description, price_list_item_cost_type: pli.cost_type,
            price_list_item_cost_type_text: pli.cost_type_text, price_list_item_cost_option: pli.cost_option,
            price_list_item_cost: pli.cost, price_list_item_builder_cost: pli.builder_cost,
            price_list_item_sort_order: pli.sort_order, price_list_item_uom: pli.uom,
            price_list_item_status: pli.status, price_list_item_include_by_default: pli.include_by_default,
            price_list_item_allow_remove_from_quotation: pli.allow_remove_from_quotation,
            price_list_item_show_in_hl_package: pli.show_in_hl_package, price_list_item_package_only: pli.show_only_in_package,
            price_list_item_range_id: pli.range_id, price_list_item_dwelling_type_id: pli.dwelling_type_id,
            price_list_item_created_at: pli.createdAt, price_list_item_updated_at: pli.updatedAt,
            package_id: pkg.package_id, package_name: pkg.name, package_cost: pkg.cost,
            package_builder_cost: pkg.builder_cost, quantity: 1, total_price: 0,
          };
        });
        const createdItems = await QuotationVersionItem.bulkCreate(itemRows, { transaction: t, returning: true });
        insertedItems.push(...createdItems);
      }

      // Keep the canonical quotation_version.package_id FK in sync with the
      // snapshot rows (see addQuotationPackage).
      await version.update({ package_id: pkg.package_id }, { transaction: t });

      await this.logPackageChange({
        version,
        userId,
        builderId,
        companyId,
        oldPackage,
        newPackage: { name: pkg.name, cost: pkg.cost },
        transaction: t,
      });

      await t.commit();
      return {
        success: true,
        data: insertedItems.map((item) => keysToCamelCase(item.get({ plain: true }))),
        message: "Package updated successfully",
      };
    } catch (error) {
      if (t) await t.rollback();
      throw error;
    }
  }

  /**
   * Deletes a specific quotation version item.
   */
  async deleteQuotationVersionItem(id, builderId, companyId) {
    const { QuotationVersionItem, QuotationVersion, Quotation, Leads } =
      db.sequelize?.models || db;

    // 1. Fetch item with includes for ownership & approved check
    const item = await QuotationVersionItem.findOne({
      where: { quotation_version_item_id: id },
      include: [
        {
          model: QuotationVersion,
          as: "quotationVersion",
          include: [
            {
              model: Quotation,
              as: "quotation",
              include: [
                {
                  model: Leads,
                  as: "lead",
                  where: {
                    [Op.or]: [
                      ...(builderId ? [{ builder_id: builderId }] : []),
                      ...(companyId ? [{ company_id: companyId }] : []),
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    if (!item) {
      throw { status: 404, message: "Quotation version item not found or unauthorized" };
    }

    // 2. Business rule validations
    if (item.quotationVersion?.is_approve) {
      throw { status: 400, message: "Cannot modify an approved quotation version" };
    }
    assertVersionIsNotSampleData(item.quotationVersion, "deleted");

    if (item.package_id) {
      throw {
        status: 400,
        message:
          "Cannot delete an item that belongs to a package. Please remove the entire package instead.",
      };
    }

    // 3. Delete
    await item.destroy();
    return {
      success: true,
      message: "Item deleted successfully",
    };
  }

  /**
   * Removes all items associated with a package from a quotation version.
   */
  async removePackageFromVersion(versionId, packageId, builderId, companyId, userId) {
    const { QuotationVersionItem } = db.sequelize?.models || db;

    // 1. Ownership & Authorization
    const version = await this.verifyVersionOwnership(versionId, builderId, companyId);
    if (!version) {
      throw { status: 404, message: "Quotation version not found or unauthorized" };
    }
    if (version.is_approve) {
      throw { status: 400, message: "Cannot modify an approved quotation version" };
    }
    assertVersionIsNotSampleData(version, "deleted");

    // Read the package before deleting it so the log can name what was removed.
    const oldPackage = await this.getCurrentPackage(versionId);

    // 2. Perform Deletion
    const deletedCount = await QuotationVersionItem.destroy({
      where: {
        quotation_version_id: versionId,
        package_id: packageId,
      },
    });

    if (deletedCount === 0) {
      throw { status: 404, message: "No items found for this package in the quotation version" };
    }

    // Clear the canonical FK so readers (Engineering Requirement PDF, version
    // duplication) don't keep reporting a package that was removed.
    if (version.package_id === packageId) {
      await version.update({ package_id: null });
    }

    await this.logPackageChange({
      version,
      userId,
      builderId,
      companyId,
      oldPackage,
      newPackage: null,
    });

    return {
      success: true,
      message: "Package removed successfully",
    };
  }

  async addExtraQuotationItemService(quotationVersionId, data, builderId, companyId) {
    const { QuotationVersionItem, PriceList } = db.sequelize?.models || db;
    const {
      extra_type,
      price_list_id,
      price_list_item_id,
      price_list_item_description,
      price_list_item_cost_type,
      price_list_item_builder_cost,
      price_list_item_uom,
      price_list_item_cost,
      quantity,
      note,
      price_list_item_range_id,
      price_list_item_dwelling_type_id,
      price_list_item_cost_type_text,
    } = data;

    const t = await db.sequelize.transaction();
    try {
      // 1. Verify version ownership and approval status
      const version = await this.verifyVersionOwnership(quotationVersionId, builderId, companyId);
      if (!version) {
        throw { status: 404, message: "Quotation version not found or unauthorized" };
      }

      if (version.is_approve) {
        throw { status: 400, message: "Cannot modify an approved quotation version" };
      }
      assertVersionIsNotSampleData(version);

      // 2. Verify metadata ownership
      const rangesValid = await this.verifyMetadataOwnership("range", price_list_item_range_id, companyId, builderId);
      if (!rangesValid) {
        throw { status: 403, message: "One or more Range IDs are invalid or unauthorized" };
      }

      const dwellingTypesValid = await this.verifyMetadataOwnership("dwelling_type", price_list_item_dwelling_type_id, companyId, builderId);
      if (!dwellingTypesValid) {
        throw { status: 403, message: "One or more Dwelling Type IDs are invalid or unauthorized" };
      }

      // 3. Fetch Price List details
      const priceList = await PriceList.findOne({
        where: {
          price_list_id,
          [Op.or]: [
            ...(companyId ? [{ company_id: companyId }] : []),
            ...(builderId ? [{ builder_id: builderId }] : []),
          ],
        },
        attributes: ["name"],
      });

      if (!priceList) {
        throw { status: 404, message: "Price list not found or unauthorized" };
      }

      // 4. Calculations
      let qty = parseFloat(quantity) || 1;
      let unitCost = parseFloat(price_list_item_cost || 0);
      let bCost = parseFloat(price_list_item_builder_cost || 0);
      let totalPrice = 0;
      let pCostType = price_list_item_cost_type || null;
      let pUom = price_list_item_uom || null;

      if (pCostType === "Included") {
        qty = 1;
        unitCost = 0;
        bCost = 0;
        totalPrice = 0;
      }

      if (extra_type === "item") {
        totalPrice = parseFloat((qty * unitCost).toFixed(2));
      } else if (extra_type === "discount") {
        qty = 1;
        unitCost = -Math.abs(unitCost);
        totalPrice = unitCost;
        pCostType = null;
        pUom = null;
        bCost = null;
      } else if (extra_type === "complimentry") {
        totalPrice = 0;
      }

      // 5. Create Item
      const newItem = await QuotationVersionItem.create({
        quotation_version_id: quotationVersionId,
        price_list_id,
        price_list_item_id: price_list_item_id || null,
        price_list_name: priceList.name,
        price_list_item_description,
        price_list_item_cost_type: pCostType,
        price_list_item_cost: unitCost,
        price_list_item_builder_cost: bCost,
        price_list_item_uom: pUom,
        extra_type,
        extra_item: true,
        quantity: qty,
        note: note || null,
        total_price: totalPrice,
        price_list_item_range_id: price_list_item_range_id || [],
        price_list_item_dwelling_type_id: price_list_item_dwelling_type_id || [],
        price_list_item_cost_type_text: price_list_item_cost_type_text || null,
      }, { transaction: t });

      const plainItem = newItem.get({ plain: true });
      if (!plainItem.price_list_item_id) {
        plainItem.price_list_item_id = plainItem.quotation_version_item_id;
      }

      const enrichedMetadata = await this.getEnrichedMetadata(newItem.price_list_item_range_id, newItem.price_list_item_dwelling_type_id);

      await t.commit();
      return {
        success: true,
        data: keysToCamelCase({ ...plainItem, ...enrichedMetadata }),
        message: "Extra item added successfully",
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async updateExtraQuotationItemService(id, data, builderId, companyId) {
    const { QuotationVersionItem } = db.sequelize?.models || db;
    const {
      price_list_item_description,
      price_list_item_cost_type,
      price_list_item_builder_cost,
      price_list_item_uom,
      price_list_item_cost,
      quantity,
      note,
      price_list_item_cost_type_text,
      price_list_item_range_id,
      price_list_item_dwelling_type_id,
    } = data;

    const t = await db.sequelize.transaction();
    try {
      // 1. Fetch existing item and check ownership/approval status via associations
      const item = await QuotationVersionItem.findOne({
        where: { quotation_version_item_id: id, extra_item: true },
        include: [{
          model: db.QuotationVersion,
          as: "quotationVersion",
          include: [{
            model: db.Quotation,
            as: "quotation",
            include: [{
              model: db.Leads,
              as: "lead",
              where: {
                [Op.or]: [
                  ...(companyId ? [{ company_id: companyId }] : []),
                  ...(builderId ? [{ builder_id: builderId }] : []),
                ],
              },
            }],
          }],
        }],
        transaction: t,
      });

      if (!item) {
        throw { status: 404, message: "Extra quotation version item not found or unauthorized" };
      }

      if (item.quotationVersion?.is_approve) {
        throw { status: 400, message: "Cannot modify an approved quotation version" };
      }
      assertVersionIsNotSampleData(item.quotationVersion);

      // 2. Verify metadata ownership if provided
      if (price_list_item_range_id !== undefined) {
        const rangesValid = await this.verifyMetadataOwnership("range", price_list_item_range_id, companyId, builderId);
        if (!rangesValid) {
          throw { status: 403, message: "One or more Range IDs are invalid or unauthorized" };
        }
      }

      if (price_list_item_dwelling_type_id !== undefined) {
        const dwellingTypesValid = await this.verifyMetadataOwnership("dwelling_type", price_list_item_dwelling_type_id, companyId, builderId);
        if (!dwellingTypesValid) {
          throw { status: 403, message: "One or more Dwelling Type IDs are invalid or unauthorized" };
        }
      }

      // 3. Calculations
      const extra_type = item.extra_type;
      let qty = parseFloat(quantity !== undefined ? quantity : item.quantity);
      let unitCost = parseFloat(price_list_item_cost !== undefined ? price_list_item_cost : item.price_list_item_cost);
      let bCost = parseFloat(price_list_item_builder_cost !== undefined ? price_list_item_builder_cost : item.price_list_item_builder_cost);
      let pCostType = price_list_item_cost_type !== undefined ? price_list_item_cost_type : item.price_list_item_cost_type;
      let pUom = price_list_item_uom !== undefined ? price_list_item_uom : item.price_list_item_uom;
      let totalPrice = parseFloat(item.total_price);

      if (pCostType === "Included") {
        qty = 1;
        unitCost = 0;
        bCost = 0;
        totalPrice = 0;
      }

      if (extra_type === "item") {
        totalPrice = parseFloat((qty * unitCost).toFixed(2));
      } else if (extra_type === "discount") {
        qty = 1;
        unitCost = -Math.abs(unitCost);
        totalPrice = unitCost;
        pCostType = null;
        pUom = null;
        bCost = null;
      } else if (extra_type === "complimentry") {
        totalPrice = 0;
      }

      // 4. Update
      await item.update({
        price_list_item_description: price_list_item_description !== undefined ? price_list_item_description : item.price_list_item_description,
        price_list_item_cost_type: pCostType,
        price_list_item_cost: unitCost,
        price_list_item_builder_cost: bCost,
        price_list_item_uom: pUom,
        quantity: qty,
        note: note !== undefined ? note : item.note,
        total_price: totalPrice,
        price_list_item_cost_type_text: price_list_item_cost_type_text !== undefined ? price_list_item_cost_type_text : item.price_list_item_cost_type_text,
        price_list_item_range_id: price_list_item_range_id !== undefined ? price_list_item_range_id : item.price_list_item_range_id,
        price_list_item_dwelling_type_id: price_list_item_dwelling_type_id !== undefined ? price_list_item_dwelling_type_id : item.price_list_item_dwelling_type_id,
        updatedAt: new Date(),
      }, { transaction: t });

      const plainItem = item.get({ plain: true });
      if (!plainItem.price_list_item_id) {
        plainItem.price_list_item_id = plainItem.quotation_version_item_id;
      }

      const enrichedMetadata = await this.getEnrichedMetadata(item.price_list_item_range_id, item.price_list_item_dwelling_type_id);

      await t.commit();
      return {
        success: true,
        data: keysToCamelCase({ ...plainItem, ...enrichedMetadata }),
        message: "Extra item updated successfully",
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

export default new QuotationVersionItemService();
