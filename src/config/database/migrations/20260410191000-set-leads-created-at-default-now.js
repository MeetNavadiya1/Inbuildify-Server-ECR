"use strict";

export default {
  async up(queryInterface) {
    const tableExists = await queryInterface.tableExists("leads");
    if (!tableExists) return;

    await queryInterface.sequelize.query(`
      UPDATE leads
      SET created_at = CURRENT_TIMESTAMP
      WHERE created_at IS NULL;
    `);

    await queryInterface.sequelize.query(`
      UPDATE leads
      SET updated_at = CURRENT_TIMESTAMP
      WHERE updated_at IS NULL;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE leads
      ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
      ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE leads ALTER COLUMN created_at SET NOT NULL;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE leads ALTER COLUMN updated_at SET NOT NULL;
    `);
  },

  async down(queryInterface) {
    const tableExists = await queryInterface.tableExists("leads");
    if (!tableExists) return;

    await queryInterface.sequelize.query(`
      ALTER TABLE leads
      ALTER COLUMN created_at DROP NOT NULL,
      ALTER COLUMN updated_at DROP NOT NULL;
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE leads
      ALTER COLUMN created_at DROP DEFAULT,
      ALTER COLUMN updated_at DROP DEFAULT;
    `);
  },
};
