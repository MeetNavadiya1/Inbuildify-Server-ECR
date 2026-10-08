"use strict";

/**
 * Put the reference estimating sheet's calibration back into Wall Volume.
 *
 * 20260912120000 made Wall Volume answer to the room inputs, which it had to,
 * but it did so by re-deriving the masonry from scratch (perimeter + partitions
 * at real wall thicknesses). That threw away the sheet's own 0.36 m³-per-m³
 * allowance and with it every number the starter template is supposed to
 * reproduce — a reference estimate came out at 32,097 bricks instead of the
 * sheet's 126,315.7895.
 *
 * So: keep the allowance, and let the room count adjust it. The room factor is
 * exactly 1 at the five rooms the 0.36 was calibrated on, so a reference
 * estimate is bit-for-bit what it always was; it rises as the plan is cut into
 * more rooms and falls to 0.768 × for a single undivided space.
 *
 * Either predecessor is accepted — the original blanket formula (for a tenant
 * who never ran 20260912120000) and the geometric one (for a tenant who did) —
 * so this lands the same way from either state. As there, only rows carrying
 * one of those two verbatim are touched, and only where all four room
 * parameters exist and are active for that tenant.
 */

const NIL_UUID = "'00000000-0000-0000-0000-000000000000'::uuid";

const BLANKET_FORMULA = "total_area * ceiling_height * 0.36 * project_type";
const BLANKET_DESCRIPTION = "Masonry volume allowance: 0.36 m³ of wall per m³ of built volume, per storey.";

const GEOMETRIC_FORMULA =
  "(4.1 * sqrt(total_area) * 0.23 + 2 * max(sqrt(bedrooms + bathrooms + kitchen + halls) - 1, 0) * sqrt(total_area) * 0.115) * ceiling_height * project_type";
const GEOMETRIC_DESCRIPTION =
  "Perimeter walls (4.1 × √area at 230 mm) plus the partitions that divide the floor into its rooms (115 mm), × ceiling height, per storey.";

const CALIBRATED_FORMULA =
  "total_area * ceiling_height * 0.36 * project_type * (1 - 0.232 * (1 - max(sqrt(bedrooms + bathrooms + kitchen + halls) - 1, 0) / (sqrt(5) - 1)))";
const CALIBRATED_DESCRIPTION =
  "0.36 m³ of wall per m³ of built volume, per storey, adjusted for how many rooms the floor is divided into — exactly 0.36 for a 5-room plan, more as rooms are added, 0.768 × that for one undivided space.";

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

/**
 * Move every wall_volume still carrying one of `from` (a list of
 * [formula, description] pairs) onto `to`. A description is only rewritten when
 * it is still the one that shipped with the formula it sat next to.
 */
async function swapFormula(queryInterface, from, [toFormula, toDescription]) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes("estimate_parameter")) {
    return;
  }

  const replacements = { toFormula, toDescription };
  const formulaMatches = [];
  const descriptionCases = [];

  from.forEach(([formula, description], index) => {
    replacements[`formula${index}`] = formula;
    replacements[`description${index}`] = description;
    formulaMatches.push(`${squashed("p.formula")} = ${squashed(`:formula${index}`)}`);
    descriptionCases.push(
      `WHEN ${squashed("p.description")} = ${squashed(`:description${index}`)} THEN :toDescription`,
    );
  });

  await queryInterface.sequelize.query(
    `UPDATE estimate_parameter p
        SET formula = :toFormula,
            description = CASE ${descriptionCases.join(" ")} ELSE p.description END,
            updated_at = CURRENT_TIMESTAMP
      WHERE p.variable = 'wall_volume'
        AND p.input_type = 'formula'
        AND (${formulaMatches.join(" OR ")})
        AND ${ROOM_PARAMETERS_PRESENT}`,
    { replacements },
  );
}

export async function up(queryInterface) {
  await swapFormula(
    queryInterface,
    [
      [BLANKET_FORMULA, BLANKET_DESCRIPTION],
      [GEOMETRIC_FORMULA, GEOMETRIC_DESCRIPTION],
    ],
    [CALIBRATED_FORMULA, CALIBRATED_DESCRIPTION],
  );
}

/** Back to where 20260912120000 left things, since that migration rolls back on its own. */
export async function down(queryInterface) {
  await swapFormula(
    queryInterface,
    [[CALIBRATED_FORMULA, CALIBRATED_DESCRIPTION]],
    [GEOMETRIC_FORMULA, GEOMETRIC_DESCRIPTION],
  );
}

export default { up, down };
