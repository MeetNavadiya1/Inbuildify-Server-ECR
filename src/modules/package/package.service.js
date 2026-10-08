import db from "../../config/database/models/postgre-models/index.js";

/**
 * GET ALL PACKAGES SERVICE
 */
export async function getAllPackagesService({ builder_id, query }) {

  const { Op } = db.Sequelize;
  const {
    page = 1,
    limit = 25,
    search,
    status,
    package_group_id,
    range_id,
    dwelling_type_id,
    range_name,
    dwelling_type_name,
    package_group_name,
    name: sort_name,
    cost: sort_cost,
    builder_cost: sort_builder_cost,
  } = query;
  const pageValue = parseInt(page, 10) > 0 ? parseInt(page, 10) : 1;
  const limitValue = parseInt(limit, 10) > 0 ? parseInt(limit, 10) : 25;
  const offset = (pageValue - 1) * limitValue;

  const where = { builder_id: builder_id };

  if (search && search.trim() !== "") {
    const searchVal = `%${search.trim().toLowerCase()}%`;
    // Qualify with the "Package" alias — the PriceListItem include also has a
    // `cost` column, so a bare col("cost") is ambiguous in Postgres.
    where[Op.or] = [
      db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("Package.name")), { [Op.like]: searchVal }),
      db.sequelize.where(db.sequelize.cast(db.sequelize.col("Package.cost"), "text"), { [Op.like]: searchVal }),
    ];
  }

  if (status !== undefined && status !== "") {
    where["$Package.status$"] = status === "true" || status === true;
  }

  if (package_group_id) {
    const pgIds = Array.isArray(package_group_id) ? package_group_id : [package_group_id];
    where.package_group_id = { [Op.contains]: db.sequelize.literal(`ARRAY['${pgIds.join("','")}']::uuid[]`) };
  }

  if (range_id) {
    const rIds = Array.isArray(range_id) ? range_id : [range_id];
    where.range_id = { [Op.contains]: db.sequelize.literal(`ARRAY['${rIds.join("','")}']::uuid[]`) };
  }

  if (dwelling_type_id) {
    const dtIds = Array.isArray(dwelling_type_id) ? dwelling_type_id : [dwelling_type_id];
    where.dwelling_type_id = { [Op.contains]: db.sequelize.literal(`ARRAY['${dtIds.join("','")}']::uuid[]`) };
  }

  if (range_name && range_name.trim() !== "") {
    const rName = `%${range_name.trim().toLowerCase()}%`;
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(
      db.sequelize.literal(`EXISTS (SELECT 1 FROM "range" r WHERE r.range_id = ANY("Package"."range_id") AND LOWER(r.name) LIKE '${rName}')`),
    );
  }

  if (dwelling_type_name && dwelling_type_name.trim() !== "") {
    const dtn = `%${dwelling_type_name.trim().toLowerCase()}%`;
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(
      db.sequelize.literal(`EXISTS (SELECT 1 FROM dwelling_type dt WHERE dt.dwelling_type_id = ANY("Package"."dwelling_type_id") AND LOWER(dt.name) LIKE '${dtn}')`),
    );
  }

  if (package_group_name && package_group_name.trim() !== "") {
    const pgn = `%${package_group_name.trim().toLowerCase()}%`;
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(
      db.sequelize.literal(`EXISTS (SELECT 1 FROM package_group pg WHERE pg.package_group_id = ANY("Package"."package_group_id") AND LOWER(pg.name) LIKE '${pgn}')`),
    );
  }

  let order = [["sort_order", "ASC"]];
  if (sort_name) {
    order = [[db.sequelize.fn("LOWER", db.sequelize.col("Package.name")), sort_name.toUpperCase() === "DESC" ? "DESC" : "ASC"]];
  } else if (sort_cost) {
    order = [["cost", sort_cost.toUpperCase() === "DESC" ? "DESC" : "ASC"]];
  } else if (sort_builder_cost) {
    order = [["builder_cost", sort_builder_cost.toUpperCase() === "DESC" ? "DESC" : "ASC"]];
  }

  const { count, rows: packages } = await db.Package.findAndCountAll({
    where,
    limit: limitValue,
    offset,
    order,
    include: [
      {
        model: db.PackagePricelistItemMap,
        as: "pricelistItemMaps",
        include: [
          {
            model: db.PriceListItem,
            as: "priceListItem",
            include: [{ model: db.PriceList, as: "priceList", attributes: ["price_list_id", "name"] }],
          },
        ],
      },
    ],
    distinct: true,
  });

  // Fetch associations for array columns
  const allRangeIds = [...new Set(packages.flatMap((p) => p.range_id || []))];
  const allDtIds = [...new Set(packages.flatMap((p) => p.dwelling_type_id || []))];
  const allPgIds = [...new Set(packages.flatMap((p) => p.package_group_id || []))];

  const [ranges, dwellingTypes, packageGroups] = await Promise.all([
    allRangeIds.length ? db.Range.findAll({ where: { range_id: allRangeIds, is_active: true }, attributes: ["range_id", "name"] }) : [],
    allDtIds.length ? db.DwellingType.findAll({ where: { dwelling_type_id: allDtIds, is_active: true }, attributes: ["dwelling_type_id", "name"] }) : [],
    allPgIds.length ? db.PackageGroup.findAll({ where: { package_group_id: allPgIds }, attributes: ["package_group_id", "name"] }) : [],
  ]);

  const rangeMap = Object.fromEntries(ranges.map((r) => [r.range_id, r.name]));
  const dtMap = Object.fromEntries(dwellingTypes.map((dt) => [dt.dwelling_type_id, dt.name]));
  const pgMap = Object.fromEntries(packageGroups.map((pg) => [pg.package_group_id, pg.name]));

  const formattedPackages = packages.map((p) => {
    const pkg = p.get({ plain: true });

    return {
      packageId: pkg.package_id,
      companyId: pkg.company_id,
      builderId: pkg.builder_id,
      name: pkg.name,
      cost: pkg.cost ? pkg.cost.toString() : null,
      builderCost: pkg.builder_cost ? pkg.builder_cost.toString() : null,
      sortOrder: pkg.sort_order,
      status: pkg.status,
      // Seeded demo record — badged in the UI (Settings → Sample Data clears it).
      isSampleData: pkg.is_sample_data === true,
      allowAddItemFromPricelist: pkg.allow_add_item_from_pricelist,
      allowRemovePackageItems: pkg.allow_remove_package_items,
      packageGroupId: pkg.package_group_id || [],
      rangeId: pkg.range_id || [],
      dwellingTypeId: pkg.dwelling_type_id || [],
      packageGroup: (pkg.package_group_id || []).map((id) => ({ id, name: pgMap[id] })).filter((x) => x.name),
      range: (pkg.range_id || []).map((id) => ({ id, name: rangeMap[id] })).filter((x) => x.name),
      dwellingType: (pkg.dwelling_type_id || []).map((id) => ({ id, name: dtMap[id] })).filter((x) => x.name),
      pricelistItems: (pkg.pricelistItemMaps || []).map((m) => ({
        priceListItemId: m.price_list_item_id,
        id: m.id,
        itemDescription: m.priceListItem?.item_description,
        shortDescription: m.priceListItem?.short_description,
        cost: m.priceListItem?.cost,
        costType: m.priceListItem?.cost_type,
        uom: m.priceListItem?.uom,
        priceList: m.priceListItem?.priceList
          ? { id: m.priceListItem.priceList.price_list_id, name: m.priceListItem.priceList.name }
          : null,
      })),
      createdBy: pkg.created_by,
      updatedBy: pkg.updated_by,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
    };
  });

  return {
    packages: formattedPackages,
    totalRecords: count,
    currentPage: pageValue,
    totalPages: Math.ceil(count / limitValue),
    limit: limitValue,
  };
}

/**
 * CREATE PACKAGE SERVICE
 */
export async function createPackageService({ builder_id, company_id, user_id, payload }) {
  const { Op } = db.Sequelize;
  const {
    name,
    cost,
    builder_cost,
    sort_order,
    status,
    allow_add_item_from_pricelist,
    allow_remove_package_items,
    range_id,
    dwelling_type_id,
    package_group_id,
  } = payload;

  return await db.sequelize.transaction(async (t) => {
    // 1. Duplicate Name Check
    const existing = await db.Package.findOne({
      where: {
        company_id,
        builder_id,
        is_sample_data: false,
        name: { [Op.iLike]: name.trim() },
      },
      transaction: t,
    });

    if (existing) {
      const error = new Error("Package name already exists.");
      error.status = 409;
      throw error;
    }

    // 2. ID Validations
    if (range_id && range_id.length) {
      const ranges = await db.Range.findAll({
        where: { range_id: { [Op.in]: range_id }, is_active: true, builder_id },
        transaction: t,
      });
      if (ranges.length !== range_id.length) {
        const error = new Error("One or more range IDs are invalid or inactive.");
        error.status = 400;
        throw error;
      }
    }

    if (dwelling_type_id && dwelling_type_id.length) {
      const dwellingTypes = await db.DwellingType.findAll({
        where: { dwelling_type_id: { [Op.in]: dwelling_type_id }, is_active: true, builder_id },
        transaction: t,
      });
      if (dwellingTypes.length !== dwelling_type_id.length) {
        const error = new Error("One or more dwelling type IDs are invalid or inactive.");
        error.status = 400;
        throw error;
      }
    }

    if (package_group_id && package_group_id.length) {
      const packageGroups = await db.PackageGroup.findAll({
        where: {
          package_group_id: { [Op.in]: package_group_id },
          [Op.or]: [{ company_id }, { builder_id }],
        },
        transaction: t,
      });
      if (packageGroups.length !== package_group_id.length) {
        const error = new Error("One or more package group IDs are invalid.");
        error.status = 400;
        throw error;
      }
    }

    // 3. Resolve and validate sort_order
    const maxSortOrder = await db.Package.max("sort_order", {
      where: { builder_id },
      transaction: t,
    });

    const max = (maxSortOrder == null || isNaN(maxSortOrder)) ? 0 : Number(maxSortOrder);

    const parsedSortOrder = (sort_order === undefined || sort_order === null || sort_order === "") ? max + 1 : Number(sort_order);

    if (isNaN(parsedSortOrder) || parsedSortOrder < 1 || parsedSortOrder > max + 1) {
      const error = new Error(`Invalid sort_order. Allowed range is 1 to ${max + 1}.`);
      error.status = 400;
      throw error;
    }

    const finalSortOrder = parsedSortOrder;

    // 4. Shift existing to make room
    if (finalSortOrder <= max) {
      await db.Package.increment("sort_order", {
        by: 1,
        where: {
          builder_id,
          sort_order: { [Op.gte]: finalSortOrder },
        },
        transaction: t,
      });
    }

    // 5. Create the Package
    const newPackage = await db.Package.create(
      {
        company_id,
        builder_id,
        name: name.trim(),
        cost: cost ?? null,
        builder_cost: builder_cost ?? null,
        sort_order: finalSortOrder,
        status: status ?? true,
        allow_add_item_from_pricelist: allow_add_item_from_pricelist ?? false,
        allow_remove_package_items: allow_remove_package_items ?? true,
        range_id: range_id || [],
        dwelling_type_id: dwelling_type_id || [],
        package_group_id: package_group_id || [],
        created_by: user_id,
        updated_by: user_id,
      },
      { transaction: t },
    );

    // 6. Fetch names for the arrays
    const [rangesRes, dwellingTypesRes, packageGroupsRes] = await Promise.all([
      range_id && range_id.length ? db.Range.findAll({ where: { range_id, is_active: true }, attributes: ["range_id", "name"], transaction: t }) : [],
      dwelling_type_id && dwelling_type_id.length ? db.DwellingType.findAll({ where: { dwelling_type_id, is_active: true }, attributes: ["dwelling_type_id", "name"], transaction: t }) : [],
      package_group_id && package_group_id.length ? db.PackageGroup.findAll({ where: { package_group_id }, attributes: ["package_group_id", "name"], transaction: t }) : [],
    ]);

    const rangeMap = Object.fromEntries(rangesRes.map((r) => [r.range_id, r.name]));
    const dtMap = Object.fromEntries(dwellingTypesRes.map((dt) => [dt.dwelling_type_id, dt.name]));
    const pgMap = Object.fromEntries(packageGroupsRes.map((pg) => [pg.package_group_id, pg.name]));

    return {
      packageId: newPackage.package_id,
      companyId: newPackage.company_id,
      builderId: newPackage.builder_id,
      name: newPackage.name,
      cost: newPackage.cost ? newPackage.cost.toString() : null,
      builderCost: newPackage.builder_cost ? newPackage.builder_cost.toString() : null,
      sortOrder: newPackage.sort_order,
      status: newPackage.status,
      allowAddItemFromPricelist: newPackage.allow_add_item_from_pricelist,
      allowRemovePackageItems: newPackage.allow_remove_package_items,
      packageGroupId: newPackage.package_group_id || [],
      rangeId: newPackage.range_id || [],
      dwellingTypeId: newPackage.dwelling_type_id || [],
      range: (newPackage.range_id || []).map((id) => ({ id, name: rangeMap[id] })).filter((x) => x.name),
      dwellingType: (newPackage.dwelling_type_id || []).map((id) => ({ id, name: dtMap[id] })).filter((x) => x.name),
      packageGroup: (newPackage.package_group_id || []).map((id) => ({ id, name: pgMap[id] })).filter((x) => x.name),
      pricelistItems: [], // New package has no items yet
      createdBy: newPackage.created_by,
      updatedBy: newPackage.updated_by,
      createdAt: newPackage.createdAt,
      updatedAt: newPackage.updatedAt,
    };
  });
}

/**
 * UPDATE PACKAGE SERVICE
 */
export async function updatePackageService({ package_id, builder_id, company_id, user_id, payload }) {
  const { Op } = db.Sequelize;
  const {
    name,
    cost,
    builder_cost,
    sort_order,
    status,
    allow_add_item_from_pricelist,
    allow_remove_package_items,
    range_id,
    dwelling_type_id,
    package_group_id,
  } = payload;

  return await db.sequelize.transaction(async (t) => {
    // 1. Lock existing Package
    const packageInstance = await db.Package.findOne({
      where: { package_id, builder_id },
      lock: t.LOCK.UPDATE,
      transaction: t,
    });

    if (!packageInstance) {
      const error = new Error("Package not found or access denied.");
      error.status = 404;
      throw error;
    }

    // 2. ID Validations
    if (range_id && range_id.length) {
      const ranges = await db.Range.findAll({
        where: { range_id: { [Op.in]: range_id }, is_active: true, builder_id },
        transaction: t,
      });
      if (ranges.length !== range_id.length) {
        const error = new Error("One or more range IDs are invalid or inactive.");
        error.status = 400;
        throw error;
      }
    }

    if (dwelling_type_id && dwelling_type_id.length) {
      const dwellingTypes = await db.DwellingType.findAll({
        where: { dwelling_type_id: { [Op.in]: dwelling_type_id }, is_active: true, builder_id },
        transaction: t,
      });
      if (dwellingTypes.length !== dwelling_type_id.length) {
        const error = new Error("One or more dwelling type IDs are invalid or inactive.");
        error.status = 400;
        throw error;
      }
    }

    if (package_group_id && package_group_id.length) {
      const packageGroups = await db.PackageGroup.findAll({
        where: {
          package_group_id: { [Op.in]: package_group_id },
          [Op.or]: [{ company_id }, { builder_id }],
        },
        transaction: t,
      });
      if (packageGroups.length !== package_group_id.length) {
        const error = new Error("One or more package group IDs are invalid.");
        error.status = 400;
        throw error;
      }
    }

    // 3. Duplicate Name Check
    if (name) {
      const duplicateName = await db.Package.findOne({
        where: {
          company_id,
          builder_id,
          is_sample_data: false,
          name: { [Op.iLike]: name.trim() },
          package_id: { [Op.ne]: package_id },
        },
        transaction: t,
      });
      if (duplicateName) {
        const error = new Error("Package name already exists.");
        error.status = 409;
        throw error;
      }
    }

    // 4. Sort Order Shifting
    let finalSortOrder = packageInstance.sort_order;
    if (sort_order !== undefined && sort_order !== null && sort_order !== "") {
      const newSortOrder = Number(sort_order);
      const oldSortOrder = packageInstance.sort_order;

      if (newSortOrder !== oldSortOrder) {
        const maxSortOrder = await db.Package.max("sort_order", {
          where: { builder_id },
          transaction: t,
        });
        const max = (maxSortOrder == null || isNaN(maxSortOrder)) ? 0 : Number(maxSortOrder);

        if (isNaN(newSortOrder) || newSortOrder < 1 || newSortOrder > max) {
          const error = new Error(`Invalid sort_order. Allowed range is 1 to ${max}.`);
          error.status = 400;
          throw error;
        }

        finalSortOrder = newSortOrder;

        // Shift existing to make room
        if (newSortOrder > oldSortOrder) {
          await db.Package.decrement("sort_order", {
            by: 1,
            where: {
              builder_id,
              sort_order: { [Op.gt]: oldSortOrder, [Op.lte]: newSortOrder },
            },
            transaction: t,
          });
        } else {
          await db.Package.increment("sort_order", {
            by: 1,
            where: {
              builder_id,
              sort_order: { [Op.gte]: newSortOrder, [Op.lt]: oldSortOrder },
            },
            transaction: t,
          });
        }
        finalSortOrder = newSortOrder;
      }
    }

    // 5. Update
    await packageInstance.update(
      {
        name: name !== undefined ? name.trim() : packageInstance.name,
        cost: cost !== undefined ? cost : packageInstance.cost,
        builder_cost: builder_cost !== undefined ? builder_cost : packageInstance.builder_cost,
        sort_order: finalSortOrder,
        status: status !== undefined ? (typeof status === "string" ? status === "true" : status) : packageInstance.status,
        allow_add_item_from_pricelist: allow_add_item_from_pricelist !== undefined ? allow_add_item_from_pricelist : packageInstance.allow_add_item_from_pricelist,
        allow_remove_package_items: allow_remove_package_items !== undefined ? allow_remove_package_items : packageInstance.allow_remove_package_items,
        range_id: range_id !== undefined ? range_id : packageInstance.range_id,
        dwelling_type_id: dwelling_type_id !== undefined ? dwelling_type_id : packageInstance.dwelling_type_id,
        package_group_id: package_group_id !== undefined ? package_group_id : packageInstance.package_group_id,
        updated_by: user_id,
      },
      { transaction: t },
    );

    // 6. Fetch full results
    const [rangesRes, dwellingTypesRes, packageGroupsRes, pricelistItemsRes] = await Promise.all([
      db.Range.findAll({ where: { range_id: packageInstance.range_id || [], is_active: true }, attributes: ["range_id", "name"], transaction: t }),
      db.DwellingType.findAll({ where: { dwelling_type_id: packageInstance.dwelling_type_id || [], is_active: true }, attributes: ["dwelling_type_id", "name"], transaction: t }),
      db.PackageGroup.findAll({ where: { package_group_id: packageInstance.package_group_id || [] }, attributes: ["package_group_id", "name"], transaction: t }),
      db.PackagePricelistItemMap.findAll({
        where: { package_id },
        include: [
          {
            model: db.PriceListItem,
            as: "priceListItem",
            include: [{ model: db.PriceList, as: "priceList", attributes: ["price_list_id", "name"] }],
          },
        ],
        transaction: t,
      }),
    ]);

    const rangeMap = Object.fromEntries(rangesRes.map((r) => [r.range_id, r.name]));
    const dtMap = Object.fromEntries(dwellingTypesRes.map((dt) => [dt.dwelling_type_id, dt.name]));
    const pgMap = Object.fromEntries(packageGroupsRes.map((pg) => [pg.package_group_id, pg.name]));

    return {
      packageId: packageInstance.package_id,
      companyId: packageInstance.company_id,
      builderId: packageInstance.builder_id,
      name: packageInstance.name,
      cost: packageInstance.cost ? packageInstance.cost.toString() : null,
      builderCost: packageInstance.builder_cost ? packageInstance.builder_cost.toString() : null,
      sortOrder: packageInstance.sort_order,
      status: packageInstance.status,
      allowAddItemFromPricelist: packageInstance.allow_add_item_from_pricelist,
      allowRemovePackageItems: packageInstance.allow_remove_package_items,
      packageGroupId: packageInstance.package_group_id || [],
      rangeId: packageInstance.range_id || [],
      dwellingTypeId: packageInstance.dwelling_type_id || [],
      range: (packageInstance.range_id || []).map((id) => ({ id, name: rangeMap[id] })).filter((x) => x.name),
      dwellingType: (packageInstance.dwelling_type_id || []).map((id) => ({ id, name: dtMap[id] })).filter((x) => x.name),
      packageGroup: (packageInstance.package_group_id || []).map((id) => ({ id, name: pgMap[id] })).filter((x) => x.name),
      pricelistItems: pricelistItemsRes.map((m) => ({
        priceListItemId: m.price_list_item_id,
        id: m.id,
        itemDescription: m.priceListItem?.item_description,
        shortDescription: m.priceListItem?.short_description,
        cost: m.priceListItem?.cost,
        costType: m.priceListItem?.cost_type,
        uom: m.priceListItem?.uom,
        priceList: m.priceListItem?.priceList
          ? { id: m.priceListItem.priceList.price_list_id, name: m.priceListItem.priceList.name }
          : null,
      })),
      createdBy: packageInstance.created_by,
      updatedBy: packageInstance.updated_by,
      createdAt: packageInstance.createdAt,
      updatedAt: packageInstance.updatedAt,
    };
  });
}
/**
 * DELETE PACKAGE SERVICE
 */
export async function deletePackageService({ package_id, builder_id, company_id }) {
  const { Op } = db.Sequelize;

  return await db.sequelize.transaction(async (t) => {
    // 1. Fetch the package to get its sort_order and verify ownership
    const packageInstance = await db.Package.findOne({
      where: { package_id, builder_id },
      transaction: t,
    });

    if (!packageInstance) {
      const error = new Error("Package not found");
      error.status = 404;
      throw error;
    }

    const deletedSortOrder = packageInstance.sort_order;

    // 2. Delete the package
    await packageInstance.destroy({ transaction: t });

    // 3. Rebalance sort_order of remaining packages
    await db.Package.decrement("sort_order", {
      by: 1,
      where: {
        company_id,
        builder_id,
        sort_order: { [Op.gt]: deletedSortOrder },
      },
      transaction: t,
    });

    return true;
  });
}
