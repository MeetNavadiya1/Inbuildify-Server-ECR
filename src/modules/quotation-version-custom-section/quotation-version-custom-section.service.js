import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import { Op } from "sequelize";

const {
  sequelize,
} = db;

// Helper from original controller
export const extractFileNameFromUrl = (url) => {
  if (!url) {
    return null;
  }
  try {
    const parts = url.split("/");
    const lastPart = parts[parts.length - 1];
    const nameParts = lastPart.split("-");
    if (nameParts.length > 2) {
      return nameParts.slice(2).join("-");
    }
    return lastPart;
  } catch (error) {
    return null;
  }
};

class QuotationVersionCustomSectionService {
  async verifyVersionOwnership(quotationVersionId, builderId, companyId) {
    const models = db.sequelize?.models || db;
    const { QuotationVersion, Quotation, Leads } = models;

    if (!QuotationVersion) {
      throw new Error("QuotationVersion model not found. Models may not be initialized.");
    }

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

  async getCustomSectionsByVersionId(quotationVersionId, builderId, companyId) {
    const models = db.sequelize?.models || db;
    const { QuotationVersionCustomSection } = models;

    const version = await this.verifyVersionOwnership(quotationVersionId, builderId, companyId);
    if (!version) {
      throw { status: 404, message: "Quotation version not found or does not belong to your organization" };
    }

    const sections = await QuotationVersionCustomSection.findAll({
      where: { quotation_version_id: quotationVersionId },
      order: [
        ["sort_order", "ASC"],
        ["createdAt", "ASC"],
      ],
    });

    return sections.map(s => {
      const item = keysToCamelCase(s.get({ plain: true }));
      item.fileName = extractFileNameFromUrl(item.fileUrl);
      return item;
    });
  }

  async createCustomSection(data, builderId, companyId) {
    const models = db.sequelize?.models || db;
    const { QuotationVersionCustomSection } = models;

    const { quotation_version_id, file_url, sort_order } = data;
    const version = await this.verifyVersionOwnership(quotation_version_id, builderId, companyId);

    if (!version) {
      throw { status: 404, message: "Quotation version not found or does not belong to your organization" };
    }
    if (version.is_approve) {
      throw { status: 400, message: "Cannot add custom sections to an approved quotation version" };
    }

    const t = await sequelize.transaction();
    try {
      const maxSortOrder = await QuotationVersionCustomSection.max("sort_order", {
        where: { quotation_version_id },
      }) || 0;

      let finalSortOrder = sort_order;
      if (finalSortOrder === undefined || finalSortOrder === null) {
        finalSortOrder = maxSortOrder + 1;
      } else {
        if (finalSortOrder < 1 || finalSortOrder > maxSortOrder + 1) {
          throw { status: 400, message: `Invalid sort_order. Allowed range is 1 to ${maxSortOrder + 1}.` };
        }
        await QuotationVersionCustomSection.update(
          { sort_order: db.sequelize.literal("sort_order + 1") },
          {
            where: {
              quotation_version_id,
              sort_order: { [Op.gte]: finalSortOrder },
            },
            transaction: t,
          },
        );
      }

      const newSection = await QuotationVersionCustomSection.create(
        { quotation_version_id, file_url, sort_order: finalSortOrder },
        { transaction: t },
      );

      await t.commit();
      const result = keysToCamelCase(newSection.get({ plain: true }));
      result.fileName = extractFileNameFromUrl(result.fileUrl);
      return result;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async updateCustomSection(id, data, builderId, companyId) {
    const models = db.sequelize?.models || db;
    const { QuotationVersionCustomSection, QuotationVersion, Quotation, Leads } = models;

    const { file_url, sort_order } = data;

    const section = await QuotationVersionCustomSection.findOne({
      where: { custom_section_id: id },
      include: [{
        model: QuotationVersion,
        as: "quotationVersion",
        include: [{
          model: Quotation,
          as: "quotation",
          include: [{
            model: Leads,
            as: "lead",
            where: {
              [Op.or]: [
                ...(builderId ? [{ builder_id: builderId }] : []),
                ...(companyId ? [{ company_id: companyId }] : []),
              ],
            },
          }],
        }],
      }],
    });

    if (!section) {
      throw { status: 404, message: "Custom section not found or does not belong to your organization" };
    }
    if (section.quotationVersion?.is_approve) {
      throw { status: 400, message: "Cannot modify custom sections of an approved quotation version" };
    }

    const t = await sequelize.transaction();
    try {
      if (sort_order !== undefined && sort_order !== null) {
        const existingSortOrder = section.sort_order;
        const maxSortOrder = await QuotationVersionCustomSection.max("sort_order", {
          where: { quotation_version_id: section.quotation_version_id },
        });

        if (sort_order < 1 || sort_order > maxSortOrder) {
          throw { status: 400, message: `Invalid sort_order. Allowed range is 1 to ${maxSortOrder}.` };
        }

        if (sort_order !== existingSortOrder) {
          if (sort_order > existingSortOrder) {
            await QuotationVersionCustomSection.update(
              { sort_order: db.sequelize.literal("sort_order - 1") },
              {
                where: {
                  quotation_version_id: section.quotation_version_id,
                  sort_order: { [Op.gt]: existingSortOrder, [Op.lte]: sort_order },
                  custom_section_id: { [Op.ne]: id },
                },
                transaction: t,
              },
            );
          } else {
            await QuotationVersionCustomSection.update(
              { sort_order: db.sequelize.literal("sort_order + 1") },
              {
                where: {
                  quotation_version_id: section.quotation_version_id,
                  sort_order: { [Op.gte]: sort_order, [Op.lt]: existingSortOrder },
                  custom_section_id: { [Op.ne]: id },
                },
                transaction: t,
              },
            );
          }
        }
      }

      if (file_url !== undefined && section.file_url && file_url !== section.file_url) {
        await deleteFromS3(section.file_url);
      }

      const updateData = {};
      if (file_url !== undefined) {
        updateData.file_url = file_url;
      }
      if (sort_order !== undefined) {
        updateData.sort_order = sort_order;
      }

      await section.update(updateData, { transaction: t });
      await t.commit();

      const result = keysToCamelCase(section.get({ plain: true }));
      result.fileName = extractFileNameFromUrl(result.fileUrl);
      return result;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async deleteCustomSection(id, builderId, companyId) {
    const models = db.sequelize?.models || db;
    const { QuotationVersionCustomSection, QuotationVersion, Quotation, Leads } = models;

    const section = await QuotationVersionCustomSection.findOne({
      where: { custom_section_id: id },
      include: [{
        model: QuotationVersion,
        as: "quotationVersion",
        include: [{
          model: Quotation,
          as: "quotation",
          include: [{
            model: Leads,
            as: "lead",
            where: {
              [Op.or]: [
                ...(builderId ? [{ builder_id: builderId }] : []),
                ...(companyId ? [{ company_id: companyId }] : []),
              ],
            },
          }],
        }],
      }],
    });

    if (!section) {
      throw { status: 404, message: "Custom section not found or does not belong to your organization" };
    }
    if (section.quotationVersion?.is_approve) {
      throw { status: 400, message: "Cannot delete custom sections from an approved quotation version" };
    }

    const t = await sequelize.transaction();
    try {
      if (section.file_url) {
        await deleteFromS3(section.file_url);
      }

      const sortOrder = section.sort_order;
      const quotationVersionId = section.quotation_version_id;

      await section.destroy({ transaction: t });

      await QuotationVersionCustomSection.update(
        { sort_order: db.sequelize.literal("sort_order - 1") },
        {
          where: {
            quotation_version_id: quotationVersionId,
            sort_order: { [Op.gt]: sortOrder },
          },
          transaction: t,
        },
      );

      await t.commit();
      return true;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }
}

export default new QuotationVersionCustomSectionService();
