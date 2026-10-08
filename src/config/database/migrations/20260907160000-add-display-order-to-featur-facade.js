"use strict";

/**
 * Give the landing page's facade carousel a running order.
 *
 * The public feed had no ORDER BY at all, so the carousel showed whatever
 * Postgres handed back — usually insertion order, but nothing guaranteed it,
 * and it could change under an UPDATE with no promotion having moved. Worse,
 * that feed is paginated: LIMIT/OFFSET over an unordered query can repeat a row
 * on page 2 and drop another entirely. `display_order` fixes both, and gives the
 * admin console something to sort by hand.
 *
 * One sequence across the whole table, not one per builder. The carousel is a
 * single strip on inBuildify's own front page, so position 1 is position 1.
 */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("featur_facade");

  if (!table.display_order) {
    await queryInterface.addColumn("featur_facade", "display_order", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  }

  // Newest promotion first, which is the order a carousel is usually wanted in
  // and the only defensible guess — there is no existing order to preserve.
  // Soft-deleted rows are numbered too, so nothing sits on 0 waiting to jump to
  // the front if it is ever restored.
  const [numbered] = await queryInterface.sequelize.query(`
    UPDATE featur_facade ff
       SET display_order = seq.position
      FROM (
        SELECT featur_facade_id,
               ROW_NUMBER() OVER (
                 ORDER BY is_delete ASC, created_at DESC, featur_facade_id
               )::int AS position
          FROM featur_facade
      ) seq
     WHERE ff.featur_facade_id = seq.featur_facade_id
       AND ff.display_order = 0
    RETURNING ff.featur_facade_id
  `);

  await queryInterface.addIndex("featur_facade", ["display_order"], {
    name: "featur_facade_display_order_idx",
  });

  console.log(
    `[add-display-order-to-featur-facade] numbered ${numbered?.length || 0} promotion(s)`,
  );
}

export async function down(queryInterface) {
  await queryInterface.removeIndex("featur_facade", "featur_facade_display_order_idx");
  await queryInterface.removeColumn("featur_facade", "display_order");
}
