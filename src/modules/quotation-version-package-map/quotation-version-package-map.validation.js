// import Joi from "joi";

// export const createPackageMapSchema = Joi.object({
//   quotation_version_id: Joi.string().uuid().required().messages({
//     "string.guid": "Quotation Version ID must be a valid UUID",
//     "any.required": "Quotation Version ID is required",
//   }),
//   package_id: Joi.string().uuid().required().messages({
//     "string.guid": "Package ID must be a valid UUID",
//     "any.required": "Package ID is required",
//   }),
// });

// export const getPackageMapsByVersionSchema = Joi.object({
//   quotation_version_id: Joi.string().uuid().required().messages({
//     "string.guid": "Quotation Version ID must be a valid UUID",
//     "any.required": "Quotation Version ID is required",
//   }),
// });

// export const deletePackageMapParamsSchema = Joi.object({
//   id: Joi.string().uuid().required().messages({
//     "string.guid": "Package Map ID must be a valid UUID",
//     "any.required": "Package Map ID is required",
//   }),
// });

// export default {
//   createPackageMapSchema,
//   getPackageMapsByVersionSchema,
//   deletePackageMapParamsSchema,
// };
