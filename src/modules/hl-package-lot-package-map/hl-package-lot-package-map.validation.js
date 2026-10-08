import Joi from "joi";

const uuidRule = Joi.string().uuid().required().messages({
  "string.guid": "ID must be a valid UUID",
  "any.required": "ID is required",
});

const optionalUuidRule = Joi.string().uuid().optional().allow(null).messages({
  "string.guid": "ID must be a valid UUID",
});

export const createHlPackageLotPackageMapSchema = Joi.object({
  house_land_package_id: uuidRule.messages({
    "string.guid": "House land package ID must be a valid UUID",
    "any.required": "House land package ID is required",
  }),
  lot_package_id: uuidRule.messages({
    "string.guid": "Lot package ID must be a valid UUID",
    "any.required": "Lot package ID is required",
  }),
}).required();

export const getLotPackagesByHlPackageIdSchema = Joi.object({
  house_land_package_id: uuidRule.messages({
    "string.guid": "House land package ID must be a valid UUID",
    "any.required": "House land package ID is required",
  }),
});

export const deleteHlPackageLotPackageMapSchema = Joi.object({
  id: uuidRule.messages({
    "string.guid": "ID must be a valid UUID",
    "any.required": "ID is required",
  }),
});

export const getAllHlPackageLotPackageMapsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).optional().allow(null).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be at least 1",
  }),
  limit: Joi.number().integer().min(1).max(100).default(25).optional().allow(null).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit must be at most 100",
  }),
});

export default {
  createHlPackageLotPackageMapSchema,
  getLotPackagesByHlPackageIdSchema,
  deleteHlPackageLotPackageMapSchema,
  getAllHlPackageLotPackageMapsSchema,
};
