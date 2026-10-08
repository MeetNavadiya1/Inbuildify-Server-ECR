export function buildDynamicUpdate({ table, idColumn, idValue, payload, fieldMap }) {
  const sets = [];
  const values = [idValue];
  let paramIndex = 2;

  for (const [payloadKey, columnName] of Object.entries(fieldMap)) {
    if (payload[payloadKey] !== undefined) {
      sets.push(`${columnName} = $${paramIndex}`);
      values.push(payload[payloadKey]);
      paramIndex++;
    }
  }

  if (sets.length === 0) {
    return null;
  }

  const query = `
    UPDATE ${table}
    SET ${sets.join(", ")},
        updated_at = NOW()
    WHERE ${idColumn} = $1
    RETURNING *
  `;

  return { query, values };
}

export default { buildDynamicUpdate };
