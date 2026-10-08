"use strict";

/**
 * Make Cement — and through it Sand and Gravel — answer to the room count.
 *
 * `total_area * 10.76 * 0.4 * project_type` saw only the floor area and the
 * storeys, so adding bedrooms or bathrooms left the cement, sand and gravel
 * lines exactly where they were. Part of a house's cement genuinely does not
 * care how the floor is divided — the footings, slab, columns and beams follow
 * the area they cover, about 65% of the bags — but the mortar the bricks are
 * laid in and the plaster over them follow the walls, about 35%. That 35% now
 * moves with the rooms, at the same 23.2% partition swing Wall Volume uses.
 *
 * The factor is exactly 1 at the reference plan's five rooms (1 bed, 2 bath,
 * kitchen, 1 living area) that the sheet's 0.4 bags per sq ft was measured on,
 * so a reference estimate still gives 774.72 bags, 1,549.44 m³ of sand,
 * 3,098.88 m³ of gravel and a $310,852.21 total, bit-for-bit as before.
 *
 * Sand and gravel are left alone deliberately: they are `cement * 2` and
 * `cement * 4`, so they inherit the room response and the 1:2:4 mix holds.
 *
 * Same guards as the wall_volume migrations — only a row still carrying the
 * starter formula verbatim is touched, and only where all four room parameters
 * exist and are active for that tenant.
 */

const NIL_UUID = "'00000000-0000-0000-0000-000000000000'::uuid";

const OLD_FORMULA = "total_area * 10.76 * 0.4 * project_type";
const OLD_DESCRIPTION = "0.4 bags per sq ft of built-up area (m² × 10.76 = sq ft), per storey.";

const NEW_FORMULA =
  "total_area * 10.76 * 0.4 * project_type * (1 - 0.35 * 0.232 * (1 - max(sqrt(bedrooms + bathrooms + kitchen + halls) - 1, 0) / (sqrt(5) - 1)))";
const NEW_DESCRIPTION =
  "0.4 bags per sq ft of built-up area (m² × 10.76), per storey, with the 35% that goes into mortar and plaster following the room count — exactly 0.4 for a 5-room plan.";

/** Formulas compare by shape, not by spacing — "a*b" and "a * b" are the same formula. */
const squashed = (sql) => `regexp_replace(lower(coalesce(${sql}, '')), '[[:space:]]+', '', 'g')`;

/**
 * The room parameters live in estimate_parameter and cement in
 * estimate_material, so the tenant key is matched across the two tables.
 */
const ROOM_PARAMETERS_PRESENT = `
  (SELECT count(DISTINCT q.variable)
     FROM estimate_parameter q
    WHERE q.variable IN ('bedrooms', 'bathrooms', 'kitchen', 'halls')
      AND q.is_active
      AND COALESCE(q.builder_id, ${NIL_UUID}) = COALESCE(m.builder_id, ${NIL_UUID})
      AND COALESCE(q.company_id, ${NIL_UUID}) = COALESCE(m.company_id, ${NIL_UUID})) = 4
`;

async function swapFormula(queryInterface, { from, fromDescription, to, toDescription }) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes("estimate_material") || !existing.includes("estimate_parameter")) {
    return;
  }

  await queryInterface.sequelize.query(
    `UPDATE estimate_material m
        SET formula = :to,
            description = CASE
              WHEN ${squashed("m.description")} = ${squashed(":fromDescription")} THEN :toDescription
              ELSE m.description
            END,
            updated_at = CURRENT_TIMESTAMP
      WHERE m.variable = 'cement'
        AND ${squashed("m.formula")} = ${squashed(":from")}
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
