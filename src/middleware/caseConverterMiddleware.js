const camelToSnake = (str) =>
  str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const isObject = (obj) =>
  obj !== null && typeof obj === "object" && !Array.isArray(obj);

const isSnakeCaseKey = (key) => {
  return /^[a-z0-9_]+$/.test(key) && key.includes("_");
};

const convertKeysToSnakeCase = (data, allowSnakeCase = false) => {
  if (Array.isArray(data)) {
    return data.map((item) => convertKeysToSnakeCase(item, allowSnakeCase));
  }

  if (isObject(data)) {
    return Object.keys(data).reduce((acc, key) => {
      // 🚨 Reject snake_case keys — the JSON API is camelCase-only.
      if (isSnakeCaseKey(key) && !allowSnakeCase) {
        throw new Error(
          `Invalid field ${key}. Use camelCase keys instead of snake_case.`,
        );
      }

      // camelToSnake leaves an already-snake_case key untouched, so an
      // accepted one lands on the same target key either way.
      const snakeKey = camelToSnake(key);
      acc[snakeKey] = convertKeysToSnakeCase(data[key], allowSnakeCase);
      return acc;
    }, {});
  }

  return data;
};
const camelToSnakeMiddleware = (req, res, next) => {
  try {
    // Multipart form fields are written by hand far more often than JSON bodies
    // are (curl, Postman, third-party clients), and both spellings convert to
    // the same key here. Rejecting `folder_id` on a file upload bought nothing
    // but a failed upload, so the camelCase rule is enforced on JSON only.
    const allowSnakeCase = Boolean(req.is("multipart/form-data"));

    if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
      req.body = convertKeysToSnakeCase(req.body, allowSnakeCase);
    }

    if (req.files) {
      /**
         * Normalize files into:
         * [
         *   { fieldname, location }
         * ]
         */
      const normalizedFiles = [];

      // multer.array() OR multer.single()
      if (Array.isArray(req.files)) {
        normalizedFiles.push(...req.files);
      } else if (typeof req.files === "object") { // multer.fields()
        Object.values(req.files).forEach((files) => {
          if (Array.isArray(files)) {
            normalizedFiles.push(...files);
          }
        });
      }

      // Map files into req.body
      normalizedFiles.forEach((file) => {
        const key = camelToSnake(file.fieldname);
        const value = file.location ?? null;

        // Do not overwrite valid body values
        if (
          req.body[key] === undefined ||
            req.body[key] === null ||
            req.body[key] === ""
        ) {
          req.body[key] = value;
        }
      });
    }

    // Handle single file upload (req.file)
    if (req.file) {
      const key = camelToSnake(req.file.fieldname);
      const value = req.file.location ?? null;

      // Do not overwrite valid body values
      if (
        req.body[key] === undefined ||
          req.body[key] === null ||
          req.body[key] === ""
      ) {
        req.body[key] = value;
      }
    }

    if (req.query && typeof req.query === "object") {
      req.query = Object.keys(req.query).reduce((acc, key) => {
        acc[camelToSnake(key)] = req.query[key];
        return acc;
      }, {});
    }

    if (req.params && typeof req.params === "object") {
      req.params = Object.keys(req.params).reduce((acc, key) => {
        acc[camelToSnake(key)] = req.params[key];
        return acc;
      }, {});
    }

    next();
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Invalid request payload",
    });
  }
};

export default camelToSnakeMiddleware;
