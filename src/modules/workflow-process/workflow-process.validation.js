import Joi from "joi";

export const getAllWorkFlowProcessSchema = Joi.object({
  limit: Joi.number().optional().default(25).max(50),
  offset: Joi.number().optional().default(0).max(25),
});

export const createWorkFlowProcessSchema = Joi.object({
  name: Joi.string().required().min(2).max(200),
  description: Joi.string().optional(),
});

export const updateWorkFlowProcessSchema = Joi.object({
  name: Joi.string().optional().min(2).max(200),
  description: Joi.string().optional(),
})
  .min(1)
  .message({ "object.min": "At least one field is required to update" });

export const displayOrderManageSchema = Joi.object({
  orderedWorkflowProcess: Joi.array()
    .items(
      Joi.object({
        workflowProcessId: Joi.string().uuid().required().messages({
          "string.guid": "Workflow Process ID must be a valid UUID",
          "any.required": "Workflow Process ID is required",
        }),
        displayOrder: Joi.number().integer().required().messages({
          "number.base": "Display Order must be a number",
          "number.integer": "Display Order must be an integer",
          "any.required": "Display Order is required",
        }),
      }),
    )
    .unique("workflowProcessId")
    .unique("displayOrder")
    .min(1)
    .required()
    .messages({
      "array.base":
        "orderedWorkflowProcess must be an array of objects with workflowProcessId and displayOrder",
      "array.unique": "Workflow Process ID or Display Order must be unique",
      "array.min": "At least one workflow process must be provided",
    }),
})
  .required()
  .unknown(false);

export const deleteWorkFlowProcessSchema = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.guid": "Workflow Process ID must be a valid UUID",
    "any.required": "Workflow Process ID is required",
  }),
});

export const getWorkflowProcessesByCategoryIdSchema = Joi.object({
  workflow_process_id: Joi.string().uuid().required().messages({
    "string.guid": "Workflow Process ID must be a valid UUID",
    "any.required": "Workflow Process ID is required",
  }),
});

const imageRule = Joi.alternatives().try(
  Joi.string().uri().max(500).trim().messages({
    "string.base": "Image must be a string",
    "string.uri": "Image must be a valid URL",
    "string.max": "Image URL must not exceed 500 characters",
  }),
  Joi.object({
    fieldname: Joi.string().valid("image").required(),
    originalname: Joi.string().required(),
    mimetype: Joi.string().required(),
    size: Joi.number().max(10 * 1024 * 1024).required(),
    location: Joi.string().uri().required(),
  }).unknown(true),
).optional();

export const createWorkflowProcessTaskSchema = Joi.object({
  workflow_process_id: Joi.string().uuid().required().messages({
    "string.guid": "Workflow Process ID must be a valid UUID",
    "any.required": "Workflow Process ID is required",
  }),
  name: Joi.string().required().min(2).max(200).messages({
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name cannot exceed 200 characters",
    "any.required": "Name is required",
  }),
  description: Joi.string().optional().allow(null, ""),
  image: imageRule,
  timespent: Joi.number().integer().greater(0).optional().allow(null).messages({
    "number.base": "Time spent must be a number",
    "number.integer": "Time spent must be an integer",
    "number.greater": "Time spent cannot be negative",
  }),
}).prefs({ convert: true, abortEarly: false });

export const updateWorkflowProcessTaskSchema = Joi.object({
  name: Joi.string().optional().min(2).max(200).messages({
    "string.min": "Name must be at least 2 characters long",
    "string.max": "Name cannot exceed 200 characters",
  }),
  description: Joi.string().optional().allow(null, ""),
  image: imageRule,
  timespent: Joi.number().integer().greater(0).optional().allow(null).messages({
    "number.base": "Time spent must be a number",
    "number.integer": "Time spent must be an integer",
    "number.greater": "Time spent cannot be negative",
  }),
}).prefs({ convert: true, abortEarly: false })
  .min(1)
  .message({ "object.min": "At least one field is required to update" });

export const deleteWorkflowProcessTaskSchema = Joi.object({
  workflow_process_task_id: Joi.string().uuid().required().messages({
    "string.guid": "Workflow Process Task ID must be a valid UUID",
    "any.required": "Workflow Process Task ID is required",
  }),
});

export default {
  getAllWorkFlowProcessSchema,
  createWorkFlowProcessSchema,
  updateWorkFlowProcessSchema,
  displayOrderManageSchema,
  deleteWorkFlowProcessSchema,
  getWorkflowProcessesByCategoryIdSchema,
  createWorkflowProcessTaskSchema,
  updateWorkflowProcessTaskSchema,
  deleteWorkflowProcessTaskSchema,
};
