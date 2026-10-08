import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";

const { CustomFieldValue, CustomField, Leads } = db;

export const createCustomFieldValueService = async (payload, { builderId, companyId }) => {
  const t = await db.sequelize.transaction();
  try {
    const {
      custom_field_id,
      record_id,
      value_text,
      value_number,
      value_date,
      value_boolean,
      value_list,
    } = payload;

    // 1. Field validation
    const field = await CustomField.findOne({
      where: {
        custom_field_id,
        builder_id: builderId,
        company_id: companyId,
      },
      transaction: t,
    });

    if (!field) {
      const error = new Error("Custom field does not exist or does not belong to this builder.");
      error.status = 404;
      throw error;
    }

    if (!field.is_active) {
      const error = new Error("custom field id is inactive.");
      error.status = 400;
      throw error;
    }

    // 2. Lead validation
    const lead = await Leads.findOne({
      where: {
        lead_id: record_id,
        builder_id: builderId,
        is_deleted: false,
      },
      transaction: t,
    });

    if (!lead) {
      const error = new Error("Lead not found with this record_id.");
      error.status = 404;
      throw error;
    }

    // 3. Duplicate check
    const existingValue = await CustomFieldValue.findOne({
      where: {
        record_id,
        custom_field_id,
        builder_id: builderId,
      },
      transaction: t,
    });

    if (existingValue) {
      const error = new Error("Custom field value already exists for this record.");
      error.status = 400;
      throw error;
    }

    // 4. Date validation
    if (value_date) {
      const date = new Date(value_date);
      if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value_date) {
        const error = new Error(`Invalid date: ${value_date}`);
        error.status = 400;
        throw error;
      }
    }

    const result = await CustomFieldValue.create(
      {
        custom_field_id,
        company_id: companyId,
        builder_id: builderId,
        record_id,
        value_text: value_text || null,
        value_number: value_number || null,
        value_date: value_date || null,
        value_boolean: value_boolean ?? null,
        value_list: value_list || null,
      },
      { transaction: t },
    );

    await t.commit();
    return keysToCamelCase(result.get({ plain: true }));
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

export const getAllCustomFieldValuesService = async ({ page = 1, limit = 25 }, { builderId }) => {
  const limitValue = parseInt(limit, 10);
  const pageValue = parseInt(page, 10);
  const offset = (pageValue - 1) * limitValue;

  const { count, rows } = await CustomFieldValue.findAndCountAll({
    where: { builder_id: builderId },
    order: [["created_at", "DESC"]],
    limit: limitValue,
    offset: offset,
    include: [
      {
        model: CustomField,
        as: "customField",
        attributes: ["field_name", "field_type", "sort_order"],
      },
    ],
  });

  const totalPages = Math.ceil(count / limitValue);

  return {
    customFieldValues: keysToCamelCase(rows.map((r) => r.get({ plain: true }))),
    pagination: {
      currentPage: pageValue,
      totalPages,
      totalRecords: count,
      limit: limitValue,
    },
  };
};

export const deleteCustomFieldValueService = async (id, { builderId }) => {
  const t = await db.sequelize.transaction();
  try {
    const record = await CustomFieldValue.findOne({
      where: {
        custom_field_value_id: id,
        builder_id: builderId,
      },
      transaction: t,
    });

    if (!record) {
      const error = new Error("Custom field value not found or does not belong to this builder.");
      error.status = 404;
      throw error;
    }

    await CustomFieldValue.destroy({
      where: {
        custom_field_value_id: id,
        builder_id: builderId,
      },
      transaction: t,
    });

    await t.commit();
    return true;
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

export const updateCustomFieldValueService = async (id, payload, { builderId, companyId }) => {
  const t = await db.sequelize.transaction();
  try {
    const {
      record_id,
      custom_field_id,
      value_text,
      value_number,
      value_date,
      value_boolean,
      value_list,
    } = payload;

    if (!companyId) {
      const error = new Error("Company ID not found.");
      error.status = 400;
      throw error;
    }

    const existingRecord = await CustomFieldValue.findOne({
      where: {
        custom_field_value_id: id,
        builder_id: builderId,
      },
      transaction: t,
    });

    if (!existingRecord) {
      const error = new Error("Custom field value not found or does not belong to this builder.");
      error.status = 404;
      throw error;
    }

    // Association validations
    if (custom_field_id !== undefined) {
      const field = await CustomField.findOne({
        where: {
          custom_field_id,
          builder_id: builderId,
          company_id: companyId,
        },
        transaction: t,
      });

      if (!field) {
        const error = new Error("Custom field does not exist or does not belong to this builder.");
        error.status = 404;
        throw error;
      }

      if (!field.is_active) {
        const error = new Error("custom field id is inactive.");
        error.status = 400;
        throw error;
      }
    }

    if (record_id !== undefined) {
      const lead = await Leads.findOne({
        where: {
          lead_id: record_id,
          builder_id: builderId,
          is_deleted: false,
        },
        transaction: t,
      });

      if (!lead) {
        const error = new Error("Lead not found with this record_id.");
        error.status = 404;
        throw error;
      }
    }

    // Duplicate check
    if (record_id !== undefined || custom_field_id !== undefined) {
      const nextRecordId = record_id ?? existingRecord.record_id;
      const nextFieldId = custom_field_id ?? existingRecord.custom_field_id;

      const duplicate = await CustomFieldValue.findOne({
        where: {
          record_id: nextRecordId,
          custom_field_id: nextFieldId,
          builder_id: builderId,
          custom_field_value_id: { [Op.ne]: id },
        },
        transaction: t,
      });

      if (duplicate) {
        const error = new Error("This custom_field_id already contains value for this record_id.");
        error.status = 400;
        throw error;
      }
    }

    // Date validation
    if (value_date) {
      const date = new Date(value_date);
      if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value_date) {
        const error = new Error(`Invalid date: ${value_date}`);
        error.status = 400;
        throw error;
      }
    }

    const updateData = {};
    if (record_id !== undefined) updateData.record_id = record_id;
    if (custom_field_id !== undefined) updateData.custom_field_id = custom_field_id;
    if (value_text !== undefined) updateData.value_text = value_text;
    if (value_number !== undefined) updateData.value_number = value_number;
    if (value_date !== undefined) updateData.value_date = value_date;
    if (value_boolean !== undefined) updateData.value_boolean = value_boolean;
    if (value_list !== undefined) updateData.value_list = value_list;
    updateData.company_id = companyId;

    await CustomFieldValue.update(updateData, {
      where: { custom_field_value_id: id },
      transaction: t,
    });

    const updatedRecord = await CustomFieldValue.findByPk(id, { transaction: t });
    await t.commit();
    return keysToCamelCase(updatedRecord.get({ plain: true }));
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

export default {
  createCustomFieldValueService,
  getAllCustomFieldValuesService,
  deleteCustomFieldValueService,
  updateCustomFieldValueService,
};
