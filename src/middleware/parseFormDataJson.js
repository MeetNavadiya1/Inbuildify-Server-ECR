const parseFormDataJson = (req, res, next) => {
  const result = {};
  const regex = /^(\w+)\[(\w+)\]$/;

  for (const key in req.body) {
    let value = req.body[key];

    // Attempt to parse JSON strings (objects or arrays)
    if (typeof value === "string" && (value.startsWith("{") || value.startsWith("["))) {
      try {
        value = JSON.parse(value);
      } catch (e) {
        // Keep original if parsing fails
      }
    }

    const match = key.match(regex);

    if (match) {
      const parent = match[1];
      const child = match[2];

      if (!result[parent]) {
        result[parent] = {};
      }

      result[parent][child] = value;
    } else {
      result[key] = value;
    }
  }

  req.body = result;
  next();
};

export default parseFormDataJson;
