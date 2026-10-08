import Joi from "joi";

const VALID_PERMISSION_LEVELS = ["VIEW", "EDIT", "ADMIN"];
const VALID_ENTITY_TYPES = ["folder", "file"];

export const createShareSchema = Joi.object({
  entity_type: Joi.string().valid(...VALID_ENTITY_TYPES).required(),
  entity_id: Joi.string().uuid().required(),
  shared_with_user: Joi.string().uuid().required(),
  permission_level: Joi.string().valid(...VALID_PERMISSION_LEVELS).required(),
});

/**
 * Share one item with several users in a single request — what the Share popup
 * sends. Kept separate from createShareSchema so the single-user endpoint (and
 * every existing caller of it) keeps its stricter one-user contract.
 */
export const createBulkShareSchema = Joi.object({
  entity_type: Joi.string().valid(...VALID_ENTITY_TYPES).required(),
  entity_id: Joi.string().uuid().required(),
  shared_with_users: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
  permission_level: Joi.string().valid(...VALID_PERMISSION_LEVELS).default("VIEW"),
});

export const updateShareSchema = Joi.object({
  permission_level: Joi.string().valid(...VALID_PERMISSION_LEVELS).required(),
});
