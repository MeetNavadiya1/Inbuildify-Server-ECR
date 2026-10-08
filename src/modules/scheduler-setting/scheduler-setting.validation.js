import Joi from "joi";

export const updateSchedulerSettingSchema = Joi.object({
  receiver_of_replies: Joi.array()
    .items(Joi.string().guid({ version: "uuidv4" }))
    .optional()
    .messages({
      "string.guid": "Each receiver_of_replies must be a valid UUID",
    }),
});

export default {
  updateSchedulerSettingSchema,
};
