"use strict";

/**
 * Suppliers and surveyors get a Country, like every other address in the app.
 *
 * Their forms used to offer only the (Australian) states, so the country was
 * implied. With India supported the form has a Country field, and the country
 * has to be stored: a state id alone cannot bring the right Country back when
 * the record is edited, and `locationGuard` can only check that a state belongs
 * to its country when both are on the row.
 *
 * Existing rows — and estates, which have had the column all along but whose
 * form never filled it — are backfilled from their state's country, so every
 * record reopens with the country it was saved under.
 *
 * Guarded with describeTable so a database whose columns were already created
 * by sequelize.sync() is left as it is.
 */

const TABLES = ["supplier", "surveyor"];

export async function up(queryInterface, Sequelize) {
  for (const table of TABLES) {
    const columns = await queryInterface.describeTable(table);
    if (!columns.country_id) {
      await queryInterface.addColumn(table, "country_id", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "country", key: "country_id" },
        onDelete: "SET NULL",
      });
    }
  }

  for (const table of [...TABLES, "estate"]) {
    await queryInterface.sequelize.query(
      `UPDATE "${table}" AS t
          SET country_id = s.country_id
         FROM state AS s
        WHERE t.state_id = s.state_id
          AND t.country_id IS NULL`,
    );
  }
}

export async function down(queryInterface) {
  for (const table of TABLES) {
    const columns = await queryInterface.describeTable(table);
    if (columns.country_id) {
      await queryInterface.removeColumn(table, "country_id");
    }
  }
}

export default { up, down };
