"use strict";

/**
 * A builder configures two progress payment schedules, not one: the building
 * contract's Payment Method radio picks between them, and until now both
 * methods loaded the same stages.
 *
 * Existing rows become Method 1 — that is the schedule they were entered as,
 * back when there was only one.
 */
export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("job_invoice_stage_payments");
  if (tableInfo.method) return;

  await queryInterface.addColumn("job_invoice_stage_payments", "method", {
    type: Sequelize.STRING(20),
    allowNull: false,
    defaultValue: "method1",
  });

  // sort_order is a per-schedule sequence, so it is only unique within a
  // method — this index is what the ordering reads.
  await queryInterface.addIndex(
    "job_invoice_stage_payments",
    ["job_invoice_settings_id", "method", "sort_order"],
    { name: "job_invoice_stage_payments_settings_method_sort_idx" }
  );
}

export async function down(queryInterface) {
  await queryInterface.removeIndex(
    "job_invoice_stage_payments",
    "job_invoice_stage_payments_settings_method_sort_idx"
  );
  await queryInterface.removeColumn("job_invoice_stage_payments", "method");
}
