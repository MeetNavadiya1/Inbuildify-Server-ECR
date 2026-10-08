"use strict";

/**
 * Per-job checklist items — the storage behind the job header's "DA Checklist"
 * drawer.
 *
 * The builder-level master already exists (`checklist` + `checklist_item`,
 * Settings → General → Checklist) but it is a TEMPLATE: it defines what to ask,
 * not what a given job answered. This table is the per-job instance and carries
 * both halves:
 *
 *   definition — description / notes / is_required / type / sort, copied from
 *                the master item when applied from a template, or typed
 *                straight into the drawer for an ad-hoc item.
 *   response   — response / note / is_completed / completed_by / completed_at,
 *                which is what the All / Pending / Completed tabs count.
 *
 * checklist_id + checklist_item_id stay nullable: they record the master row an
 * item was seeded from (so the same template is never applied twice), and are
 * simply null for ad-hoc items.
 */

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const tables = await queryInterface.showAllTables();
  if (tables.includes("job_checklist_item")) return;

  await queryInterface.createTable("job_checklist_item", {
    job_checklist_item_id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal("gen_random_uuid()"),
      primaryKey: true,
    },
    job_id: {
      type: Sequelize.UUID,
      allowNull: false,
      references: { model: "job", key: "job_id" },
      onDelete: "CASCADE",
    },
    builder_id: { type: Sequelize.UUID, allowNull: true },
    company_id: { type: Sequelize.UUID, allowNull: true },
    // Master rows this item was seeded from — null for ad-hoc items.
    checklist_id: { type: Sequelize.UUID, allowNull: true },
    checklist_item_id: { type: Sequelize.UUID, allowNull: true },
    // ── definition (mirrors checklist_item) ──
    description: { type: Sequelize.STRING(500), allowNull: false },
    notes: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    is_required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    type: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "checkbox" },
    sort: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
    // ── response ──
    // checkbox → "checked"; dropdown → "Yes" | "No" | "N/A"; null = unanswered.
    response: { type: Sequelize.STRING(20), allowNull: true },
    note: { type: Sequelize.TEXT, allowNull: true },
    is_completed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    completed_by: { type: Sequelize.UUID, allowNull: true },
    completed_at: { type: Sequelize.DATE, allowNull: true },
    created_by: { type: Sequelize.UUID, allowNull: true },
    updated_by: { type: Sequelize.UUID, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
  });

  await queryInterface.addIndex("job_checklist_item", ["job_id", "sort"], {
    name: "job_checklist_item_job_sort_idx",
  });

  // One instance per master item per job — makes "apply template" idempotent.
  await queryInterface.addIndex("job_checklist_item", ["job_id", "checklist_item_id"], {
    name: "job_checklist_item_job_master_uniq",
    unique: true,
    where: { checklist_item_id: { [Sequelize.Op.ne]: null } },
  });
}

export async function down(queryInterface) {
  await queryInterface.dropTable("job_checklist_item");
}
