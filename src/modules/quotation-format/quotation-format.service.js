import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";

function buildQuotationFormatPayload(body) {
  const {
    role_id,
    format_name,
    logo_alignment,
    logo_size_height,
    logo_size_width,
    logo_padding,
    hide_logo_first_page,
    label_logo_size_height,
    label_logo_size_width,
    show_account,
    show_excel,
    draft_background,
    hide_watermark,
    status,
    make_default,
    include_package_price_list,
    show_quotation_with_builder,
    show_quotation_with_builder_detailed,
    show_job_address,
    footer_column_count,
    custom_footer,
    bg_color,
    description,
    description2,
    description3,
    created_by,
    updated_by
  } = body;

  // Only include keys that are actually present in the request body
  const payload = {};

  if (role_id !== undefined) payload.role_id = role_id;
  if (format_name !== undefined) payload.format_name = format_name;
  if (logo_alignment !== undefined) payload.logo_alignment = logo_alignment;
  if (logo_size_height !== undefined) payload.logo_size_height = logo_size_height;
  if (logo_size_width !== undefined) payload.logo_size_width = logo_size_width;
  if (logo_padding !== undefined) payload.logo_padding = logo_padding;
  if (hide_logo_first_page !== undefined) payload.hide_logo_first_page = hide_logo_first_page;
  if (label_logo_size_height !== undefined) payload.label_logo_size_height = label_logo_size_height;
  if (label_logo_size_width !== undefined) payload.label_logo_size_width = label_logo_size_width;
  if (show_account !== undefined) payload.show_account = show_account;
  if (show_excel !== undefined) payload.show_excel = show_excel;

  if (hide_watermark !== undefined) payload.hide_watermark = hide_watermark;
  if (status !== undefined) payload.status = status;
  if (make_default !== undefined) payload.make_default = make_default;
  if (include_package_price_list !== undefined) payload.include_package_price_list = include_package_price_list;
  if (show_quotation_with_builder !== undefined) payload.show_quotation_with_builder = show_quotation_with_builder;
  if (show_quotation_with_builder_detailed !== undefined) payload.show_quotation_with_builder_detailed = show_quotation_with_builder_detailed;
  if (show_job_address !== undefined) payload.show_job_address = show_job_address;
  if (footer_column_count !== undefined) payload.footer_column_count = footer_column_count;
  if (bg_color !== undefined) payload.bg_color = bg_color;
  if (description !== undefined) payload.description = description;
  if (description2 !== undefined) payload.description2 = description2;
  if (description3 !== undefined) payload.description3 = description3;
  if (created_by !== undefined) payload.created_by = created_by;
  if (updated_by !== undefined) payload.updated_by = updated_by;

  // These two always default to false — only override if explicitly sent
  payload.draft_background = draft_background !== undefined ? draft_background : false;
  payload.custom_footer = custom_footer !== undefined ? custom_footer : false;

  if (payload.show_account === "company_account") {
    payload.show_quotation_with_builder_detailed = null;
  }

  return payload;
}
/**
 * Creates a new Quotation Format.
 */
export const createQuotationFormatService = async ({ builderId, companyId, userId, defaultFacade, watermark, draftBackgroundImage, body }) => {
  const { QuotationFormat, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const payload = buildQuotationFormatPayload(body);

    const isDraftBackground = payload.draft_background === true || payload.draft_background === 'true';

    if (!isDraftBackground) {
      if (draftBackgroundImage) {
        const error = new Error("Cannot upload draft background image when draft background is disabled.");
        error.status = 400;
        throw error;
      }
      if (payload.hide_watermark === true || payload.hide_watermark === 'true') {
        const error = new Error("Cannot enable hide watermark when draft background is disabled.");
        error.status = 400;
        throw error;
      }
      payload.draft_background_image = null;
      payload.hide_watermark = false;
    } else {
      payload.draft_background_image = draftBackgroundImage || null;
    }

    const isCustomFooter = payload.custom_footer === true || payload.custom_footer === 'true';

    if (!isCustomFooter) {
      payload.footer_column_count = null;
      payload.bg_color = null;
      payload.description = null;
      payload.description2 = null;
      payload.description3 = null;
    } else {
      // Logic for when custom footer is active
      const columnCount = parseInt(payload.footer_column_count, 10);
      if (columnCount === 1) {
        payload.description2 = null;
        payload.description3 = null;
      } else if (columnCount === 2) {
        payload.description3 = null;
      }
    }
    // else {

    // }
    const [duplicate, roleExists] = await Promise.all([
      payload.format_name ? QuotationFormat.findOne({
        where: {
          builder_id: builderId,
          is_sample_data: false,
          format_name: { [db.Sequelize.Op.iLike]: payload.format_name }
        },
        transaction,
      }) : Promise.resolve(null),
      payload.role_id ? db.Role.findByPk(payload.role_id, { transaction }) : Promise.resolve(null)
    ]);

    if (duplicate) {
      const error = new Error("Quotation format name already exists.");
      error.status = 409;
      throw error;
    }

    if (payload.role_id && !roleExists) {
      const error = new Error("RoleId is Invalid or role is not found");
      error.status = 404;
      throw error;
    }
    // }

    const created = await QuotationFormat.create(
      {

        builder_id: builderId,
        company_id: companyId,
        created_by: userId,
        updated_by: userId,
        role_id: payload.role_id,
        format_name: payload.format_name,
        logo_alignment: payload.logo_alignment,
        logo_size_height: payload.logo_size_height,
        logo_size_width: payload.logo_size_width,
        logo_padding: payload.logo_padding,
        hide_logo_first_page: payload.hide_logo_first_page,
        label_logo_size_height: payload.label_logo_size_height,
        label_logo_size_width: payload.label_logo_size_width,
        show_account: payload.show_account,
        show_excel: payload.show_excel,
        watermark,
        default_facade: defaultFacade,
        draft_background_image: payload.draft_background_image,
        draft_background: payload.draft_background,
        hide_watermark: payload.hide_watermark,
        status: payload.status,
        make_default: payload.make_default,
        include_package_price_list: payload.include_package_price_list,
        show_quotation_with_builder: payload.show_quotation_with_builder,
        show_quotation_with_builder_detailed: payload.show_quotation_with_builder_detailed,
        show_job_address: payload.show_job_address,
        footer_column_count: payload.footer_column_count,
        custom_footer: payload.custom_footer,
        bg_color: payload.bg_color,
        description: payload.description,
        description_2: payload.description2,
        description_3: payload.description3,

      },

      { transaction }
    );

    await transaction.commit();
    return keysToCamelCase(created.toJSON());
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};

/**
 * Updates an existing Quotation Format.
 */

export const updateQuotationFormatService = async ({ quotationFormatId, builderId, userId, defaultFacade, watermark, draftBackgroundImage, data }) => {
  const { QuotationFormat, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const quotationFormat = await QuotationFormat.findOne({
      where: {
        quotation_format_id: quotationFormatId,
        builder_id: builderId,
      },
      transaction,
    });
    if (!quotationFormat) {
      await transaction.rollback();
      const error = new Error("Quotation Format not found or access denied.");
      error.status = 404;
      throw error;
    }

    const draftBackgroundVal = data.draft_background !== undefined ? data.draft_background : quotationFormat.draft_background;
    const isDraftBackground = draftBackgroundVal === true || draftBackgroundVal === 'true';

    if (!isDraftBackground) {
      if (draftBackgroundImage) {
        await transaction.rollback();
        const error = new Error("Cannot upload draft background image when draft background is disabled.");
        error.status = 400;
        throw error;
      }
      if (data.hide_watermark === true || data.hide_watermark === 'true') {
        await transaction.rollback();
        const error = new Error("Cannot enable hide watermark when draft background is disabled.");
        error.status = 400;
        throw error;
      }
      data.draft_background_image = null;
      data.hide_watermark = false;

      if (quotationFormat.draft_background_image) {
        await deleteFromS3(quotationFormat.draft_background_image);
      }
    } else {
      if (draftBackgroundImage !== undefined) {
        if (!draftBackgroundImage) {
          data.draft_background_image = null;
        } else {
          if (
            quotationFormat.draft_background_image &&
            quotationFormat.draft_background_image !== draftBackgroundImage
          ) {
            await deleteFromS3(quotationFormat.draft_background_image);
          }
          data.draft_background_image = draftBackgroundImage;
        }
      }
    }

    const customFooterVal = data.custom_footer !== undefined ? data.custom_footer : quotationFormat.custom_footer;
    const isCustomFooter = customFooterVal === true || customFooterVal === 'true';

    if (!isCustomFooter) {
      data.footer_column_count = null;
      data.bg_color = null;
      data.description = null;
      data.description2 = null;
      data.description3 = null;
      data.description_2 = null;
      data.description_3 = null;
    } else {
      const columnCount = parseInt(data.footer_column_count || quotationFormat.footer_column_count, 10);
      if (columnCount === 1) {
        data.description2 = null;
        data.description3 = null;
        data.description_2 = null;
        data.description_3 = null;
      } else if (columnCount === 2) {
        data.description3 = null;
        data.description_3 = null;
      }
    }

    const showAccount = data.show_account !== undefined ? data.show_account : quotationFormat.show_account;
    if (showAccount === "company_account") {
      data.show_quotation_with_builder_detailed = null;
    }

    // Parallelize name duplicate check and role check
    const [duplicate, roleExists] = await Promise.all([
      data.format_name ? QuotationFormat.findOne({
        where: {
          builder_id: builderId,
          is_sample_data: false,
          format_name: { [db.Sequelize.Op.iLike]: data.format_name },
          quotation_format_id: { [db.Sequelize.Op.ne]: quotationFormatId },
        },
        transaction,
      }) : Promise.resolve(null),
      data.role_id ? db.Role.findByPk(data.role_id, { transaction }) : Promise.resolve(true)
    ]);

    if (duplicate) {
      const error = new Error("Quotation format name already exists.");
      error.status = 409;
      throw error;
    }

    if (data.role_id && !roleExists) {
      const error = new Error("RoleId is Invalid or role is not found");
      error.status = 404;
      throw error;
    }
    if (watermark !== undefined) {
      if (!watermark) {
        data.watermark = null;
      } else {
        if (quotationFormat.watermark && quotationFormat.watermark !== watermark) {
          await deleteFromS3(quotationFormat.watermark);
        }
        data.watermark = watermark;
      }
    }

    // ── Handle header URL ──────────────────────────────────────
    if (defaultFacade !== undefined) {
      if (!defaultFacade) {
        data.default_facade = null;
      } else {
        if (
          quotationFormat.default_facade &&
          quotationFormat.default_facade !== defaultFacade
        ) {
          await deleteFromS3(quotationFormat.default_facade);
        }
        data.default_facade = defaultFacade;
      }
    }

    await quotationFormat.update(
      {
        ...data,
        updated_by: userId,
      },
      { transaction }
    );

    await transaction.commit();
    return keysToCamelCase(quotationFormat.toJSON());
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};

/**
 * Fetches a single Quotation Format by ID.
 */
export const getQuotationFormatByIdService = async ({ quotationFormatId, builderId }) => {
  const { QuotationFormat, Company, Builder, Role, Users } = db;

  const quotationFormat = await QuotationFormat.findOne({
    where: {
      quotation_format_id: quotationFormatId,
      builder_id: builderId,
    },
    include: [
      { model: Company, as: "company", attributes: ["name"] },
      { model: Builder, as: "builderInfo", attributes: ["name"] },
      { model: Role, as: "role", attributes: ["name"] },
    ],
  });

  if (!quotationFormat) {
    const error = new Error("Quotation Format not found or access denied.");
    error.status = 404;
    throw error;
  }

  return keysToCamelCase(quotationFormat.toJSON());
};

/**
 * Fetches all Quotation Formats with filtering and pagination.
 */
export const getAllQuotationFormatsService = async ({ builderId, companyId, query }) => {
  const { QuotationFormat, Company, Builder, Sequelize } = db;
  const { Op } = Sequelize;

  const { page = 1, limit = 10, format_name, status } = query;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 10;
  const offset = (pageNum - 1) * limitNum;

  const where = {
    builder_id: builderId,
    company_id: companyId,
  };

  if (format_name) {
    where.format_name = { [Op.iLike]: `%${format_name}%` };
  }

  if (status !== undefined) {
    where.status = status === "true" || status === true;
  }

  const { count: totalRecords, rows: formats } = await QuotationFormat.findAndCountAll({
    where,
    include: [
      { model: Company, as: "company", attributes: ["name"] },
      { model: Builder, as: "builderInfo", attributes: ["name"] },
    ],
    limit: limitNum,
    offset,
    order: [["created_at", "DESC"]],
  });

  return {
    quotationFormats: keysToCamelCase(formats.map((f) => f.toJSON())),
    records: totalRecords,
    currentPage: pageNum,
    limit: limitNum,
    totalPage: Math.ceil(totalRecords / limitNum),
  };
};

// delete------------------------------------------
export const deleteQuotationFormatsService = async (quotation_format_id) => {
  const { QuotationFormat, sequelize } = db;
  const transaction = await sequelize.transaction();
  const format = await QuotationFormat.findByPk(
    quotation_format_id.quotation_format_id,
    { transaction }
  );

  if (!format) {

    const error = new Error(
      "QuatationFormatId Is not Found"
    );
    error.status = 404;

    throw error;
  }

  await format.destroy({ transaction });

  await transaction.commit();

  return { success: true };

}

export const copyQuotationFormatService = async ({ quotationFormatId, builderId, companyId, userId, body }) => {
  const { QuotationFormat, QuotationFormatCustomSection, MasterSection, MasterSectionHeader, MasterSectionItem, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {

    // Find the source QuotationFormat
    const sourceFormat = await QuotationFormat.findOne({
      where: {
        quotation_format_id: quotationFormatId,
        builder_id: builderId,
      },
      transaction,
    });

    if (!sourceFormat) {
      throw {
        status: 404,
        message: "Quotation Format not found or access denied.",
      };
    }

    // Determine target name (default: "Name - Copy")
    const targetName = `${sourceFormat.format_name} - Copy`;

    // Check for duplicate in the same builder scope
    const duplicate = await QuotationFormat.findOne({
      where: {
        builder_id: builderId,
        is_sample_data: false,
        format_name: { [db.Sequelize.Op.iLike]: targetName }
      },
      transaction,
    });

    if (duplicate) {
      throw {
        status: 409,
        message: "Quotation format name already exists.",
      };
    }

    // Create the new QuotationFormat clone
    const clonedFormat = await QuotationFormat.create(
      {
        builder_id: builderId,
        company_id: companyId,
        created_by: userId,
        updated_by: userId,
        role_id: sourceFormat.role_id,
        format_name: targetName,
        logo_alignment: sourceFormat.logo_alignment,
        logo_size_height: sourceFormat.logo_size_height,
        logo_size_width: sourceFormat.logo_size_width,
        logo_padding: sourceFormat.logo_padding,
        hide_logo_first_page: sourceFormat.hide_logo_first_page,
        label_logo_size_height: sourceFormat.label_logo_size_height,
        label_logo_size_width: sourceFormat.label_logo_size_width,
        show_account: sourceFormat.show_account,
        show_excel: sourceFormat.show_excel,
        watermark: sourceFormat.watermark,
        default_facade: sourceFormat.default_facade,
        draft_background_image: sourceFormat.draft_background_image,
        draft_background: sourceFormat.draft_background,
        hide_watermark: sourceFormat.hide_watermark,
        status: sourceFormat.status,
        make_default: false, // Default copies to non-default to prevent multiple default formats
        include_package_price_list: sourceFormat.include_package_price_list,
        show_quotation_with_builder: sourceFormat.show_quotation_with_builder,
        show_quotation_with_builder_detailed: sourceFormat.show_quotation_with_builder_detailed,
        show_job_address: sourceFormat.show_job_address,
        footer_column_count: sourceFormat.footer_column_count,
        custom_footer: sourceFormat.custom_footer,
        bg_color: sourceFormat.bg_color,
        description: sourceFormat.description,
        description_2: sourceFormat.description_2,
        description_3: sourceFormat.description_3,
      },
      { transaction }
    );

    // Fetch and duplicate all Custom Sections
    const customSections = await QuotationFormatCustomSection.findAll({
      where: { quotation_format_id: quotationFormatId },
      transaction,
    });

    for (const cs of customSections) {
      await QuotationFormatCustomSection.create(
        {
          company_id: companyId,
          builder_id: builderId,
          quotation_format_id: clonedFormat.quotation_format_id,
          field_name: cs.field_name,
          field_label: cs.field_label,
          is_applicable: cs.is_applicable,
          group_field: cs.group_field,
          sort_order: cs.sort_order,
          parent_field: cs.parent_field,
          created_by: userId,
          updated_by: userId,
        },
        { transaction }
      );
    }

    // Fetch and duplicate all Master Sections (along with headers and items)
    const masterSections = await MasterSection.findAll({
      where: { quotation_format_id: quotationFormatId },
      transaction,
    });

    for (const ms of masterSections) {
      const clonedMasterSection = await MasterSection.create(
        {
          company_id: companyId,
          builder_id: builderId,
          quotation_format_id: clonedFormat.quotation_format_id,
          master_name: ms.master_name,
          status: ms.status,
          created_by: userId,
          updated_by: userId,
        },
        { transaction }
      );

      // Fetch headers of this master section
      const headers = await MasterSectionHeader.findAll({
        where: { master_section_id: ms.master_section_id },
        transaction,
      });

      for (const header of headers) {
        const clonedHeader = await MasterSectionHeader.create(
          {
            master_section_id: clonedMasterSection.master_section_id,
            heading_name: header.heading_name,
            effective_start_date: header.effective_start_date,
            effective_end_date: header.effective_end_date,
            sort_order: header.sort_order,
            status: header.status,
          },
          { transaction }
        );

        // Fetch items of this header
        const items = await MasterSectionItem.findAll({
          where: { master_section_header_id: header.master_section_header_id },
          transaction,
        });

        if (items.length > 0) {
          const itemsToCreate = items.map((item) => ({
            master_section_header_id: clonedHeader.master_section_header_id,
            item_name: item.item_name,
            effective_start_date: item.effective_start_date,
            effective_end_date: item.effective_end_date,
            sort_order: item.sort_order,
            status: item.status,
          }));

          await MasterSectionItem.bulkCreate(itemsToCreate, { transaction });
        }
      }
    }

    await transaction.commit();
    return keysToCamelCase(clonedFormat.toJSON());
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};

export default {
  createQuotationFormatService,
  updateQuotationFormatService,
  getQuotationFormatByIdService,
  getAllQuotationFormatsService,
  deleteQuotationFormatsService,
  copyQuotationFormatService,
};