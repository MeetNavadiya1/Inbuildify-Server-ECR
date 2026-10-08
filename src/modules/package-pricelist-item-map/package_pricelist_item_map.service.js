import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

class PackagePriceListItemMapService {
  async createPackagePriceListItemMap(packageId, priceListItemId, builderId) {
    const { sequelize, PackagePricelistItemMap, Package, PriceListItem } = db;
    const t = await sequelize.transaction();
    try {
      if (!packageId || !priceListItemId) {
        throw { status: 400, message: "package_id and price_list_item_id are required" };
      }

      const pkg = await Package.findOne({
        where: { package_id: packageId, builder_id: builderId },
        transaction: t,
      });

      if (!pkg) {
        throw { status: 400, message: "Invalid package_id. You can use only your own packages" };
      }

      if (pkg.status !== true) {
        throw { status: 400, message: "Inactive package." };
      }

      const item = await PriceListItem.findOne({
        where: { price_list_item_id: priceListItemId, builder_id: builderId },
        transaction: t,
      });

      if (!item) {
        throw {
          status: 400,
          message: "Invalid price_list_item_id. You can use only your own price list items",
        };
      }

      if (item.status !== "active") {
        throw { status: 400, message: "Inactive price list item." };
      }

      const duplicateCheck = await PackagePricelistItemMap.findOne({
        where: { package_id: packageId, price_list_item_id: priceListItemId },
        transaction: t,
      });

      if (duplicateCheck) {
        throw { status: 400, message: "This package is already mapped with this price list item." };
      }

      const mapping = await PackagePricelistItemMap.create(
        {
          package_id: packageId,
          price_list_item_id: priceListItemId,
        },
        { transaction: t },
      );

      await t.commit();
      return {
        success: true,
        data: keysToCamelCase(mapping.get({ plain: true })),
        message: "Package price list item mapped successfully",
      };
    } catch (error) {
      if (t) await t.rollback();
      throw error;
    }
  }

  async getAllPackagePriceListItemMap(builderId, page = 1, limit = 25) {
    const { sequelize, PackagePricelistItemMap, Package, PriceListItem } = db;
    try {
      const pageValue = parseInt(page, 10);
      const limitValue = parseInt(limit, 10);
      const offset = (pageValue - 1) * limitValue;

      const { count, rows } = await PackagePricelistItemMap.findAndCountAll({
        include: [
          {
            model: Package,
            as: "package",
            where: { builder_id: builderId },
            required: true,
            attributes: [],
          },
          {
            model: PriceListItem,
            as: "priceListItem",
            where: { builder_id: builderId },
            required: true,
            attributes: [],
          },
        ],
        order: [["id", "DESC"]],
        limit: limitValue,
        offset: offset,
      });

      const totalPages = Math.ceil(count / limitValue);

      return {
        success: true,
        data: {
          packagePriceListItemMap: keysToCamelCase(rows.map((row) => row.get({ plain: true }))),
          pagination: {
            currentPage: pageValue,
            totalPages,
            totalRecords: count,
            limit: limitValue,
          },
        },
        message: "Package price list item mappings fetched successfully",
      };
    } catch (error) {
      throw error;
    }
  }

  async getPackagePricelistItemByPackageId(packageId, builderId) {
    const { PackagePricelistItemMap, Package, PriceListItem } = db;
    
    try {
      const pkgCheck = await Package.findOne({
        where: { package_id: packageId, builder_id: builderId },
      });

      if (!pkgCheck) {
        throw { status: 403, message: "You cannot access labels for another builder's package" };
      }

      const mappings = await PackagePricelistItemMap.findAll({
        where: { package_id: packageId },
        include: [
          {
            model: Package,
            as: "package",
            attributes: ["builder_id"],
            required: true,
          },
          {
            model: PriceListItem,
            as: "priceListItem",
            required: true,
            attributes: [],
          },
        ],
      });

      const result = mappings.map((m) => {
        const plain = m.get({ plain: true });
        return {
          ...plain,
          package_builder_id: plain.package.builder_id,
        };
      });

      return {
        success: true,
        data: {
          packagePricelistItemMaps: keysToCamelCase(result),
        },
        message: "Package price list item mappings fetched successfully",
      };
    } catch (error) {
      throw error;
    }
  }

  async deletePackagePricelistItemMap(id, builderId) {
    const { sequelize, PackagePricelistItemMap, Package } = db;
    const t = await sequelize.transaction();
    try {
      const mapping = await PackagePricelistItemMap.findOne({
        where: { id },
        include: [
          {
            model: Package,
            as: "package",
            where: { builder_id: builderId },
            required: true,
          },
        ],
        transaction: t,
      });

      if (!mapping) {
        throw { status: 403, message: "You are not allowed to delete this mapping." };
      }

      await mapping.destroy({ transaction: t });

      await t.commit();
      return {
        success: true,
        data: {},
        message: "package pricelist item map deleted successfully.",
      };
    } catch (error) {
      if (t) await t.rollback();
      throw error;
    }
  }

  async updatePackagePriceListItemMap(id, updateData, builderId) {
    const { sequelize, PackagePricelistItemMap, Package, PriceListItem } = db;
    const t = await sequelize.transaction();
    try {
      const { package_id, price_list_item_id } = updateData;

      const mapping = await PackagePricelistItemMap.findOne({
        where: { id },
        include: [
          {
            model: Package,
            as: "package",
            attributes: ["builder_id", "package_id"],
            required: true,
          },
          {
            model: PriceListItem,
            as: "priceListItem",
            attributes: ["builder_id", "price_list_item_id"],
            required: true,
          },
        ],
        transaction: t,
      });

      if (!mapping) {
        throw { status: 404, message: "Record not found" };
      }

      if (
        mapping.package.builder_id !== builderId ||
        mapping.priceListItem.builder_id !== builderId
      ) {
        throw { status: 403, message: "You cannot update records of another builder" };
      }

      const updates = {};

      if (package_id) {
        const pkg = await Package.findOne({
          where: { package_id, builder_id: builderId },
          transaction: t,
        });

        if (!pkg) {
          throw { status: 400, message: "Invalid package_id. You can use only your own packages" };
        }

        if (pkg.status !== true) {
          throw { status: 400, message: "Inactive package." };
        }
        updates.package_id = package_id;
      }

      if (price_list_item_id) {
        const item = await PriceListItem.findOne({
          where: { price_list_item_id, builder_id: builderId },
          transaction: t,
        });

        if (!item) {
          throw {
            status: 400,
            message: "Invalid price_list_item_id. You can use only your own price list items",
          };
        }

        if (item.status !== "active") {
          throw { status: 400, message: "Inactive price list item." };
        }
        updates.price_list_item_id = price_list_item_id;
      }

      if (Object.keys(updates).length === 0) {
        throw { status: 400, message: "No fields to update" };
      }

      const finalPackageId = package_id || mapping.package_id;
      const finalItemId = price_list_item_id || mapping.price_list_item_id;

      if (package_id || price_list_item_id) {
        const duplicateCheck = await PackagePricelistItemMap.findOne({
          where: {
            package_id: finalPackageId,
            price_list_item_id: finalItemId,
            id: { [db.Sequelize.Op.ne]: id },
          },
          transaction: t,
        });

        if (duplicateCheck) {
          throw {
            status: 400,
            message: "This package is already mapped with this price list item.",
          };
        }
      }

      await mapping.update(updates, { transaction: t });

      await t.commit();

      // Return consistent with original: { package: keysToCamelCase(row) }
      return {
        success: true,
        data: {
          package: keysToCamelCase(mapping.get({ plain: true })),
        },
        message: "Package updated successfully",
      };
    } catch (error) {
      if (t) await t.rollback();
      throw error;
    }
  }
}

export default new PackagePriceListItemMapService();
