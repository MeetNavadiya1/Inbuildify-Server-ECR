"use strict";

/**
 * Featuring a facade becomes a request, not a publish.
 *
 * "Feature this facade" in the CRM wrote a row that the landing feed picked up
 * on its next read — a builder could put whatever they liked on the public site
 * with nobody at the platform seeing it first. The promotion now waits on the
 * admin console: `approval_status` gates the public feed, and only an admin
 * moves it off `pending`.
 *
 * Existing rows are backfilled to `approved` deliberately. They are already
 * live on the site, and defaulting them to pending would pull every current
 * promotion down the moment this ran.
 */
export async function up(queryInterface, Sequelize) {
  const table = await queryInterface.describeTable("featur_facade");

  if (!table.approval_status) {
    await queryInterface.addColumn("featur_facade", "approval_status", {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: "pending",
    });
  }

  if (!table.reviewed_at) {
    await queryInterface.addColumn("featur_facade", "reviewed_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  }

  if (!table.reviewed_by) {
    await queryInterface.addColumn("featur_facade", "reviewed_by", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "platform_user", key: "platform_user_id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  }

  if (!table.review_note) {
    await queryInterface.addColumn("featur_facade", "review_note", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }

  // Everything that predates the queue was published without review; it stays
  // published. Orphans and soft-deletes are left pending — they are not on the
  // site either way, and marking them approved would resurrect them if the
  // facade ever came back.
  const [backfilled] = await queryInterface.sequelize.query(`
    UPDATE featur_facade
       SET approval_status = 'approved',
           reviewed_at = COALESCE(reviewed_at, created_at)
     WHERE approval_status = 'pending'
       AND is_delete = false
       AND facade_id IS NOT NULL
    RETURNING featur_facade_id
  `);

  await queryInterface.addIndex("featur_facade", ["approval_status"], {
    name: "featur_facade_approval_status_idx",
  });

  console.log(
    `[add-approval-to-featur-facade] grandfathered ${backfilled?.length || 0} live promotion(s) as approved`,
  );
}

export async function down(queryInterface) {
  await queryInterface.removeIndex("featur_facade", "featur_facade_approval_status_idx");
  await queryInterface.removeColumn("featur_facade", "review_note");
  await queryInterface.removeColumn("featur_facade", "reviewed_by");
  await queryInterface.removeColumn("featur_facade", "reviewed_at");
  await queryInterface.removeColumn("featur_facade", "approval_status");
}
