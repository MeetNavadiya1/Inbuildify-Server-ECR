"use strict";

/**
 * Rewrite the terms tokens that the public route can never accept.
 *
 * `publicTokenParamsSchema` takes exactly 32 hex characters — the shape
 * `newPublicToken` mints — and answers "Invalid terms link." to anything else
 * before the token reaches the database. The sample-data importer minted
 * `randomUUID()` instead: 36 characters with four dashes. Every link it wrote
 * was therefore refused on sight, however valid the document behind it was.
 *
 * The importer now uses the shared generator, which fixes new imports. The rows
 * it already wrote still hold an unusable token, and nothing rewrites one on its
 * own: the token is minted at insert and never touched again, so those links
 * stay broken until they are replaced here.
 *
 * Rewriting a public token invalidates any copy of that link already in
 * circulation. That is the right trade here and costs nothing in practice — the
 * links being replaced are precisely the ones that have never worked. Rows whose
 * token is already the right shape are left strictly alone, so no link a
 * customer holds is touched.
 *
 * `md5(...)` of a per-row volatile value gives 32 hex characters, the same shape
 * and the same space as the CSPRNG the application uses. Not a substitute for it
 * — a token minted by the application must stay CSPRNG-backed — but this is a
 * one-off repair of tokens nobody has ever been able to use.
 */

/** Anything that is not exactly 32 lowercase hex characters. */
const MALFORMED = "public_token !~ '^[0-9a-f]{32}$'";

const FRESH_TOKEN = "md5(gen_random_uuid()::text || clock_timestamp()::text)";

const TABLES = ["quotation_terms", "quotation_version_terms"];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  const existing = await queryInterface.showAllTables();
  const { sequelize } = queryInterface;

  for (const table of TABLES) {
    if (!existing.includes(table)) continue;

    const [rows] = await sequelize.query(`
      UPDATE ${table}
         SET public_token = ${FRESH_TOKEN},
             updated_at = CURRENT_TIMESTAMP
       WHERE ${MALFORMED}
      RETURNING public_token
    `);

    if (rows.length > 0) {
      console.log(
        `[repair-quotation-terms-public-tokens] ${table}: reissued ${rows.length} token(s) ` +
        "that the public terms route could not accept.",
      );
    }
  }
}

/**
 * Nothing to undo. The old tokens were unusable by definition — the route
 * refused them — so there is no state worth restoring and no way to restore it:
 * the values they replaced are not recorded anywhere.
 */
export async function down() {
  // Intentionally empty.
}

export default { up, down };
