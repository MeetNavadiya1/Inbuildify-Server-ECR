import db from "../../config/database/models/postgre-models/index.js";

export async function getFunctionalitiesService() {
  const functionalities = await db.Functionality.findAll({
    attributes: [
      "functionality_id",
      ["name", "functionality_name"],
    ],
    include: [
      {
        model: db.Screen,
        as: "screen",
        attributes: [
          ["screen_id", "id"], 
          "name"
        ],
        required: true,
      }
    ],
    order: [["created_at", "DESC"]],
  });

  return functionalities;
}

export async function getFunctionalitiesByScreenService({ screen_id, builder_id, page = 1, limit = 25 }) {
  const limitValue = parseInt(limit, 10);
  const pageValue = parseInt(page, 10);
  const offset = (pageValue - 1) * limitValue;

  const { count, rows } = await db.Functionality.findAndCountAll({
    where: {
      screen_id,
      builder_id,
    },
    attributes: [
      "functionality_id",
      "name",
      "screen_id",
      "company_id",
      "builder_id",
      "created_at",
      "updated_at"
    ],
    order: [["name", "ASC"]],
    limit: limitValue,
    offset,
  });

  const totalPages = Math.ceil(count / limitValue);

  return {
    functionalities: rows,
    pagination: {
      currentPage: pageValue,
      totalPages,
      totalRecords: count,
      limit: limitValue,
    },
  };
}

export async function getFunctionalitiesByScreenWithoutPaginationService({ screenId }) {
  const screen = await db.Screen.findOne({
    where: { screen_id: screenId },
    attributes: ["screen_id"],
  });

  if (!screen) {
    const error = new Error("Screen not found");
    error.statusCode = 404;
    throw error;
  }

  const functionalities = await db.Functionality.findAll({
    where: { screen_id: screenId },
    attributes: ["functionality_id", "name"],
    order: [["created_at", "DESC"]],
  });

  return functionalities;
}
