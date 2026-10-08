"use strict";

/**
 * Job-process task assignees are now Roles instead of Users.
 * This migration repoints the assignee_id foreign key from `users` to `role`.
 *
 * @type {import('sequelize-cli').Migration}
 */
const FK_NAME = "job_process_task_assignee_id_fkey";

// Drops every foreign-key constraint defined on job_process_task.assignee_id,
// whatever it is named, so the column can be repointed cleanly.
async function dropForeignKeysOnAssignee(queryInterface) {
  await queryInterface.sequelize.query(`
    DO $$
    DECLARE
      con record;
    BEGIN
      FOR con IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a
          ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'job_process_task'::regclass
          AND c.contype = 'f'
          AND a.attname = 'assignee_id'
      LOOP
        EXECUTE format('ALTER TABLE job_process_task DROP CONSTRAINT %I', con.conname);
      END LOOP;
    END $$;
  `);
}

export async function up(queryInterface) {
  // Drop ANY existing foreign key on assignee_id (regardless of its name)
  // FIRST, so the remap below is not rejected by the old users-FK while the
  // column temporarily holds role ids.
  await dropForeignKeysOnAssignee(queryInterface);

  // Preserve intent: remap any existing user-based assignee to that user's role.
  await queryInterface.sequelize.query(`
    UPDATE job_process_task t
    SET assignee_id = u.role_id
    FROM users u
    WHERE t.assignee_id = u.users_id;
  `);

  // Clear any leftover assignee_id that does not match an existing role
  // (so the new foreign key can be added cleanly).
  await queryInterface.sequelize.query(`
    UPDATE job_process_task
    SET assignee_id = NULL
    WHERE assignee_id IS NOT NULL
      AND assignee_id NOT IN (SELECT role_id FROM role);
  `);

  // Add the new FK (assignee_id -> role)
  await queryInterface.addConstraint("job_process_task", {
    fields: ["assignee_id"],
    type: "foreign key",
    name: FK_NAME,
    references: { table: "role", field: "role_id" },
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
  });
}

export async function down(queryInterface) {
  // Drop the role FK (and any other FK on the column)
  await dropForeignKeysOnAssignee(queryInterface);

  // Role ids cannot be mapped back to a specific user, so clear assignees
  // before restoring the original users foreign key.
  await queryInterface.sequelize.query(`
    UPDATE job_process_task SET assignee_id = NULL WHERE assignee_id IS NOT NULL;
  `);

  // Restore the original FK (assignee_id -> users)
  await queryInterface.addConstraint("job_process_task", {
    fields: ["assignee_id"],
    type: "foreign key",
    name: FK_NAME,
    references: { table: "users", field: "users_id" },
    onDelete: "SET NULL",
    onUpdate: "CASCADE",
  });
}
