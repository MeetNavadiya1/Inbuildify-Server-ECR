"use strict";

/**
 * Mirror builder_id / company_id onto the job-specific workflow tables so they
 * can be tenant-scoped and managed directly (filtered without walking the
 * job -> stage chain), the same way the `job` and `job_process_stage` tables do.
 *
 * @type {import('sequelize-cli').Migration}
 */

const TENANT_TABLES = ["job_sub_stage", "job_task", "job_subtask"];

export async function up(queryInterface, Sequelize) {
  for (const tbl of TENANT_TABLES) {
    const table = await queryInterface.describeTable(tbl);

    if (!table.builder_id) {
      await queryInterface.addColumn(tbl, "builder_id", {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }

    if (!table.company_id) {
      await queryInterface.addColumn(tbl, "company_id", {
        type: Sequelize.UUID,
        allowNull: true,
      });
    }

    await queryInterface.addIndex(tbl, ["company_id", "builder_id"], {
      name: `idx_${tbl}_company_builder`,
    });
  }
}

export async function down(queryInterface) {
  for (const tbl of TENANT_TABLES) {
    await queryInterface.removeIndex(tbl, `idx_${tbl}_company_builder`);
    await queryInterface.removeColumn(tbl, "builder_id");
    await queryInterface.removeColumn(tbl, "company_id");
  }
}
