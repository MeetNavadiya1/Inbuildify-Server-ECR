"use strict";

export async function up(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes("supplier")) return;

  const table = await queryInterface.describeTable("supplier");

  // Added nullable so the backfill has somewhere to land before the constraint
  // goes on — adding it NOT NULL outright fails on the first existing row.
  if (!table.email) {
    await queryInterface.addColumn("supplier", "email", {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  }

  if (table.emails) {
    await queryInterface.sequelize.query(`
      UPDATE supplier
         SET email = COALESCE(emails[1], '')
       WHERE email IS NULL
    `);
  }

  // Catches rows added between the two statements above, and any row that was
  // already carrying a NULL `email` from a half-finished earlier run.
  await queryInterface.sequelize.query(`
    UPDATE supplier SET email = '' WHERE email IS NULL
  `);

  await queryInterface.changeColumn("supplier", "email", {
    type: Sequelize.STRING(255),
    allowNull: false,
  });

  if (table.emails) {
    await queryInterface.removeColumn("supplier", "emails");
  }
}

export async function down(queryInterface, Sequelize) {
  const existing = await queryInterface.showAllTables();
  if (!existing.includes("supplier")) return;

  const table = await queryInterface.describeTable("supplier");

  if (!table.emails) {
    await queryInterface.addColumn("supplier", "emails", {
      type: Sequelize.ARRAY(Sequelize.TEXT),
      allowNull: true,
    });
  }

  if (table.email) {
    // The blanks written on the way up were never addresses, so they go back to
    // NULL rather than becoming an array holding one empty string.
    await queryInterface.sequelize.query(`
      UPDATE supplier
         SET emails = CASE
           WHEN email IS NULL OR email = '' THEN NULL
           ELSE ARRAY[email]
         END
       WHERE emails IS NULL
    `);

    await queryInterface.removeColumn("supplier", "email");
  }
}

export default { up, down };
