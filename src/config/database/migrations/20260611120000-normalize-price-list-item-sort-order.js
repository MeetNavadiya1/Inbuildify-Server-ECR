/**
 * Normalizes price_list_item.sort_order to be 1-based and contiguous within
 * each (company_id, builder_id, price_list_id) group.
 *
 * Background: seeded system items (e.g. "Compaction Report Charge") were created
 * without an explicit sort_order and fell back to the model default of 0, while
 * service-created items start at 1. That left groups with non-contiguous orders
 * like [0, 1], which collapsed the update validator's allowed range to "1 to 1".
 *
 * This renumbers each group to 1, 2, 3 ... ordered by the existing sort_order
 * (ties broken by created_at) so the relative order is preserved.
 *
 * @type {import('sequelize-cli').Migration}
 */
export default {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `
        WITH ranked AS (
          SELECT
            price_list_item_id,
            ROW_NUMBER() OVER (
              PARTITION BY company_id, builder_id, price_list_id
              ORDER BY sort_order ASC, created_at ASC
            ) AS new_order
          FROM price_list_item
        )
        UPDATE price_list_item AS pli
        SET sort_order = ranked.new_order
        FROM ranked
        WHERE pli.price_list_item_id = ranked.price_list_item_id
          AND pli.sort_order <> ranked.new_order;
        `,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  // Renumbering is not reversibly mappable to the prior (arbitrary) values, so
  // down is a no-op — the 1-based ordering is the correct state.
  async down() {
    /* no-op */
  },
};
