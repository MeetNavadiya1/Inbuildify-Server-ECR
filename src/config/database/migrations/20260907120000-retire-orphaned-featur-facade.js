'use strict';

/**
 * Retires promotions orphaned by a facade delete.
 *
 * `featur_facade.facade_id` is ON DELETE SET NULL and facade deletes are hard,
 * so every facade removed before deleteMasterFacadeService started retiring its
 * promotions left a row behind pointing at nothing — some still is_active with
 * is_delete = false. This closes out the backlog; the service change prevents
 * new ones.
 *
 * Rows are soft-deleted, not removed: featured_facade_lead cascades from
 * featur_facade, and the leads captured against these promotions are still real.
 *
 * @type {import('sequelize-cli').Migration}
 */
export default {
  up: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      await queryInterface.sequelize.query(
        `UPDATE featur_facade
            SET is_delete = true,
                is_active = false,
                updated_at = NOW()
          WHERE facade_id IS NULL
            AND (is_delete = false OR is_active = true)`,
        { transaction },
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async () => {
    // Not reversible: the pre-migration is_delete/is_active values are not
    // recorded anywhere, and reviving a promotion whose facade no longer exists
    // would put an orphan back on the admin list.
  },
};
