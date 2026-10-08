"use strict";

export default {
  // Legacy rows stored the dollar amount in the `cost` column — which on a
  // variation row is only a label (Material / Labor …) — while `price` was left
  // at 0, so Price/Total rendered $0.00 and the variation amount summed to $0.
  // Recover the numeric amount into `price`, default a zero/blank quantity to 1
  // so the line's value isn't lost, recompute `total`, and clear the
  // mislabelled `cost`. Only rows whose `cost` is a plain number and whose
  // `price` is empty are touched, so genuine label costs are left alone.
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(`
      UPDATE job_variation_item
      SET
        price    = cost::numeric,
        quantity = GREATEST(COALESCE(quantity, 0), 1),
        total    = cost::numeric * GREATEST(COALESCE(quantity, 0), 1),
        cost     = NULL
      WHERE cost ~ '^[0-9]+(\\.[0-9]+)?$'
        AND (price IS NULL OR price = 0);
    `);
  },

  // Irreversible data correction: the original field split can't be
  // reconstructed once merged, so undo is a no-op.
  down: async () => {},
};
