import Joi from "joi";

const VALID_ENTITY_TYPES = ["folder", "file"];

/** What the Shared list posts when a user asks for an item to be deleted. */
export const createDeleteRequestSchema = Joi.object({
  entity_type: Joi.string().valid(...VALID_ENTITY_TYPES).required(),
  entity_id: Joi.string().uuid().required(),
  reason: Joi.string().allow("", null).max(2000),
});

export const deleteRequestParamsSchema = Joi.object({
  request_id: Joi.string().uuid().required(),
});

/**
 * The owner's answer, posted from the emailed link. `token` is the per-request
 * secret carried in that link — the shared external token guards the route, but
 * only this proves the caller was sent to THIS request.
 */
export const respondDeleteRequestSchema = Joi.object({
  decision: Joi.string().valid("APPROVED", "REJECTED").required(),
  token: Joi.string().uuid().required(),
  comments: Joi.string().allow("", null).max(1000),
  responded_by_email: Joi.string().email().allow("", null),
});

export const deleteRequestQuerySchema = Joi.object({
  token: Joi.string().uuid().required(),
});

export default {
  createDeleteRequestSchema,
  deleteRequestParamsSchema,
  respondDeleteRequestSchema,
  deleteRequestQuerySchema,
};
