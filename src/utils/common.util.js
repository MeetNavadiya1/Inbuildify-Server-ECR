export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function checkRequiredFields(body, requiredFields) {
  return requiredFields.every((field) => body[field] !== undefined);
}

export function keysToCamel(obj) {
  if (!obj) {
    return null;
  }
  const toCamel = (s) =>
    s.replace(/([-_][a-z])/g, (group) =>
      group.toUpperCase().replace("-", "").replace("_", ""),
    );

  return Object.keys(obj).reduce((acc, key) => {
    acc[toCamel(key)] = obj[key];
    return acc;
  }, {});
}

export function keysToCamelCase(rows) {
  return rows.map((r) => module.exports.keysToCamel(r));
}
