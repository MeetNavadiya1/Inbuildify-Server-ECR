"use strict";

/**
 * A to-do had no terminal "done" state — only Pending / Confirmed / Cancelled.
 * Without it, finished work stayed Pending forever and every to-do whose dates
 * had passed kept showing under the Overdue tab, which is what the listing
 * screen was reporting.
 *
 * The todo table was not created by a migration, so the enum type name is not
 * guaranteed to be the conventional "enum_todo_status". Resolve it from the
 * catalog rather than assuming, and no-op if the column is not an enum.
 */
export default {
  up: async (queryInterface) => {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT t.typname
        FROM pg_type t
        JOIN pg_attribute a ON a.atttypid = t.oid
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relname = 'todo'
         AND a.attname = 'status'
         AND t.typtype = 'e'
         AND n.nspname = current_schema()
    `);

    const typeName = rows?.[0]?.typname;
    if (!typeName) {
      return;
    }

    await queryInterface.sequelize.query(
      `ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS 'Completed';`,
    );
  },

  down: async () => {
    // PostgreSQL does not support removing values from an ENUM type
  },
};
