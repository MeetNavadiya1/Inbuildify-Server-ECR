"use strict";

/**
 * Turn the drive activity log into an audit trail.
 *
 * The table already records who did what to which file and when. What it cannot
 * answer is the question an audit is actually for: *what changed*. "RENAME" with
 * the new name tells you nothing about what the document used to be called, and
 * an administrator turning editing off left no entry at all — only a timestamp
 * on `drive_files`, which the next change overwrites.
 *
 * Three columns close that:
 *
 *   old_value / new_value — the before and after, as text. Text rather than a
 *     typed column because the same log carries a file name, a boolean, a folder
 *     and a size; the reader wants to see them, not compute on them.
 *   actor_role — the role the user held *at the time*. Joining to their current
 *     role would rewrite history every time somebody is promoted, and "who was
 *     allowed to do this, then?" is precisely what an audit gets asked.
 *
 * All nullable: rows written before this migration have no before-and-after to
 * recover, and inventing one would be worse than leaving it blank.
 */

const TABLE = "drive_activity_logs";

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(TABLE)) return;

  const columns = await queryInterface.describeTable(TABLE);

  if (!columns["old_value"]) {
    await queryInterface.addColumn(TABLE, "old_value", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }

  if (!columns["new_value"]) {
    await queryInterface.addColumn(TABLE, "new_value", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }

  if (!columns["actor_role"]) {
    await queryInterface.addColumn(TABLE, "actor_role", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  }

  // `details` is a STRING (varchar 255) and now carries a sentence describing
  // the change. TEXT so a long one is not truncated at the boundary.
  if (columns["details"] && String(columns["details"].type).toUpperCase().includes("CHARACTER VARYING")) {
    await queryInterface.changeColumn(TABLE, "details", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }

  // The document drawer reads one file's history newest-first. Without this it
  // is a sequential scan of every activity row in the tenant to build a list of
  // a dozen.
  const indexes = await queryInterface.showIndex(TABLE);
  if (!indexes.some((index) => index.name === "drive_activity_logs_entity_created_idx")) {
    await queryInterface.addIndex(TABLE, {
      name: "drive_activity_logs_entity_created_idx",
      fields: ["entity_id", "created_at"],
    });
  }
}

export async function down(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes(TABLE)) return;

  const indexes = await queryInterface.showIndex(TABLE);
  if (indexes.some((index) => index.name === "drive_activity_logs_entity_created_idx")) {
    await queryInterface.removeIndex(TABLE, "drive_activity_logs_entity_created_idx");
  }

  const columns = await queryInterface.describeTable(TABLE);
  for (const column of ["actor_role", "new_value", "old_value"]) {
    if (columns[column]) await queryInterface.removeColumn(TABLE, column);
  }

  // `details` is left as TEXT: narrowing it back could truncate rows written
  // while this migration was applied, and a wider column harms nothing.
  void Sequelize;
}
