import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Fetches estates with dynamic filtering, associations, and pagination.
 */
export const getAllEstatesService = async ({ builderId, companyId, query }) => {
  const { Estate, State, Country, Sequelize } = db;
  const { Op } = Sequelize;

  const {
    page = 1,
    limit = 25,
    name,
    status,
    location,
    zip_code,
  } = query;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 25;
  const offset = (pageNum - 1) * limitNum;

  // Build Where Clause
  const where = {
    builder_id: builderId,
    company_id: companyId,
  };

  if (name) {
    where.name = { [Op.iLike]: `%${name}%` };
  }

  if (status !== undefined) {
    // Joi coerces the query param to a real boolean, but also accept the
    // string form so the filter works regardless of how it arrives.
    where.status = status === true || status === "true";
  }

  if (zip_code) {
    where.zip = { [Op.iLike]: `%${zip_code}%` };
  }

  // Build Include for location search and data enrichment
  const include = [
    {
      model: State,
      as: "state",
      attributes: ["name"],
    },
    {
      model: Country,
      as: "country",
      attributes: ["name"],
    },
  ];

  if (location) {
    where[Op.or] = [
      { "$state.name$": { [Op.iLike]: `%${location}%` } },
      { "$country.name$": { [Op.iLike]: `%${location}%` } },
    ];
  }

  const { count: totalRecords, rows: estates } = await Estate.findAndCountAll({
    where,
    include,
    limit: limitNum,
    offset,
    order: [["createdAt", "DESC"]],
  });

  // Map results to include state_name and country_name for legacy compatibility
  const formattedEstates = estates.map((e) => {
    const estateJson = e.toJSON();
    return {
      ...estateJson,
      state_name: estateJson.state?.name || null,
      country_name: estateJson.country?.name || null,
    };
  });

  return {
    estate: keysToCamelCase(formattedEstates),
    records: totalRecords,
    currentPage: pageNum,
    limit: limitNum,
    totalPage: Math.ceil(totalRecords / limitNum),
  };
};

/**
 * Creates a new estate with duplicate check and foreign key validation.
 */
export const createEstateService = async ({ builderId, companyId, userId, data }) => {
  const { Estate, State, Country, sequelize } = db;

  const {
    name,
    street_name,
    city,
    state_id,
    country_id,
    zip,
    website,
    description,
    status,
    featured,
    estate_logo,
  } = data;

  const transaction = await sequelize.transaction();
  try {
    // 1. Duplicate Check
    const duplicate = await Estate.findOne({
      where: {
        builder_id: builderId,
        is_sample_data: false,
        name: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("name")),
          sequelize.fn("LOWER", name),
        ),
      },
      transaction,
    });

    if (duplicate) {
      const error = new Error("Estate name already exists.");
      error.status = 409;
      throw error;
    }

    // 2. Foreign Key Validation
    if (state_id) {
      const state = await State.findByPk(state_id, { transaction });
      if (!state) {
        const error = new Error("Invalid state_id.");
        error.status = 400;
        throw error;
      }
    }

    if (country_id) {
      const country = await Country.findByPk(country_id, { transaction });
      if (!country) {
        const error = new Error("Invalid country_id.");
        error.status = 400;
        throw error;
      }
    }

    // 3. Creation
    const created = await Estate.create(
      {
        company_id: companyId,
        builder_id: builderId,
        name,
        street_name: street_name || null,
        city: city || null,
        state_id: state_id || null,
        country_id: country_id || null,
        zip: zip || null,
        estate_logo,
        website: website || null,
        description: description || null,
        status: status !== undefined ? status : true,
        featured: featured || false,
        created_by: userId,
        updated_by: userId,
      },
      { transaction },
    );

    await transaction.commit();
    return keysToCamelCase(created.toJSON());
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
};

/**
 * DELETES AN ESTATE
 */
export const deleteEstateService = async ({ estate_id, builderId, companyId }) => {
  const { Estate, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const estate = await Estate.findOne({
      where: {
        estate_id,
        builder_id: builderId,
        company_id: companyId,
      },
      transaction,
    });

    if (!estate) {
      const error = new Error("Estate not found or does not belong to this builder.");
      error.status = 404;
      throw error;
    }

    await estate.destroy({ transaction });

    await transaction.commit();
    return true;
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};

/**
 * UPDATES AN ESTATE WITH COMPLEX STATUS LOGIC
 */
export const updateEstateService = async ({ estate_id, builderId, userId, payload, deleteFromS3 }) => {
  const { Estate, State, Country, sequelize } = db;
  const transaction = await sequelize.transaction();

  try {
    const estate = await Estate.findOne({
      where: { estate_id, builder_id: builderId },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!estate) {
      const error = new Error("Estate not found.");
      error.status = 404;
      throw error;
    }

    const {
      name,
      state_id,
      country_id,
      status,
      estate_logo,
    } = payload;

    // Status logic validation
    const statusInBody = Object.prototype.hasOwnProperty.call(payload, "status");
    let requestedStatus = status;

    if (statusInBody) {
      if (requestedStatus === "true") requestedStatus = true;
      if (requestedStatus === "false") requestedStatus = false;

      if (typeof requestedStatus !== "boolean") {
        const error = new Error("The 'status' field must be a boolean (true or false).");
        error.status = 400;
        throw error;
      }
    }

    const fieldsToCheck = [
      "name", "street_name", "city", "state_id", "country_id",
      "zip", "website", "description", "featured", "estate_logo",
    ];

    const updatingOtherFields = fieldsToCheck.some((f) =>
      Object.prototype.hasOwnProperty.call(payload, f),
    );

    const currentStatus = estate.status;

    // Transition: Active -> Inactive
    if (currentStatus === true && statusInBody && requestedStatus === false) {
      if (updatingOtherFields) {
        const error = new Error("To deactivate an active estate, only 'status' must be provided.");
        error.status = 403;
        throw error;
      }
    }

    // Transitions from Inactive
    if (currentStatus === false) {
      const performingActivation = statusInBody && requestedStatus === true;

      if (updatingOtherFields && !performingActivation) {
        const error = new Error("Cannot update non-'status' fields while estate is Inactive. Only 'status' may be set to true.");
        error.status = 403;
        throw error;
      }

      if (statusInBody && requestedStatus === false) {
        const error = new Error("Estate is already Inactive. You can only activate it.");
        error.status = 403;
        throw error;
      }
    }

    // Duplicate Name Check
    if (name) {
      const duplicate = await Estate.findOne({
        where: {
          builder_id: builderId,
          estate_id: { [db.Sequelize.Op.ne]: estate_id },
          is_sample_data: false,
          name: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("name")),
            sequelize.fn("LOWER", name),
          ),
        },
        transaction,
      });

      if (duplicate) {
        const error = new Error("Estate name already exists.");
        error.status = 409;
        throw error;
      }
    }

    // Foreign Key Validations
    if (state_id) {
      const state = await State.findByPk(state_id, { transaction });
      if (!state) {
        const error = new Error("Invalid state_id.");
        error.status = 400;
        throw error;
      }
    }

    if (country_id) {
      const country = await Country.findByPk(country_id, { transaction });
      if (!country) {
        const error = new Error("Invalid country_id.");
        error.status = 400;
        throw error;
      }
    }

    // S3 Logo Cleanup
    if (Object.prototype.hasOwnProperty.call(payload, "estate_logo") && estate_logo && estate.estate_logo) {
      if (deleteFromS3) {
        await deleteFromS3(estate.estate_logo);
      }
    }

    // Perform Update
    const updateData = { ...payload };
    if (statusInBody) updateData.status = requestedStatus;
    updateData.updated_by = userId;

    await estate.update(updateData, { transaction });

    await transaction.commit();
    return keysToCamelCase(estate.get({ plain: true }));
  } catch (error) {
    if (transaction) await transaction.rollback();
    throw error;
  }
};

export default {
  getAllEstatesService,
  createEstateService,
  deleteEstateService,
  updateEstateService,
};
