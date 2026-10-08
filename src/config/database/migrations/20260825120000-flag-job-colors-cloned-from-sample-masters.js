"use strict";

/**
 * Flags the job colour trees that were copied out of a SEEDED master colour.
 *
 * The earlier backfill (20260806140100) reached the job colour tables through
 * `job_id`, which flags the colours of a seeded JOB. That is only half of where
 * demo colour content ends up. The other half is the ordinary case: a real job,
 * belonging to a builder who has not built their own Settings → Colour
 * catalogue yet, gets that catalogue copied into `job_color` the first time
 * somebody opens its colour page. Every one of those rows is demo content, and
 * every one of them carried `is_sample_data = false` — so the colour screens
 * badged nothing, and the builder had no way to tell the demo selections apart
 * from their own.
 *
 * `job_color.template_color_id` is the only link back to the master, so it is
 * what the top of the tree is judged by; the rest of the tree carries no
 * pointer of its own and is reached by walking down from the colour, which is
 * how the copy was made in the first place.
 *
 * Deliberately not guessed anywhere:
 *
 *   - a copy whose `template_color_id` is still null is LEFT ALONE. Matching it
 *     to a master by name would be a guess, and mis-flagging a builder's own
 *     colour is worse than badging nothing. `ensureJobColorsCloned` self-heals
 *     that pointer from a name match on the next page load and reconciles the
 *     flag there, where the match is the service's decision rather than this
 *     migration's.
 *   - `job_color_selection` is untouched. A selection is what the customer
 *     actually chose; the catalogue it was chosen from being demo content does
 *     not make the choice demo content.
 *
 * Order matters: each statement reads the flags the statement before it set.
 */
const STATEMENTS = [
  // The copy's master is seeded — the one place a pointer back to it exists.
  `UPDATE "job_color" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "template_color_id" IN (SELECT "color_id" FROM "color" WHERE "is_sample_data" = true)`,

  `UPDATE "job_color_category" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "color_id" IN (SELECT "color_id" FROM "job_color" WHERE "is_sample_data" = true)`,

  `UPDATE "job_color_sub_category" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "color_category_id" IN (
         SELECT "color_category_id" FROM "job_color_category" WHERE "is_sample_data" = true
       )`,

  // `job_color_item` carries `color_id` itself, so it is reachable from the
  // colour directly — including any item whose category row went missing.
  `UPDATE "job_color_item" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "color_id" IN (SELECT "color_id" FROM "job_color" WHERE "is_sample_data" = true)`,

  `UPDATE "job_color_item_custom_field" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "color_item" IN (SELECT "color_item_id" FROM "job_color_item" WHERE "is_sample_data" = true)`,

  `UPDATE "job_color_group_item_map" SET "is_sample_data" = true
     WHERE "is_sample_data" = false
       AND "color_item_id" IN (SELECT "color_item_id" FROM "job_color_item" WHERE "is_sample_data" = true)`,
];

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface) {
  for (const sql of STATEMENTS) {
    await queryInterface.sequelize.query(sql);
  }
}

export async function down() {
  // Not reversible: there is no record of which rows read false beforehand, and
  // clearing the flag by the same walk would also clear the rows the earlier
  // job-side backfill (20260806140100) set.
}
