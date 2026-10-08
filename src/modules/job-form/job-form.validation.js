import Joi from "joi";

// Reusable rules
const uuidRule = Joi.string().uuid().required().messages({
  "string.guid": "ID must be a valid UUID",
  "any.required": "ID is required",
});

const optionalUuidRule = Joi.string().uuid().optional().allow(null).messages({
  "string.guid": "ID must be a valid UUID",
});

const stringRule = Joi.string().trim().messages({
  "string.base": "Must be a string",
  "string.empty": "Field cannot be empty",
});

const numericRule = Joi.number().messages({
  "number.base": "Must be a number",
});

const booleanRule = Joi.boolean().optional().allow(null).messages({
  "boolean.base": "Must be a boolean value",
});

const jsonRule = Joi.object().optional().allow(null).messages({
  "object.base": "Must be a valid JSON object",
});

const facadeMaterialRequirementRule = Joi.array()
  .max(3)
  .items(
    Joi.object({
      material: Joi.string().trim().required().messages({
        "string.base": "Material must be a string",
        "string.empty": "Material cannot be empty",
        "any.required": "Material is required",
      }),
      percentage: Joi.number().min(0).max(100).required().messages({
        "number.base": "Percentage must be a number",
        "number.min": "Percentage cannot be negative",
        "number.max": "Percentage cannot exceed 100",
        "any.required": "Percentage is required",
      }),
    }),
  )
  .optional()
  .allow(null)
  .custom((value, helpers) => {
    if (value && value.length > 0) {
      const totalPercentage = value.reduce(
        (sum, item) => sum + item.percentage,
        0,
      );
      if (totalPercentage !== 100) {
        return helpers.error("facade_material_requirement.percentage_sum");
      }
    }
    return value;
  })
  .messages({
    "array.max": "Maximum 3 material records allowed",
    "facade_material_requirement.percentage_sum":
      "Total percentage must equal 100%",
  });

// Valid values for specific fields
const siteFallValidValues = ["under_1_m", "1_2_m", "2_3_m", "above_3_m"];
const driveawayLocationValidValues = ["front_left", "front_right", "rear_side"];
const buildZoneValidValues = ["north_west", "south_east", "north", "west"];
const maxFillLocationValidValues = [
  "front_left",
  "front_right",
  "rear_left",
  "rear_right",
];
const fallTypeValidValues = [
  "front_to_rear",
  "rear_to_front",
  "diagonal_front_to_rear",
  "diagonal_rear_to_front",
];
const lotTypeValidValues = ["under_300_m2", "over_300_m2"];
const siteCoverageAllowedValidValues = ["less_then_60", "60", "70", "80", "90"];
const eavesSizeValidValues = ["450 mm", "600 mm"];
const eavesReturnValidValues = [
  "2_m",
  "3_m",
  "4_m",
  "all_around",
  "side_only",
  "n_a",
];
const roofCoveringValidValues = [
  "concrete_tiles",
  "standard",
  "simline",
  "flat",
  "colorbond_roof",
  "with_blanket",
  "with_sarking",
];
const extraRequirementValidValues = ["rainwater_tank", "solar_hot_water_system", "heat_pump"];
const roofPitchValidValues = ["15", "18", "20", "22.5", "25"];
const flatRoofPitchValidValues = ["5"];
const parapetWallValidValues = ["front_only", "all_around", "n_a"];
const singleStoryValidValues = ["brick", "hebel"];
const doubleStoryGfValidValues = ["brick", "hebel"];
const doubleStoryFfValidValues = ["brick", "poly", "hebel"];
const wallOverGarageValidValues = ["brick", "poly", "hebel"];
const wallOverLowerRoofValidValues = ["poly", "xon_cladding", "whetherboard"];
const drivewayValidValues = ["by_client", "by_builder"];
const connectionValidValues = ["nbn", "opticom"];

// Schemas
export const createJobFormSchema = Joi.object({
  leads_id: optionalUuidRule,
  street_name: stringRule.max(255).required(),
  land_developer: stringRule.max(255).optional().allow(""),
  council: stringRule.max(255).optional().allow(""),
  title_volume: stringRule.max(255).optional().allow(""),
  folio: stringRule.max(255).optional().allow(""),
  plan_subdivision: stringRule.max(255).optional().allow(""),
  site_fall: Joi.string()
    .valid(...siteFallValidValues)
    .optional()
    .allow(""),
  existing_tree: booleanRule,
  driveaway_location: Joi.string()
    .valid(...driveawayLocationValidValues)
    .optional()
    .allow(""),
  any_sewer_tie: booleanRule,
  easements: booleanRule,
  buildup_area_easements: booleanRule,
  build_zone: Joi.string()
    .valid(...buildZoneValidValues)
    .optional()
    .allow(""),
  story_id: optionalUuidRule,
  finished_surface_m: numericRule.optional(),
  existing_surface_m: numericRule.optional(),
  filled_area_fill_m: numericRule.optional(),
  max_fill_location: Joi.string()
    .valid(...maxFillLocationValidValues)
    .optional()
    .allow(""),
  max_finished_surface_m: numericRule.optional(),
  min_finished_surface_m: numericRule.optional(),
  engineering_fall_m: numericRule.optional(),
  fall_type: Joi.string()
    .valid(...fallTypeValidValues)
    .optional()
    .allow(""),
  ceiling_height: numericRule.optional(),
  eaves_location: stringRule.max(255).optional().allow(""),
  lot_type: Joi.string()
    .valid(...lotTypeValidValues)
    .optional()
    .allow(""),
  site_coverage_allowed: Joi.string()
    .valid(...siteCoverageAllowedValidValues)
    .optional()
    .allow(""),
  eaves_size: Joi.string()
    .valid(...eavesSizeValidValues)
    .optional()
    .allow(""),
  eaves_return: Joi.array()
    .items(Joi.string().valid(...eavesReturnValidValues))
    .optional()
    .allow(null),
  roof_covering: Joi.array()
    .items(Joi.string().valid(...roofCoveringValidValues))
    .optional()
    .allow(null),
  roof_pitch: Joi.string()
    .valid(...roofPitchValidValues)
    .optional()
    .allow(""),
  flat_roof_pitch: Joi.string()
    .valid(...flatRoofPitchValidValues)
    .optional()
    .allow(""),
  parapet_wall: Joi.string()
    .valid(...parapetWallValidValues)
    .optional()
    .allow(""),
  single_story: Joi.string()
    .valid(...singleStoryValidValues)
    .optional()
    .allow(""),
  double_story_gf: Joi.string()
    .valid(...doubleStoryGfValidValues)
    .optional()
    .allow(""),
  double_story_ff: Joi.string()
    .valid(...doubleStoryFfValidValues)
    .optional()
    .allow(""),
  wall_over_garage: Joi.string()
    .valid(...wallOverGarageValidValues)
    .optional()
    .allow(""),
  wall_over_lower_roof: Joi.string()
    .valid(...wallOverLowerRoofValidValues)
    .optional()
    .allow(""),
  all_electric: booleanRule,
  type_of_cooling: stringRule.max(255).optional().allow(""),
  garage_door_type: stringRule.max(255).optional().allow(""),
  connection: Joi.string()
    .valid(...connectionValidValues)
    .optional()
    .allow(""),
  recycled_water: booleanRule,
  extra_requirement: Joi.array()
    .items(Joi.string().valid(...extraRequirementValidValues))
    .optional()
    .allow(null),
  three_phase: booleanRule,
  driveway: Joi.string()
    .valid(...drivewayValidValues)
    .optional()
    .allow(""),
  front_wall: stringRule.max(255).optional().allow(""),
  between_garage_building: stringRule.max(255).optional().allow(""),
  garage_side: stringRule.max(255).optional().allow(""),
  other_side: stringRule.max(255).optional().allow(""),
  rear: stringRule.max(255).optional().allow(""),
  allowed_porch_encroachment: stringRule.max(255).optional().allow(""),
  boundry_build: booleanRule,
  boundry_construction: booleanRule,
  double_story_front_wall: stringRule.max(255).optional().allow(""),
  double_story_garage_side: stringRule.max(255).optional().allow(""),
  double_story_other_side: stringRule.max(255).optional().allow(""),
  double_story_rear: stringRule.max(255).optional().allow(""),
  double_story_balcony_encroachment: stringRule.max(255).optional().allow(""),
  facade_material_requirement: facadeMaterialRequirementRule,
  raised_porch_facade: booleanRule,
  parapet_walls_pitch_roof: booleanRule,
  parapet_walls_tray_deck_roof: booleanRule,
  concept_inspiration: booleanRule,
  plan_subdivision_engineering: booleanRule,
  memorandum_common_provisions: booleanRule,
  developer_guidelines: booleanRule,
  contact_for_sale: booleanRule,
  variational_list: booleanRule,
  special_job_notes: stringRule.max(500).optional().allow(""),
});

export const updateJobFormSchema = Joi.object({
  street_name: stringRule.max(255).optional(),
  land_developer: stringRule.max(255).optional().allow(""),
  council: stringRule.max(255).optional().allow(""),
  title_volume: stringRule.max(255).optional().allow(""),
  folio: stringRule.max(255).optional().allow(""),
  plan_subdivision: stringRule.max(255).optional().allow(""),
  site_fall: Joi.string()
    .valid(...siteFallValidValues)
    .optional()
    .allow(""),
  existing_tree: booleanRule,
  driveaway_location: Joi.string()
    .valid(...driveawayLocationValidValues)
    .optional()
    .allow(""),
  any_sewer_tie: booleanRule,
  easements: booleanRule,
  buildup_area_easements: booleanRule,
  build_zone: Joi.string()
    .valid(...buildZoneValidValues)
    .optional()
    .allow(""),
  story_id: optionalUuidRule,
  finished_surface_m: numericRule.optional(),
  existing_surface_m: numericRule.optional(),
  filled_area_fill_m: numericRule.optional(),
  max_fill_location: Joi.string()
    .valid(...maxFillLocationValidValues)
    .optional()
    .allow(""),
  max_finished_surface_m: numericRule.optional(),
  min_finished_surface_m: numericRule.optional(),
  engineering_fall_m: numericRule.optional(),
  fall_type: Joi.string()
    .valid(...fallTypeValidValues)
    .optional()
    .allow(""),
  ceiling_height: numericRule.optional(),
  eaves_location: stringRule.max(255).optional().allow(""),
  lot_type: Joi.string()
    .valid(...lotTypeValidValues)
    .optional()
    .allow(""),
  site_coverage_allowed: Joi.string()
    .valid(...siteCoverageAllowedValidValues)
    .optional()
    .allow(""),
  eaves_size: Joi.string()
    .valid(...eavesSizeValidValues)
    .optional()
    .allow(""),
  eaves_return: Joi.array()
    .items(Joi.string().valid(...eavesReturnValidValues))
    .optional()
    .allow(null),
  roof_covering: Joi.array()
    .items(Joi.string().valid(...roofCoveringValidValues))
    .optional()
    .allow(null),
  roof_pitch: Joi.string()
    .valid(...roofPitchValidValues)
    .optional()
    .allow(""),
  flat_roof_pitch: Joi.string()
    .valid(...flatRoofPitchValidValues)
    .optional()
    .allow(""),
  parapet_wall: Joi.string()
    .valid(...parapetWallValidValues)
    .optional()
    .allow(""),
  single_story: Joi.string()
    .valid(...singleStoryValidValues)
    .optional()
    .allow(""),
  double_story_gf: Joi.string()
    .valid(...doubleStoryGfValidValues)
    .optional()
    .allow(""),
  double_story_ff: Joi.string()
    .valid(...doubleStoryFfValidValues)
    .optional()
    .allow(""),
  wall_over_garage: Joi.string()
    .valid(...wallOverGarageValidValues)
    .optional()
    .allow(""),
  wall_over_lower_roof: Joi.string()
    .valid(...wallOverLowerRoofValidValues)
    .optional()
    .allow(""),
  all_electric: booleanRule,
  type_of_cooling: stringRule.max(255).optional().allow(""),
  garage_door_type: stringRule.max(255).optional().allow(""),
  connection: Joi.string()
    .valid(...connectionValidValues)
    .optional()
    .allow(""),
  recycled_water: booleanRule,
  extra_requirement: Joi.array()
    .items(Joi.string().valid(...extraRequirementValidValues))
    .optional()
    .allow(null),
  three_phase: booleanRule,
  driveway: Joi.string()
    .valid(...drivewayValidValues)
    .optional()
    .allow(""),
  front_wall: stringRule.max(255).optional().allow(""),
  between_garage_building: stringRule.max(255).optional().allow(""),
  garage_side: stringRule.max(255).optional().allow(""),
  other_side: stringRule.max(255).optional().allow(""),
  rear: stringRule.max(255).optional().allow(""),
  allowed_porch_encroachment: stringRule.max(255).optional().allow(""),
  boundry_build: booleanRule,
  boundry_construction: booleanRule,
  double_story_front_wall: stringRule.max(255).optional().allow(""),
  double_story_garage_side: stringRule.max(255).optional().allow(""),
  double_story_other_side: stringRule.max(255).optional().allow(""),
  double_story_rear: stringRule.max(255).optional().allow(""),
  double_story_balcony_encroachment: stringRule.max(255).optional().allow(""),
  facade_material_requirement: facadeMaterialRequirementRule,
  raised_porch_facade: booleanRule,
  parapet_walls_pitch_roof: booleanRule,
  parapet_walls_tray_deck_roof: booleanRule,
  concept_inspiration: booleanRule,
  plan_subdivision_engineering: booleanRule,
  memorandum_common_provisions: booleanRule,
  developer_guidelines: booleanRule,
  contact_for_sale: booleanRule,
  variational_list: booleanRule,
  special_job_notes: stringRule.max(500).optional().allow(""),
});

export const getJobFormByIdSchema = Joi.object({
  leads_id: uuidRule,
});

export const deleteJobFormSchema = Joi.object({
  job_form_id: uuidRule,
});

export const updateJobFormParamsSchema = Joi.object({
  job_form_id: uuidRule,
});

export const getAllJobFormsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.integer": "Page must be an integer",
    "number.min": "Page must be greater than 0",
  }),
  limit: Joi.number().integer().min(1).max(100).default(25).messages({
    "number.base": "Limit must be a number",
    "number.integer": "Limit must be an integer",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit cannot exceed 100",
  }),
  search: Joi.string().allow("", null).max(255).optional().messages({
    "string.max": "Search term cannot exceed 255 characters",
  }),
});

export default {
  createJobFormSchema,
  updateJobFormSchema,
  getJobFormByIdSchema,
  deleteJobFormSchema,
  getAllJobFormsSchema,
  updateJobFormParamsSchema,
};
