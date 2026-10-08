import Joi from "joi";

// Common rules
const uuidRule = Joi.string()
  .guid({ version: "uuidv4" })
  .messages({ "string.guid": "Invalid UUID format." });

/* ---------------------------
   CREATE FLOOR PLAN FACADE MAP
---------------------------- */
export const createFloorPlanFacadeMapSchema = Joi.object({
  floor_plan_id: uuidRule.required(),
  facade_id: uuidRule.required(),
});

/* ---------------------------
   GET FLOOR PLAN FACADE MAPS
---------------------------- */
export const getFloorPlanFacadeMapsSchema = Joi.object({
  floor_plan_id: uuidRule.optional(),
  facade_id: uuidRule.optional(),
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(100).default(25),
});

/* ---------------------------
   DELETE FLOOR PLAN FACADE MAP
---------------------------- */
export const deleteFloorPlanFacadeMapSchema = Joi.object({
  id: uuidRule.required(),
});

export default {
  createFloorPlanFacadeMapSchema,
  getFloorPlanFacadeMapsSchema,
  deleteFloorPlanFacadeMapSchema,
};
