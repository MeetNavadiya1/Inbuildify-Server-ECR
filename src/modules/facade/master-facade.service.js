import { randomUUID } from "node:crypto";
import { Op, literal } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { DRIVE_FILE_MAPPING } from "../../constants/driveFile.js";
import {
  s3UrlForKey,
  createImageDriveFile,
  removeImageByRef,
  getRawImageColumns,
} from "../../helper/imageDriveFile.helper.js";

/**
 * Transforms a facade instance/object to include both old (id) and new (modelId) keys
 * in nested associations to maintain backward compatibility.
 */
function transformFacade(facade) {
  if (!facade) {
    return null;
  }
  const plain = typeof facade.toJSON === "function" ? facade.toJSON() : facade;

  if (plain.location) {
    plain.location.id = plain.location.location_id || plain.location.locationId;
  }
  if (plain.dwellingType) {
    plain.dwellingType.id = plain.dwellingType.dwelling_type_id || plain.dwellingType.dwellingTypeId;
    // Maintain lowercase alias if needed
    plain.dwellingtype = plain.dwellingType;
  }
  if (plain.range) {
    plain.range.id = plain.range.range_id || plain.range.rangeId;
  }

  return plain;
}

/**
 * Fetch all Master Facades with filtering and pagination
 */
export async function getMasterFacadesService(query, builderId, companyId) {
  const {
    name,
    dwelling_type_id,
    range_id,
    cost_type,
    location_id,
    status,
    search,
    page = 1,
    limit = 25,
    floor_plan_id,
  } = query;

  const limitValue = parseInt(limit, 10);
  const offset = (parseInt(page, 10) - 1) * limitValue;

  const where = {
    builder_id: builderId,
    [Op.and]: [],
  };

  if (companyId) {
    where[Op.and].push({
      [Op.or]: [{ company_id: companyId }, { company_id: null }],
    });
  }

  if (name) {
    where.name = { [Op.iLike]: `%${name}%` };
  }

  if (search) {
    const s = `%${search.trim().toLowerCase()}%`;
    where[Op.and].push({
      [Op.or]: [
        { name: { [Op.iLike]: s } },
        literal(`CAST("Facade"."cost" AS TEXT) ILIKE '${s}'`),
      ],
    });
  }

  if (location_id) {
    where.location_id = location_id;
  }

  if (dwelling_type_id) {
    where.dwelling_type_id = dwelling_type_id;
  }
  if (range_id) {
    where.range_id = range_id;
  }

  if (cost_type) {
    where.cost_type = cost_type;
  }
  if (status !== undefined) {
    where.status = status === "true" || status === true;
  }

  // Remove Op.and if empty to keep the query clean
  if (where[Op.and].length === 0) {
    delete where[Op.and];
  }

  let mappedFacadeIds = [];
  if (floor_plan_id) {
    const mappings = await db.FloorPlanFacadeMap.findAll({
      where: { floor_plan_id },
      attributes: ["facade_id"],
    });
    mappedFacadeIds = mappings.map((m) => m.facade_id);
    
    if (mappedFacadeIds.length > 0) {
      const testWhere = { ...where };
      testWhere.facade_id = { [Op.in]: mappedFacadeIds };
      
      const matchingMappedCount = await db.Facade.count({ where: testWhere });
      
      if (matchingMappedCount > 0) {
        where.facade_id = { [Op.in]: mappedFacadeIds };
      }
    }
  }

  const result = await db.Facade.findAndCountAll({
    where,
    include: [
      { model: db.Location, as: "location", attributes: ["location_id", "name"] },
      { model: db.DwellingType, as: "dwellingType", attributes: ["dwelling_type_id", "name"] },
      { model: db.Range, as: "range", attributes: ["range_id", "name"] },
    ],
    order: [["createdAt", "DESC"]],
    limit: limitValue,
    offset,
    distinct: true,
  });

  return {
    facades: result.rows.map(f => {
      const plain = transformFacade(f);
      if (floor_plan_id) {
        plain.is_mapped = mappedFacadeIds.includes(plain.facade_id);
      }
      return plain;
    }),
    pagination: {
      currentPage: parseInt(page, 10),
      totalPages: Math.ceil(result.count / limitValue),
      totalRecords: result.count,
      limit: limitValue,
    },
  };
}

/**
 * Fetch a single Master Facade by ID
 */
export async function getMasterFacadeByIdService(id, builderId) {
  const facade = await db.Facade.findOne({
    where: { facade_id: id, builder_id: builderId },
    include: [
      { model: db.Location, as: "location", attributes: ["location_id", "name"] },
      { model: db.DwellingType, as: "dwellingType", attributes: ["dwelling_type_id", "name"] },
      { model: db.Range, as: "range", attributes: ["range_id", "name"] },
    ],
  });

  if (!facade) {
    const error = new Error("Facade not found.");
    error.statusCode = 404;
    throw error;
  }

  return transformFacade(facade);
}

/**
 * Create a new Master Facade
 */
export async function createMasterFacadeService(payload, user, file) {
  const builderId = user?.builder_id;
  const companyId = user?.company_id;
  const userId = user?.user_id;

  const {
    name,
    location_id,
    dwelling_type_id,
    range_id,
    cost_type = "standard",
    cost,
    builder_cost,
    status = true,
  } = payload || {};

  if (!["standard", "upgrade"].includes(cost_type)) {
    const error = new Error("Invalid cost_type.");
    error.statusCode = 400;
    throw error;
  }

  const trimmedName = name.trim();
  const escapedName = trimmedName.replace(/'/g, "''");

  const [location, range, dwelling, uniqueFacade] = await Promise.all([
    location_id
      ? db.Location.findOne({
        where: { location_id, builder_id: builderId },
        attributes: ["location_id", "name", "status"],
      })
      : Promise.resolve(null),
    range_id
      ? db.Range.findOne({
        where: { range_id, builder_id: builderId, is_active: true },
        attributes: ["range_id", "name"],
      })
      : Promise.resolve(null),
    dwelling_type_id
      ? db.DwellingType.findOne({
        where: { dwelling_type_id, builder_id: builderId, is_active: true },
        attributes: ["dwelling_type_id", "name"],
      })
      : Promise.resolve(null),
    db.Facade.findOne({
      where: {
        location_id: location_id || null,
        is_sample_data: false,
        [Op.and]: literal(`LOWER(name) = LOWER('${escapedName}')`),
      },
      attributes: ["facade_id"],
    }),
  ]);

  if (location_id) {
    if (!location) {
      const error = new Error("Invalid location id does not belong to this builder.");
      error.statusCode = 400;
      throw error;
    }
    if (!location.status) {
      const error = new Error("Inactive location.");
      error.statusCode = 400;
      throw error;
    }
  }
  if (range_id && !range) {
    const error = new Error("Invalid or inactive range.");
    error.statusCode = 404;
    throw error;
  }
  if (dwelling_type_id && !dwelling) {
    const error = new Error("Invalid or inactive dwelling type.");
    error.statusCode = 404;
    throw error;
  }
  if (uniqueFacade) {
    const error = new Error("Facade with this name already exists for this location.");
    error.statusCode = 409;
    throw error;
  }

  // Pre-generate UUIDs so we can insert the parent row in one shot
  // with its image FK already populated (no INSERT + UPDATE cycle).
  const facadeId = randomUUID();
  const driveFileId = file ? randomUUID() : null;

  const t = await db.sequelize.transaction();
  try {
    let driveFileRow = null;
    if (file) {
      driveFileRow = await createImageDriveFile({
        file,
        fileId: driveFileId,
        companyId,
        builderId,
        uploadedBy: userId,
        referenceId: facadeId,
        referenceType: DRIVE_FILE_MAPPING.REFERENCE_NAMES.FACADE,
        subReferenceType: DRIVE_FILE_MAPPING.SUB_REFERENCES.FACADE_IMAGE,
        namePrefix: `facade_${facadeId}`,
      }, t);
    }

    const newFacade = await db.Facade.create({
      facade_id: facadeId,
      company_id: companyId,
      builder_id: builderId,
      location_id,
      name: trimmedName,
      dwelling_type_id: dwelling_type_id || null,
      range_id: range_id || null,
      cost_type,
      cost: cost || null,
      builder_cost: builder_cost || null,
      image: driveFileId,
      status,
      created_by: userId,
      updated_by: userId,
    }, { transaction: t });

    await t.commit();

    const plain = newFacade.toJSON();
    plain.image = driveFileRow ? s3UrlForKey(driveFileRow.s3_key) : null;
    plain.location = location
      ? { location_id: location.location_id, name: location.name }
      : null;
    plain.dwellingType = dwelling
      ? { dwelling_type_id: dwelling.dwelling_type_id, name: dwelling.name }
      : null;
    plain.range = range
      ? { range_id: range.range_id, name: range.name }
      : null;

    return transformFacade(plain);
  } catch (error) {
    await t.rollback();
    if (error.name === "SequelizeUniqueConstraintError") {
      const e = new Error("Facade with this name already exists.");
      e.statusCode = 409;
      throw e;
    }
    throw error;
  }
}

/**
 * Update a Master Facade
 */
export async function updateMasterFacadeService(facadeId, payload, user, file) {
  const t = await db.sequelize.transaction();
  try {
    const builderId = user?.builder_id;
    const companyId = user?.company_id;
    const userId = user?.user_id;
    const imageUrl = file?.location;

    // Fetch existing facade with lock
    const existingFacade = await db.Facade.findOne({
      where: { facade_id: facadeId, builder_id: builderId, company_id: companyId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!existingFacade) {
      const error = new Error("Facade not found.");
      error.statusCode = 404;
      throw error;
    }

    // Complex Status Logic
    const currentStatus = existingFacade.status;
    const statusInBody = payload && Object.prototype.hasOwnProperty.call(payload, "status");
    let requestedStatus = statusInBody ? payload.status : undefined;

    const updatesWithoutStatus = { ...payload };
    delete updatesWithoutStatus.status;
    const updatingOtherFields = Object.keys(updatesWithoutStatus).length > 0 || !!imageUrl;

    if (statusInBody) {
      if (typeof requestedStatus === "string") {
        const v = requestedStatus.trim().toLowerCase();
        if (v === "true") {
          requestedStatus = true;
        } else if (v === "false") {
          requestedStatus = false;
        } else {
          const e = new Error("The 'status' field must be a boolean (true or false).");
          e.statusCode = 400;
          throw e;
        }
      } else if (typeof requestedStatus !== "boolean") {
        const e = new Error("The 'status' field must be a boolean (true or false).");
        e.statusCode = 400;
        throw e;
      }
    }

    if (currentStatus === false) {
      const performingActivation = statusInBody && requestedStatus === true;
      if (statusInBody && requestedStatus === false) {
        const e = new Error("Facade is already Inactive. 'status' can only be updated to true (Active) from this state.");
        e.statusCode = 403;
        throw e;
      }
      if (updatingOtherFields && !performingActivation) {
        const e = new Error("Cannot update non-'status' fields when the facade is currently Inactive. Only 'status' can be changed (to true/Active).");
        e.statusCode = 403;
        throw e;
      }
      if (performingActivation && updatingOtherFields) {
        const e = new Error("To activate an inactive facade, 'status' must be the only field provided in the request.");
        e.statusCode = 403;
        throw e;
      }
    }

    if (currentStatus === true && statusInBody && requestedStatus === false) {
      if (updatingOtherFields) {
        const e = new Error("To deactivate an active facade, 'status' must be the only field provided in the request.");
        e.statusCode = 403;
        throw e;
      }
    }

    const { name, cost_type, location_id, dwelling_type_id, range_id } = payload;

    if (cost_type && !["standard", "upgrade"].includes(cost_type)) {
      const e = new Error("Invalid cost_type.");
      e.statusCode = 400;
      throw e;
    }

    if (location_id) {
      const loc = await db.Location.findOne({ where: { location_id, builder_id: builderId }, transaction: t });
      if (!loc) {
        const e = new Error("Invalid location.");
        e.statusCode = 404;
        throw e;
      }
    }

    if (dwelling_type_id) {
      const dt = await db.DwellingType.findOne({ where: { dwelling_type_id, builder_id: builderId, is_active: true }, transaction: t });
      if (!dt) {
        const e = new Error("Invalid or inactive dwelling type.");
        e.statusCode = 404;
        throw e;
      }
    }

    if (range_id) {
      const range = await db.Range.findOne({ where: { range_id, builder_id: builderId, is_active: true }, transaction: t });
      if (!range) {
        const e = new Error("Invalid or inactive range.");
        e.statusCode = 404;
        throw e;
      }
    }

    // Unique check
    if (name || location_id) {
      const locId = location_id || existingFacade.location_id;
      const facName = name || existingFacade.name;
      const dup = await db.Facade.findOne({
        where: {
          location_id: locId,
          facade_id: { [Op.ne]: facadeId },
          is_sample_data: false,
          [Op.and]: literal(`LOWER(name) = LOWER('${facName.trim().replace(/'/g, "''")}')`),
        },
        transaction: t,
      });
      if (dup) {
        const e = new Error("Facade with this name already exists for this location.");
        e.statusCode = 409;
        throw e;
      }
    }

    // Handle Image. Read the raw column (UUID/key) before the afterFind hook
    // can rewrite it into a URL, drop the old file, then store the new one.
    let newImageVal = undefined;
    if (file) {
      const { image: rawImage } = await getRawImageColumns("facade", "facade_id", facadeId, ["image"], t);
      await removeImageByRef(rawImage, t);

      const driveFile = await createImageDriveFile({
        file,
        companyId,
        builderId,
        uploadedBy: userId,
        referenceId: facadeId,
        referenceType: DRIVE_FILE_MAPPING.REFERENCE_NAMES.FACADE,
        subReferenceType: DRIVE_FILE_MAPPING.SUB_REFERENCES.FACADE_IMAGE,
        namePrefix: `facade_${facadeId}`,
      }, t);

      newImageVal = driveFile.file_id;
    }

    // Build update data
    const updateData = {
      updated_by: userId,
      updatedAt: new Date(),
    };
    const allowed = ["name", "cost_type", "cost", "builder_cost", "status", "location_id", "dwelling_type_id", "range_id"];
    allowed.forEach(field => {
      if (payload.hasOwnProperty(field)) {
        updateData[field] = (typeof payload[field] === "string" ? payload[field].trim() : payload[field]);
      }
    });
    if (statusInBody) {
      updateData.status = requestedStatus;
    }
    if (newImageVal !== undefined) {
      updateData.image = newImageVal;
    }

    await existingFacade.update(updateData, { transaction: t });

    // Reload with associations
    const completeFacade = await db.Facade.findOne({
      where: { facade_id: facadeId },
      include: [
        { model: db.Location, as: "location", attributes: ["location_id", "name"] },
        { model: db.DwellingType, as: "dwellingType", attributes: ["dwelling_type_id", "name"] },
        { model: db.Range, as: "range", attributes: ["range_id", "name"] },
      ],
      transaction: t,
    });

    await t.commit();
    return transformFacade(completeFacade);
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

/**
 * Delete a Master Facade
 */
export async function deleteMasterFacadeService(facadeId, builderId) {
  const t = await db.sequelize.transaction();
  try {
    const facade = await db.Facade.findOne({
      where: { facade_id: facadeId, builder_id: builderId },
      transaction: t,
    });

    if (!facade) {
      const error = new Error("Facade not found.");
      error.statusCode = 404;
      throw error;
    }

    // Read the raw image column (bypassing the afterFind URL hook) and drop the
    // backing DriveFile / S3 object before deleting the facade.
    const { image: rawImage } = await getRawImageColumns("facade", "facade_id", facadeId, ["image"], t);
    await removeImageByRef(rawImage, t);

    // Retire the facade's promotions before it goes.
    //
    // `facade.destroy()` is a hard delete and the FK is ON DELETE SET NULL, so
    // without this the promotion row survives with facade_id = NULL — still
    // is_active, still is_delete = false, and orphaned from the facade it was
    // advertising. Soft-deleted rather than destroyed on purpose:
    // featured_facade_lead cascades from featur_facade, so a hard delete here
    // would take the captured leads with it.
    await db.FeaturFacade.update(
      { is_delete: true, is_active: false },
      { where: { facade_id: facadeId, is_delete: false }, transaction: t },
    );

    await facade.destroy({ transaction: t });
    await t.commit();
    return true;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

/**
 * Toggles the is_collab status for a facade.
 * Only one facade per builder can have is_collab: true.
 */
export async function toggleCollabService(facadeId, builderId) {
  const t = await db.sequelize.transaction();
  try {
    const facade = await db.Facade.findOne({
      where: { facade_id: facadeId, builder_id: builderId },
      transaction: t,
    });

    if (!facade) {
      const error = new Error("Facade not found.");
      error.statusCode = 404;
      throw error;
    }

    const newCollabStatus = !facade.is_collab;

    if (newCollabStatus) {
      // If setting to true, make all others false for this builder
      await db.Facade.update(
        { is_collab: false },
        { where: { builder_id: builderId }, transaction: t },
      );
    }

    await facade.update({ is_collab: newCollabStatus }, { transaction: t });
    await t.commit();
    return transformFacade(facade);
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

/**
 * Fetch all builder facades where is_collab is true.
 * PUBLIC API
 */
export async function getPublicCollabFacadesService() {
  const facades = await db.Facade.findAll({
    where: { is_collab: true },
    include: [
      { model: db.DwellingType, as: "dwellingType", attributes: ["dwelling_type_id", "name"] },
      { model: db.Range, as: "range", attributes: ["range_id", "name"] },
      { model: db.Builder, as: "builder", attributes: ["builder_id", "name"] },
    ],
  });

  return facades.map(f => transformFacade(f));
}

export default {
  getMasterFacadesService,
  getMasterFacadeByIdService,
  createMasterFacadeService,
  updateMasterFacadeService,
  deleteMasterFacadeService,
  toggleCollabService,
  getPublicCollabFacadesService,
};
