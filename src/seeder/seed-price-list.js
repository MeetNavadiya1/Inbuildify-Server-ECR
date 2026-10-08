import db from "../config/database/models/postgre-models/index.js";

/**
 * Seed default price_list and price_list_item for a new builder
 */
export async function seedPriceList({
  company_id,
  builder_id,
  created_by,
  transaction,
}) {
  const { PriceList, PriceListItem } = db;

  // 1. Create or find "Base Price" PriceList
  const [priceList] = await PriceList.findOrCreate({
    where: {
      builder_id,
      name: "Base Price",
    },
    defaults: {
      company_id,
      builder_id,
      name: "Base Price",
      sort_order: 1,
      is_active: true,
      created_by,
    },
    transaction,
  });

  // 2. Create or find default PriceListItem for this PriceList
  await PriceListItem.findOrCreate({
    where: {
      price_list_id: priceList.price_list_id,
      item_description: "Compaction Report Charge",
    },
    defaults: {
      price_list_id: priceList.price_list_id,
      company_id,
      builder_id,
      item_description: "Compaction Report Charge",
      cost_type: "Fixed",
      cost: 250.00,
      builder_cost: 100.00,
      sort_order: 1,
      status: "active",
      created_by,
      is_system_data: true,
    },
    transaction,
  });
}

export default { seedPriceList };
