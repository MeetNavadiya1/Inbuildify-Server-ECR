import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js"
import { Op } from "sequelize";

export async function getAllSurveyorService({ builderId, page, limit }) {
  const offset = (page - 1) * limit;

  const { rows: surveyors, count: totalRecords } = await db.Surveyor.findAndCountAll({
    where: { builder_id: builderId },
    order: [["created_at", "DESC"]],
    limit,
    offset,
  });

  const totalPages = Math.ceil(totalRecords / limit);

  return {
    surveyors: keysToCamelCase(surveyors.map((s) => s.toJSON())),
    pagination: {
      currentPage: page,
      totalPages,
      totalRecords,
      limit,
    },
  };
}

export async function updateSurveyorService({ surveyorId, builderId, companyId, payload }) {
  const {
    name,
    email,
    phone,
    abn_number,
    registration_number,
    address1,
    address2,
    city,
    state_id,
    country_id,
    zip_postal_code,
  } = payload;

  // ── At least one field required ─────────────────────────────────────────────
  if (
    !name &&
    !email &&
    !phone &&
    !abn_number &&
    !registration_number &&
    !address1 &&
    !address2 &&
    !city &&
    !state_id &&
    !country_id &&
    !zip_postal_code
  ) {
    const error = new Error("At least one field must be provided to update.");
    error.status = 400;
    throw error;
  }

  // ── Check surveyor exists for this builder ──────────────────────────────────
  const existingSurveyor = await db.Surveyor.findOne({
    where: { surveyor_id: surveyorId, builder_id: builderId },
    attributes: ["surveyor_id"],
  });

  if (!existingSurveyor) {
    const error = new Error("Surveyor not found for this builder.");
    error.status = 404;
    throw error;
  }

  // ── Duplicate email check ───────────────────────────────────────────────────
  if (email) {
    const duplicateEmail = await db.Surveyor.findOne({
      where: {
        email: db.sequelize.where(
          db.sequelize.fn("LOWER", db.sequelize.col("email")),
          email.toLowerCase(),
        ),
        builder_id: builderId,
        surveyor_id: { [Op.ne]: surveyorId },
      },
      attributes: ["surveyor_id"],
    });

    if (duplicateEmail) {
      const error = new Error("Email already exists for another surveyor.");
      error.status = 400;
      throw error;
    }
  }

  // ── Validate state_id ───────────────────────────────────────────────────────
  if (state_id) {
    const validState = await db.State.findOne({
      where: { state_id },
      attributes: ["state_id"],
    });

    if (!validState) {
      const error = new Error("Invalid state id.");
      error.status = 400;
      throw error;
    }
  }

  // ── Build update payload (only provided fields) ─────────────────────────────
  const updatePayload = {};

  if (name) {
    updatePayload.name = name;
  }
  if (email) {
    updatePayload.email = email;
  }
  if (phone) {
    updatePayload.phone = phone;
  }
  if (abn_number) {
    updatePayload.abn_number = abn_number;
  }
  if (registration_number) {
    updatePayload.registration_number = registration_number;
  }
  if (address1) {
    updatePayload.address1 = address1;
  }
  if (address2) {
    updatePayload.address2 = address2;
  }
  if (city) {
    updatePayload.city = city;
  }
  if (state_id) {
    updatePayload.state_id = state_id;
  }
  if (country_id) {
    updatePayload.country_id = country_id;
  }
  if (zip_postal_code) {
    updatePayload.zip_postal_code = zip_postal_code;
  }

  updatePayload.company_id = companyId;

  const [, [updatedSurveyor]] = await db.Surveyor.update(updatePayload, {
    where: { surveyor_id: surveyorId, builder_id: builderId },
    returning: true,
  });

  return keysToCamelCase(updatedSurveyor.toJSON());
}

export async function createSurveyorService({ builderId, companyId, payload }) {
  const {
    name,
    email,
    phone,
    abn_number,
    registration_number,
    address1,
    address2,
    city,
    state_id,
    country_id,
    zip_postal_code,
  } = payload;

  // ── Required fields check ───────────────────────────────────────────────────
  if (!name || !address1 || !city || !zip_postal_code) {
    const error = new Error("Name, address1, city, and zip/postal code are required.");
    error.status = 400;
    throw error;
  }

  // ── Duplicate email check ───────────────────────────────────────────────────
  if (email) {
    const duplicate = await db.Surveyor.findOne({
      where: {
        builder_id: builderId,
        email: db.sequelize.where(
          db.sequelize.fn("LOWER", db.sequelize.col("email")),
          email.toLowerCase(),
        ),
      },
      attributes: ["surveyor_id"],
    });

    if (duplicate) {
      const error = new Error("Surveyor with this email already exists.");
      error.status = 400;
      throw error;
    }
  }

  // ── Validate state_id ───────────────────────────────────────────────────────
  if (state_id) {
    const validState = await db.State.findOne({
      where: { state_id },
      attributes: ["state_id"],
    });

    if (!validState) {
      const error = new Error("Invalid state id.");
      error.status = 400;
      throw error;
    }
  }

  // ── Insert surveyor ─────────────────────────────────────────────────────────
  const newSurveyor = await db.Surveyor.create({
    company_id: companyId,
    builder_id: builderId,
    name,
    email: email || null,
    phone: phone || null,
    abn_number: abn_number || null,
    registration_number: registration_number || null,
    address1,
    address2: address2 || null,
    city,
    state_id: state_id || null,
    country_id: country_id || null,
    zip_postal_code,
  });

  return keysToCamelCase(newSurveyor.toJSON());
}

export async function deleteSurveyorService({ surveyorId, builderId }) {
  // ── Check surveyor exists for this builder ──────────────────────────────────
  const existing = await db.Surveyor.findOne({
    where: { surveyor_id: surveyorId, builder_id: builderId },
    attributes: ["surveyor_id"],
  });

  if (!existing) {
    const error = new Error("Surveyor not found for this builder.");
    error.status = 404;
    throw error;
  }

  // ── Delete surveyor ─────────────────────────────────────────────────────────
  await db.Surveyor.destroy({
    where: { surveyor_id: surveyorId },
  });
}
