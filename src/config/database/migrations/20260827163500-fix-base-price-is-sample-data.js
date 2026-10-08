"use strict";

const STATEMENTS = [
  // 1. Update Base Price PriceList to not be sample data
  `UPDATE "price_list" SET "is_sample_data" = false WHERE "name" = 'Base Price'`,

  // 2. Update all PriceListItems under "Base Price" to not be sample data
  `UPDATE "price_list_item" SET "is_sample_data" = false 
     WHERE "price_list_id" IN (SELECT "price_list_id" FROM "price_list" WHERE "name" = 'Base Price')`,

  // 3. Update all PriceListItemConditions under "Base Price" items to not be sample data
  `UPDATE "price_list_item_condition" SET "is_sample_data" = false 
     WHERE "price_list_item_id" IN (
       SELECT "price_list_item_id" FROM "price_list_item" 
       WHERE "price_list_id" IN (SELECT "price_list_id" FROM "price_list" WHERE "name" = 'Base Price')
     )`
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  for (const sql of STATEMENTS) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function down() {
  // Not reversible: we do not know which ones were true/false previously.
}
