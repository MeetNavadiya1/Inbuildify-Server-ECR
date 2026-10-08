"use strict";

/**
 * Let two people in the same company each hold their own seeded Service and
 * Lead source.
 *
 * The sample-data importer now clones per user (`targetUserScope` in
 * company-onboarding.service, `OWNER_SCOPED_MODELS` in sampleDataFlag): two
 * accounts under one company each get their own demo records, so one of them
 * clearing Settings → Sample Data cannot empty a colleague's screen. Every
 * table it writes went along with that — except these two, which the database
 * still keyed by tenant alone:
 *
 *   uq_service_builder                      (service, builder_id)
 *   lead_source_company_id_builder_id_name  (company_id, builder_id, name)
 *
 * So the second import into a company found nothing under its own owner id,
 * inserted, and hit the tenant-wide key. Postgres raised 23505, which Sequelize
 * reports as a UniqueConstraintError whose message is the bare string
 * "Validation error" — the whole transaction rolled back and POST /user
 * answered 500 "Validation error" with nothing in it to say which table or
 * which name. Creating a user failed outright whenever the person creating them
 * held sample data of their own.
 *
 * The owner joins the key, exactly as it already does on `drive`
 * (drive_folder_active_unique, see 20260811120000). NULL — every row a builder
 * actually typed in — folds to one bucket, so their own rows keep precisely the
 * uniqueness they had; only seeded rows belonging to different accounts are
 * allowed to share a name.
 *
 * No dedupe pass is needed: the new key is the old key plus a column, so
 * anything the old index accepted the new one accepts too.
 */

/** Stands in for NULL in the key — in SQL, NULL never equals NULL. */
const NIL = "'00000000-0000-0000-0000-000000000000'::uuid";

const OWNER = `(COALESCE("sample_data_owner_id", ${NIL}))`;

const INDEXES = [
  {
    table: "service",
    oldName: "uq_service_builder",
    newName: "uq_service_builder_sample_owner",
    oldColumns: "\"service\", \"builder_id\"",
    newColumns: `"service", "builder_id", ${OWNER}`,
  },
  {
    table: "lead_source",
    oldName: "lead_source_company_id_builder_id_name",
    newName: "lead_source_company_builder_name_sample_owner",
    oldColumns: "\"company_id\", \"builder_id\", \"name\"",
    newColumns: `"company_id", "builder_id", "name", ${OWNER}`,
  },
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const TAG = "[scope-sample-master-uniques-by-owner]";
  const { sequelize } = queryInterface;

  const transaction = await sequelize.transaction();
  try {
    for (const index of INDEXES) {
      await sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${index.newName} ON "${index.table}" (${index.newColumns});`,
        { transaction },
      );
      // Only after the replacement is in place, so the table is never briefly
      // unguarded.
      await sequelize.query(`DROP INDEX IF EXISTS ${index.oldName};`, { transaction });
      console.log(`${TAG} ${index.table}: ${index.oldName} → ${index.newName}`);
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export async function down(queryInterface) {
  const { sequelize } = queryInterface;

  const transaction = await sequelize.transaction();
  try {
    for (const index of INDEXES) {
      // Going back narrows the key, so a company holding per-owner copies of a
      // seeded name cannot take the old index. Say that plainly rather than let
      // Postgres report a bare constraint violation on an index nobody asked
      // about — the copies have to be cleared from Settings → Sample Data first.
      const [duplicates] = await sequelize.query(
        `SELECT count(*)::int AS extra FROM (
           SELECT 1 FROM "${index.table}"
            GROUP BY ${index.oldColumns}
           HAVING count(*) > 1
         ) g;`,
        { transaction },
      );
      const extra = duplicates?.[0]?.extra ?? 0;
      if (extra > 0) {
        throw new Error(
          `Cannot restore ${index.oldName}: ${extra} group(s) in "${index.table}" ` +
          "hold per-owner sample copies that share the old key.",
        );
      }

      await sequelize.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${index.oldName} ON "${index.table}" (${index.oldColumns});`,
        { transaction },
      );
      await sequelize.query(`DROP INDEX IF EXISTS ${index.newName};`, { transaction });
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
