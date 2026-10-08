"use strict";

// Earlier, the "new lead" note seeded into a job's Action timeline copied the
// lead's original create time. We now stamp it at conversion time instead.
// Re-align any previously-seeded job notes to their job's creation (conversion)
// time so existing jobs no longer show the lead-create time.
export async function up(queryInterface) {
  await queryInterface.sequelize.query(`
    UPDATE notes AS n
    SET created_at = j.created_at,
        updated_at = j.created_at
    FROM job AS j
    WHERE n.job_id = j.job_id
      AND n.description = 'new lead'
      AND n.parent_note_id IS NULL
  `);
}

export async function down() {
  // No-op: original (lead-create) timestamps are not restorable.
}
