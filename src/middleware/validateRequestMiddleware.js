import validationMessageFormatterHelper from "../utils/validationMessageFormatterHelper.js";
import ERRORS from "../utils/errors.js";
import { REQUEST_SOURCE } from "../config/constants.js";

export function validateRequest(schema, source = REQUEST_SOURCE.BODY) {
  const middleware = (req, res, next) => {
    let dataToValidate;

    switch (source) {
    case REQUEST_SOURCE.BODY:
      dataToValidate = req.body;
      break;
    case REQUEST_SOURCE.QUERY:
      dataToValidate = req.query;
      break;
    case REQUEST_SOURCE.PARAMS:
      dataToValidate = req.params;
      break;
    case REQUEST_SOURCE.FORM_DATA:
      dataToValidate = { ...req.body };
      break;
    default:
      dataToValidate = req[source];
    }

    if (dataToValidate === undefined || dataToValidate === null) {
      return res.status(ERRORS.NOT_ACCEPTABLE.code).json({
        message: ERRORS.NOT_ACCEPTABLE.message,
        errors: ["Request payload is missing."],
      });
    }

    const { error, value } = schema.validate(dataToValidate, { abortEarly: false });

    if (error) {
      const validationError = validationMessageFormatterHelper(error.details);

      const validationErrorMessage = Object.keys(validationError)
        .map((key) => `${validationError[key]}`)
        .join(", ");

      return res.status(ERRORS.UNPROCESSABLE_ENTITY.code).json({
        message: validationErrorMessage,
        errors: ERRORS.UNPROCESSABLE_ENTITY.message,
      });
    }

    if (source === REQUEST_SOURCE.BODY) {
      req.body = value;
    } else if (source === REQUEST_SOURCE.QUERY) {
      req.query = value;
    } else if (source === REQUEST_SOURCE.PARAMS) {
      req.params = value;
    } else if (source === REQUEST_SOURCE.FORM_DATA) {
      req.body = value;
    }

    next();
  };

  // 🔹 Attach schema and source to middleware function
  middleware.joiSchema = schema;
  middleware.source = source; // "BODY", "QUERY", "PARAMS", etc.

  return middleware;
}
