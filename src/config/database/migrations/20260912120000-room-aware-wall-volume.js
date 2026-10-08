"use strict";

/**
 * Wall Volume now measures the walls instead of allowing a flat fraction of the
 * built volume, so the room inputs finally move it.
 *
 * The starter template shipped `total_area * ceiling_height * 0.36 *
 * project_type`: bedrooms, bathrooms, the kitchen and the living areas could be
 * changed all day and the wall volume — and with it the brick line — never
 * budged. The replacement adds the perimeter walls (4.1 × √area at 230 mm) to
 * the partitions that divide the floor into its rooms (115 mm), × ceiling
 * height, × storeys.
 *
 * Only rows still carrying the starter formula verbatim are touched (whitespace
 * and case aside) — a builder who has written their own wall formula keeps it —
 * and only where all four room parameters exist and are active for that tenant,
 * so the new formula can never land on a set it cannot resolve.
 */

const NIL_UUID = "'00000000-0000-0000-0000-000000000000'::uuid";

const OLD_FORMULA = "total_area * ceiling_height * 0.36 * project_type";
const OLD_DESCRIPTION = "Masonry volume allowance: 0.36 m³ of wall per m³ of built volume, per storey.";

const NEW_FORMULA =
  "(4.1 * sqrt(total_area) * 0.23 + 2 * max(sqrt(bedrooms + bathrooms + kitchen + halls) - 1, 0) * sqrt(total_area) * 0.115) * ceiling_height * project_type";
const NEW_DESCRIPTION =
  "Perimeter walls (4.1 × √area at 230 mm) plus the partitions that divide the floor into its rooms (115 mm), × ceiling height, per storey.";

/** Formulas compare by shape, not by spacing — "a*b" and "a * b" are the same formula. */
const squashed = (sql) => `regexp_replace(lower(coalesce(${sql}, '')), '[[:space:]]+', '', 'g')`;

const ROOM_PARAMETERS_PRESENT = `
  (SELECT count(DISTINCT q.variable)
     FROM estimate_parameter q
    WHERE q.variable IN ('bedrooms', 'bathrooms', 'kitchen', 'halls')
      AND q.is_active
      AND COALESCE(q.builder_id, ${NIL_UUID}) = COALESCE(p.builder_id, ${NIL_UUID})
      AND COALESCE(q.company_id, ${NIL_UUID}) = COALESCE(p.company_id, ${NIL_UUID})) = 4
`;

async function swapFormula(queryInterface, { from, fromDescription, to, toDescription }) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes("estimate_parameter")) {
    return;
  }

  await queryInterface.sequelize.query(
    `UPDATE estimate_parameter p
        SET formula = :to,
            description = CASE
              WHEN ${squashed("p.description")} = ${squashed(":fromDescription")} THEN :toDescription
              ELSE p.description
            END,
            updated_at = CURRENT_TIMESTAMP
      WHERE p.variable = 'wall_volume'
        AND p.input_type = 'formula'
        AND ${squashed("p.formula")} = ${squashed(":from")}
        AND ${ROOM_PARAMETERS_PRESENT}`,
    { replacements: { from, fromDescription, to, toDescription } },
  );
}

export async function up(queryInterface) {
  await swapFormula(queryInterface, {
    from: OLD_FORMULA,
    fromDescription: OLD_DESCRIPTION,
    to: NEW_FORMULA,
    toDescription: NEW_DESCRIPTION,
  });
}

export async function down(queryInterface) {
  await swapFormula(queryInterface, {
    from: NEW_FORMULA,
    fromDescription: NEW_DESCRIPTION,
    to: OLD_FORMULA,
    toDescription: OLD_DESCRIPTION,
  });
}

export default { up, down };
