import { runSampleDataMaintenance } from "../config/database/models/postgre-models/sampleDataFlag.js";

/**
 * Let a builder claim a name that a seeded demo row is holding.
 *
 * Master tables are unique on (company_id, builder_id, name), so when someone
 * types a name a demo row already occupies there is no way to insert a second
 * row — the index rejects it before any service check would. Answering
 * "already exists" is wrong here too: from the builder's point of view that
 * name is not theirs yet, it belongs to demo data they never created. In
 * practice most companies hold no real lead source, range or dwelling type at
 * all, so every obvious name they reach for is one a demo row is sitting on.
 *
 * So the demo row is handed over rather than duplicated or refused. The flag is
 * cleared and it becomes an ordinary record the builder owns. Deliberately kept:
 *
 *   - the primary key, so demo records already pointing at it stay valid and
 *     nothing has to be re-linked;
 *   - the row's position in the list, since the caller is naming a value, not
 *     reordering the list.
 *
 * Once adopted the row is no longer swept by Settings → Sample Data, which is
 * the point — the builder said it is theirs.
 */
export async function adoptSampleRow(row, fields, transaction) {
  // Seeded rows are read-only to the application, and adoption is a write to
  // one — the very write that ends its seeded life. It has to run inside the
  // maintenance context or it would be refused by the guard it is escaping.
  return runSampleDataMaintenance(async () => {
    await row.update({ ...fields, is_sample_data: false }, { transaction });
    return row;
  });
}

/** True when this row came from the sample-data importer. */
export const isSampleRow = (row) => row?.is_sample_data === true;

export default adoptSampleRow;
