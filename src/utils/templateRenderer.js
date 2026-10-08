/**
 * Replaces {{variableName}} placeholders in a template string.
 * Using {{}} syntax keeps literal $ signs safe (no conflict with JS template literals).
 *
 * Example:
 *   renderTemplate("Hello {{name}}, total is ${{amount}}", { name: "John", amount: "1500" })
 *   → "Hello John, total is $1500"
 */
export function renderTemplate(template, context) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    context[key] !== undefined ? String(context[key]) : match
  );
}
