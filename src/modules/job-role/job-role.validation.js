import Joi from "joi";

export const jobParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "Job ID must be a valid UUID",
    "any.required": "Job ID is required",
  }),
});

export const jobRoleParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.guid": "Job ID must be a valid UUID",
    "any.required": "Job ID is required",
  }),
  role_id: Joi.string().uuid().required().messages({
    "string.guid": "Role ID must be a valid UUID",
    "any.required": "Role ID is required",
  }),
});

export const getJobRolesSchema = {
  params: jobParamsSchema,
  query: Joi.object({
    // "true" widens the role list from the job-assignable set to every active
    // role in the tenant.
    all: Joi.boolean().optional(),
    // "true" drops the eligible-user list from each role (lighter payload for
    // read-only views that only need who is assigned).
    without_users: Joi.boolean().optional(),
    // Tolerate cache-busting / tracking params the client may append.
  }).unknown(true),
};

// PUT /job-role/:job_id — bulk save from the Assign Roles modal.
// A user_id of null/"" clears that role's assignment.
export const saveJobRolesSchema = {
  params: jobParamsSchema,
  body: Joi.object({
    assignments: Joi.array()
      .items(
        Joi.object({
          role_id: Joi.string().uuid().required().messages({
            "string.guid": "Role ID must be a valid UUID",
            "any.required": "Role ID is required for every assignment",
          }),
          user_id: Joi.string().uuid().allow(null, "").required().messages({
            "string.guid": "User ID must be a valid UUID",
            "any.required": "User ID is required for every assignment (send null to unassign)",
          }),
        }),
      )
      .required()
      .messages({
        "array.base": "Assignments must be an array",
        "any.required": "Assignments are required",
      }),
  }),
};

// POST /job-role/:job_id/:role_id — assign (or reassign) a single role.
export const assignJobRoleSchema = {
  params: jobRoleParamsSchema,
  body: Joi.object({
    user_id: Joi.string().uuid().required().messages({
      "string.guid": "User ID must be a valid UUID",
      "any.required": "User ID is required",
    }),
  }),
};

export default {
  jobParamsSchema,
  jobRoleParamsSchema,
  getJobRolesSchema,
  saveJobRolesSchema,
  assignJobRoleSchema,
};
