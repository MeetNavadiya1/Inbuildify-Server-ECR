/**
 * Expose the sample-data marker on every model that carries it.
 *
 * Seeded demo rows stay in every response — the UI badges them, and keeps them
 * out of the pickers shown while creating a new record. It can only do either
 * if it can tell a demo row from a real one, which means the marker has to
 * survive the trip to the client on every endpoint that returns such a row.
 *
 * Wiring that per endpoint does not hold: ~90 models carry the column and the
 * services between them use over a thousand `attributes` whitelists. Any one
 * that forgot the column would hand the UI a demo row it cannot recognise, and
 * nothing would fail loudly. So it is wired once, here, for every model that
 * has the column.
 *
 * Two things have to be true for the marker to arrive:
 *   1. the column is selected — an `attributes` whitelist that omits it means
 *      the value never leaves Postgres;
 *   2. the serialised row carries it under a camelCase key, matching the
 *      casing the hand-written responses already use (`isSampleData`).
 *
 * The same wiring carries the three rules that follow from a row being seeded:
 * it is read-only to the application, it is attributed to the person it was
 * imported for, and — for the models cloned per person — only that person sees
 * it. See `OWNER_SCOPED_MODELS` and `runAsSampleDataViewer`.
 */

import { AsyncLocalStorage } from "async_hooks";

import { Model, Op } from "sequelize";

const COLUMN = "is_sample_data";
const OWNER_COLUMN = "sample_data_owner_id";
const FLAG = "isSampleData";
const WIRED = Symbol("sampleDataFlagWired");

/**
 * The models whose seeded rows belong to one person rather than to the company.
 *
 * The importer clones these per user: two people in the same company each get
 * their own set of demo leads, jobs, diary entries and staff. That is deliberate
 * — one person clearing their sample data must not empty a colleague's screen —
 * but it means the tenant holds two copies of every demo record, and reads
 * scoped to company_id / builder_id showed both to everyone. Every card in the
 * list appeared twice, once per importer.
 *
 * So a seeded row on these models is visible only to the account it was imported
 * for. See `runAsSampleDataViewer`.
 *
 * Deliberately an allow-list rather than "everything with the owner column".
 * The Settings masters (SAMPLE_CATALOG_ENTITIES in company-onboarding.service),
 * the S Drive folder tree and the Site Check-In fields are all reused by name
 * rather than cloned — one copy per company, attributed to whoever imported
 * first — so there is nothing to hide, and hiding them would strip the lead
 * source off a colleague's demo lead and leave their demo files in a folder they
 * cannot see. A model missing from this list keeps its old behaviour; a shared
 * model wrongly added to it breaks references. The safe failure is the former.
 */
const OWNER_SCOPED_MODELS = new Set([
  "Leads",
  "Job",
  "Task",
  "Appointment",
  "Todo",
  "ActivityLog",
  "SiteCheckinRecord",
  "Users",
  // Files, but deliberately not `Drive`: the importer clones a demo file per
  // person and reuses the folder it sits in, so the file is the owned half and
  // the folder is the shared half. Owner-scoping `Drive` as well hid the bucket
  // from everyone but the first importer while their files stayed inside it —
  // and it split the folder identity in `driveFolder.helper` away from
  // `drive_folder_active_unique`, which is what made the second import into a
  // company fail outright on 23505.
  "DriveFile",
  "PriceListItem",
  "PriceList",
  "FloorPlan",
  "Facade",
  "Package",
  "PackageGroup",
  "DwellingType",
  "Range",
  "Location",
  "Color",
  "ColorGroup",
  "ColorType",
  "Supplier",
  "SupplierType",
  "StructureEngineer",
  "Estate",
  "CostCenter",
  "ContractFormat",
  "SurveyTemplate",
  "QuotationFormat",
  "JobVariationApproval",
  "WorkflowProcess",
  "Service",
  "LeadSource",
  "Holiday",
  "UserGroup",
  "MaintenanceArea",
]);

/**
 * Per-request switch for "leave the seeded rows out of this one".
 *
 * A picker on a "create new" form wants only real rows; the same endpoint
 * feeding a Settings list wants everything, so the caller decides per request
 * rather than the service hard-coding it. Async-local rather than a parameter
 * because the decision has to reach `beforeFind` through service code that
 * never sees the request.
 */
const excludeStore = new AsyncLocalStorage();

/** Run `fn` with seeded rows filtered out of every find inside it. */
export const runWithoutSampleData = (fn) => excludeStore.run(true, fn);

const excludingSampleData = () => excludeStore.getStore() === true;

/**
 * Escape hatch for the code that is *supposed* to write seeded rows.
 *
 * Seeded rows are read-only to the application, but three things must still be
 * able to write them: the importer that creates them, the purge that clears
 * them, and adoption — a builder claiming a demo row's name, which works by
 * clearing the flag. Those run inside this context; everything else is refused.
 *
 * Async-local rather than a flag threaded through every call because the guard
 * lives on the model and those code paths are dozens of calls deep.
 */
const maintenanceStore = new AsyncLocalStorage();

/** Run `fn` allowed to modify seeded rows. For the importer, purge and adoption only. */
export const runSampleDataMaintenance = (fn) => maintenanceStore.run(true, fn);

const inMaintenance = () => maintenanceStore.getStore() === true;

/**
 * The application writing a seeded row as a SIDE EFFECT of something the user
 * did to a record of their own.
 *
 * The guard exists to stop somebody editing demo content — renaming a seeded
 * supplier, repricing a seeded item. It is not meant to stop them USING the
 * demo data, which is what it was doing: adding a maintenance request to a demo
 * maintenance job bumps a counter on that job, so a create the user never
 * framed as an edit came back as "this is sample data and cannot be edited",
 * and the whole action failed. Exploring the demo dataset is the entire point of
 * shipping it.
 *
 * So the columns the application maintains on the user's behalf — a sequence, a
 * status the new child implies — are writable, while the row's own content stays
 * refused. Deliberately opt-in per call site rather than a blanket exemption:
 * each one is a place somebody decided this write is bookkeeping, not editing.
 *
 * The seeded row stays seeded either way, so Settings → Sample Data still clears
 * it along with everything else the import brought in.
 */
const sideEffectStore = new AsyncLocalStorage();

/**
 * Run `fn` allowed to write seeded rows the user is acting ON but not editing.
 *
 * Wrap the narrowest possible statement — the parent's counter bump, not the
 * whole transaction — so anything else inside it is still guarded.
 */
export const runAsSampleDataSideEffect = (fn) => sideEffectStore.run(true, fn);

const inSideEffect = () => sideEffectStore.getStore() === true;

/** Either context may write a seeded row. */
const mayWriteSeededRows = () => inMaintenance() || inSideEffect();

/**
 * "MaintenanceRequest" → "maintenance request record", for a message a builder
 * reads. Models already ending in "Record" are left alone rather than being
 * given a second one.
 */
const humanModelLabel = (name) => {
  const words = String(name || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();

  if (!words) return "record";
  return /\brecord$/.test(words) ? words : `${words} record`;
};

/**
 * Thrown when the application tries to modify a seeded row.
 *
 * The message names the record because the row being refused is often not the
 * one the user thinks they are touching. Adding a maintenance request to a demo
 * maintenance job is the clearest case: the request itself is fine, but writing
 * it bumps a counter on the seeded job, so the refusal lands on a create the
 * user never framed as an edit. "This is sample data and cannot be edited" reads
 * like a bug there; naming the maintenance record makes it obvious which thing
 * is seeded and why the whole action stopped.
 */
/**
 * Columns whose only job is to take a row out of circulation.
 *
 * `paranoid` is not used consistently here — most tables soft-delete by flipping
 * a flag of their own — so these are what a delete actually looks like on the
 * way to the database.
 */
const SOFT_DELETE_COLUMNS = new Set(["is_removed", "is_deleted", "deleted_at"]);

/** Columns every write touches, which say nothing about intent. */
const AUDIT_COLUMNS = new Set(["updated_by", "updated_at", "updatedAt"]);

/**
 * Is this `update` really a delete?
 *
 * Most delete endpoints here soft-delete — `item.update({ is_removed: true })` —
 * so they reach `beforeUpdate`, not `beforeDestroy`, and the refusal came back
 * as "cannot be edited" to somebody who had just pressed Delete. That reads as
 * the wrong error for the wrong action and sends people looking for an edit they
 * never made.
 *
 * A write counts as a delete only when the soft-delete flag is the ONLY thing it
 * changes, audit columns aside. An update that flips the flag *and* rewrites
 * content is an edit, and is described as one.
 */
const isSoftDelete = (instance) => {
  const changed = (instance.changed() || []).filter((field) => !AUDIT_COLUMNS.has(field));

  return changed.length > 0 && changed.every((field) => SOFT_DELETE_COLUMNS.has(field));
};

/** The same question for `Model.update({...}, { where })`, which has no instance. */
const isBulkSoftDelete = (options) => {
  const fields = Object.keys(options?.attributes || {}).filter(
    (field) => !AUDIT_COLUMNS.has(field),
  );

  return fields.length > 0 && fields.every((field) => SOFT_DELETE_COLUMNS.has(field));
};

const buildReadOnlyError = (label, verb, modelName) => {
  const error = new Error(
    `This ${label} is sample data and cannot be ${verb}. ` +
    "Clear it from Settings → Sample Data, or add your own record instead.",
  );
  error.statusCode = 403;
  error.model = modelName;
  error.isSampleDataReadOnly = true;
  return error;
};

const readOnlyError = (model, verb) =>
  buildReadOnlyError(humanModelLabel(model?.name), verb, model?.name);

/**
 * The same refusal, raised by a service rather than by a model hook.
 *
 * The hooks below judge the row actually being written, which misses the case
 * where the row is new and only its PARENT is seeded. Adding a line to a demo
 * quotation inserts a fresh `quotation_version_items` row under a flagged
 * `quotation_version`: that is a create, and creates are deliberately not
 * guarded (see `runAsSampleDataSideEffect`). What came back was an unflagged,
 * fully editable line item sitting on a demo quotation — not badged in the UI,
 * and swept away with its parent by the next purge.
 *
 * Creates under a seeded parent are still allowed in general — a maintenance
 * request against a demo job is somebody exploring the dataset, which is the
 * point of shipping it. This is for the narrower case where writing the child IS
 * editing the parent's content, and the only place that can tell the difference
 * is the service doing the write. Those check the parent themselves and raise
 * this.
 *
 * @param {string} label what the user is really editing, e.g. "quotation version"
 * @param {string} verb  "edited" or "deleted", to match the action they took
 */
export const sampleDataReadOnlyError = (label, verb = "edited") =>
  buildReadOnlyError(label, verb);

/**
 * Whose sample data the importer is currently writing.
 *
 * Seeded rows are scoped to the person the import was run for, not to the
 * company: everyone the Company Administrator creates shares one company_id and
 * one builder_id, so a purge keyed on the tenant alone clears the demo data out
 * from under every colleague at once. `sample_data_owner_id` is what keeps one
 * person's Settings → Sample Data from reaching another's, and it has to land on
 * every seeded row for that to hold.
 *
 * Stamped from here rather than at each insert because the importer writes
 * through eighty-odd create / bulkCreate / findOrCreate calls spread across the
 * service and two helpers — one forgotten spread would leave an unowned row that
 * no per-user purge can ever reach, and nothing would fail loudly.
 *
 * Async-local for the same reason `runSampleDataMaintenance` is: the stamp has
 * to reach a model hook through code that never sees the request.
 */
const ownerStore = new AsyncLocalStorage();

/**
 * Run `fn` with every seeded row it writes attributed to `userId`.
 *
 * Wraps the importer. Outside it nothing is stamped, so the purge and adoption —
 * which also run as maintenance — cannot re-attribute a row by touching it.
 */
export const runAsSampleDataOwner = (userId, fn) => ownerStore.run(userId || null, fn);

export const currentSampleDataOwner = () => ownerStore.getStore() || null;

/**
 * Whose eyes the current request is being answered for.
 *
 * The mirror image of `ownerStore`: that one decides who a seeded row is written
 * for, this one decides whose seeded rows are read back. Set once per request
 * from the authenticated user, and consulted by the `beforeFind` hook below for
 * every model in `OWNER_SCOPED_MODELS`.
 *
 * Null outside a request — the workers, the seeders and the importer itself run
 * with no viewer, and so see everything. That is what they need: the purge has to
 * find the rows it is clearing, and the importer has to find what it already
 * brought across.
 */
const viewerStore = new AsyncLocalStorage();

/** Run `fn` seeing only the seeded rows imported for `userId`. Set from auth. */
export const runAsSampleDataViewer = (userId, fn) => viewerStore.run(userId || null, fn);

/**
 * Run `fn` seeing every seeded row, whoever it was imported for and whoever is
 * asking.
 *
 * For the reads that answer a question about the DATABASE rather than about
 * what this user may look at. A uniqueness probe is the case that forced it:
 * `drive_files.file_name` is keyed by the database across all rows, but
 * `DriveFile` is owner-scoped, so the probe could not see a name already taken
 * by a colleague's seeded copy. It reported the name free, the insert hit the
 * key, and a quotation save died on a bare 23505 naming a file the user was not
 * allowed to know existed.
 *
 * Lifts BOTH read filters, because they are two ways to be shown a partial table
 * and a probe is wrong under either: the viewer rule narrows the seeded rows to
 * this user's own, and `runWithoutSampleData` — which most roles now run inside
 * for the whole request — removes them altogether. A probe that ran under the
 * second would report every seeded name free and reach the same 23505.
 *
 * Deliberately narrower than `runSampleDataMaintenance`, which also lifts the
 * read-only guard: this only widens what can be SEEN. Wrap the probe, never the
 * write it informs — the rows it turns up are still none of this user's
 * business beyond the fact that a name is taken.
 */
export const runAcrossAllSampleDataOwners = (fn) =>
  viewerStore.run(null, () => excludeStore.run(false, fn));

/** The user whose seeded rows are visible right now, or null for "all of them". */
export const currentSampleDataViewer = () => viewerStore.getStore() || null;

/**
 * The same rule as a SQL fragment, for the hand-written queries.
 *
 * `beforeFind` reaches every Sequelize finder, but the list screens that hurt
 * most here — leads, jobs, the reports — are raw `sequelize.query` calls that no
 * model hook ever sees. They take this instead: a condition to AND into their
 * WHERE, plus the replacement it binds.
 *
 * Returns `{ sql: null }` when there is no viewer (a worker, a seeder), which
 * callers treat as "no extra condition".
 *
 * @param {string} alias table alias the columns live under, e.g. "l" or "job"
 */
export function sampleDataSqlScope(alias) {
  const prefix = alias ? `${alias}.` : "";

  // Nobody is entitled to these rows — not even their own copies. Answered
  // before the viewer because it is the stricter rule of the two: the viewer
  // rule narrows the seeded rows down to yours, this one removes them all.
  if (excludingSampleData() && !inMaintenance()) {
    return { sql: `(${prefix}${COLUMN} IS NOT TRUE)`, replacements: {} };
  }

  const viewer = currentSampleDataViewer();
  if (!viewer) return { sql: null, replacements: {} };

  return {
    // IS NOT TRUE, not `= false`: the column is nullable on rows written before
    // the flag existed, and `NULL = false` is NULL, which would hide real data.
    sql: `(${prefix}${COLUMN} IS NOT TRUE OR ${prefix}${OWNER_COLUMN} = :sampleDataViewerId)`,
    replacements: { sampleDataViewerId: viewer },
  };
}

const hasColumn = (model) => Boolean(model?.rawAttributes?.[COLUMN]);

const hasOwnerColumn = (model) => Boolean(model?.rawAttributes?.[OWNER_COLUMN]);

const AGGREGATE_SQL = /\b(COUNT|SUM|AVG|MIN|MAX)\s*\(/i;

/**
 * Does this whitelist select an aggregate — `fn("COUNT", ...)` or a literal
 * like `COUNT(CASE ...)` — without a `group`?
 *
 * Such a query returns one summary row, and Postgres refuses a bare column next
 * to an aggregate (42803). Appending the marker there broke the email-activity
 * stats query outright. Those rows are counts, not records the UI badges, so the
 * column is not needed — only the filters are.
 */
const selectsAggregate = (target) => {
  if (!Array.isArray(target?.attributes)) return false;

  return target.attributes.some((attr) => {
    const expr = Array.isArray(attr) ? attr[0] : attr;
    if (!expr || typeof expr !== "object") return false;
    if (typeof expr.fn === "string" && AGGREGATE_SQL.test(`${expr.fn}(`)) return true;
    return typeof expr.val === "string" && AGGREGATE_SQL.test(expr.val);
  });
};

/** True for the objects Sequelize builds for a plain row, not Dates/Buffers. */
const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  (value.constructor === Object || value.constructor === undefined);

/**
 * Add the column to an `attributes` whitelist that left it out.
 *
 * Only the array form is touched. The object form (`{ include }`/`{ exclude }`)
 * is expanded against the full column list further down, so the column is
 * already there — and an `exclude` naming it is a deliberate choice to respect.
 */
const selectColumn = (target) => {
  if (!Array.isArray(target?.attributes)) return;

  // An aliased entry is `[expression, alias]`; the alias is what the row ends
  // up keyed by, so that counts as already selected.
  const selected = target.attributes.some(
    (attr) =>
      attr === COLUMN || (Array.isArray(attr) && attr[attr.length - 1] === COLUMN),
  );

  if (!selected) target.attributes = [...target.attributes, COLUMN];
};

/** Walk conformed includes, which each carry the model they load. */
const selectThroughIncludes = (includes) => {
  if (!Array.isArray(includes)) return;

  for (const include of includes) {
    if (!include || typeof include !== "object") continue;
    if (hasColumn(include.model)) selectColumn(include);
    selectThroughIncludes(include.include);
  }
};

/**
 * Take the seeded rows out of the EAGERLY LOADED half of a find too.
 *
 * `beforeFind` fires for the root of a query only, which is enough for the
 * viewer rule — hiding a parent hides its children with it. It is not enough
 * here, because a seeded child can hang off a perfectly real parent. The colour
 * catalogue is the case that matters: `getColorsService` returns each colour
 * with its categories and items nested, so filtering the root alone left the
 * category tree fully populated with demo content and only the item list
 * — a root query of its own — coming back empty.
 *
 * An INNER JOIN (`required: true`) is left alone. Narrowing one drops the PARENT
 * row, so hiding a seeded child would take a real record off the screen with it;
 * a row that can only be reached through a seeded one is the viewer rule's
 * problem, not this one's. For the same reason `required` is set explicitly
 * where a filter is added: Sequelize promotes an include carrying a `where` to
 * an INNER JOIN unless told otherwise, which is exactly what is being avoided.
 */
const excludeSeededThroughIncludes = (includes) => {
  if (!Array.isArray(includes)) return;

  for (const include of includes) {
    if (!include || typeof include !== "object") continue;

    const where = include.where;
    if (
      include.required !== true &&
      hasColumn(include.model) &&
      !(where && COLUMN in where)
    ) {
      include.where = { ...(where || {}), [COLUMN]: { [Op.not]: true } };
      include.required = false;
    }

    excludeSeededThroughIncludes(include.include);
  }
};

/**
 * Stamp `isSampleData` onto every row in a serialised tree.
 *
 * Walking the whole tree rather than just the top level is what covers eagerly
 * loaded rows: `toJSON()` builds nested rows with `get({ plain: true })`, which
 * does not call their own `toJSON`, so a per-model override alone would leave
 * every included row unmarked.
 */
const stampFlag = (value) => {
  if (Array.isArray(value)) {
    value.forEach(stampFlag);
    return value;
  }

  if (!isPlainObject(value)) return value;

  for (const key of Object.keys(value)) stampFlag(value[key]);

  // A missing column means it was never selected — stay quiet rather than
  // reporting `false` and passing a demo row off as real.
  if (COLUMN in value) value[FLAG] = value[COLUMN] === true;

  return value;
};

/**
 * Narrow a find to the seeded rows this request's user is entitled to see.
 *
 * Left alone, deliberately:
 *
 *   - models outside `OWNER_SCOPED_MODELS`, whose seeded rows are shared;
 *   - maintenance work — the importer, the purge and adoption all have to reach
 *     rows they do not "own" in this sense;
 *   - a query that already names either column, which is a service that has
 *     decided for itself whose sample data it is looking at. Settings → Sample
 *     Data is the one that matters: the administrator's company-wide summary and
 *     purge pass `is_sample_data: true` with no owner on purpose, and this must
 *     not quietly cut it back down to their own rows.
 *
 * Only the root of the query is filtered. An eagerly included model is reached
 * through its parent, so hiding the parent already hides it — and adding a
 * condition to an include turns a join into a filter, which would drop the
 * parent row entirely on an INNER JOIN.
 */
/**
 * Take the seeded rows out of a find entirely.
 *
 * `IS NOT TRUE` rather than `= false`: the column is nullable on every row
 * written before it existed, and `NULL = false` is NULL — which would hide real
 * data from the roles this runs for, on every query, which is most of them.
 *
 * Left alone, for the same reasons `scopeToViewer` leaves things alone:
 * maintenance work has to reach the rows it is importing or clearing, and a
 * query that already names the column belongs to a service that has decided for
 * itself — Settings → Sample Data asks for `is_sample_data: true` on purpose.
 */
function excludeSeeded(model, options) {
  if (!excludingSampleData()) return;
  if (inMaintenance()) return;
  if (!hasColumn(model)) return;

  const where = options.where;
  if (where && COLUMN in where) return;

  // `Op.and` rather than a spread: `where` can be a `sequelize.where(...)`
  // instance, and spreading one leaves its `attribute`/`comparator`/`logic`
  // properties behind as what look like column names.
  const unseeded = { [COLUMN]: { [Op.not]: true } };
  options.where = where ? { [Op.and]: [where, unseeded] } : unseeded;
}

function scopeToViewer(model, options) {
  if (!OWNER_SCOPED_MODELS.has(model.name)) return;
  if (!hasOwnerColumn(model)) return;
  if (inMaintenance()) return;

  const viewer = currentSampleDataViewer();
  if (!viewer) return;

  const where = options.where;
  if (where && (COLUMN in where || OWNER_COLUMN in where)) return;

  const visible = {
    [Op.or]: [{ [COLUMN]: { [Op.not]: true } }, { [OWNER_COLUMN]: viewer }],
  };

  options.where = where ? { [Op.and]: [where, visible] } : visible;
}

export const wireSampleDataFlag = (db) => {
  for (const model of Object.values(db)) {
    // `db` is not only models: it also carries `db.Sequelize`, the library's own
    // class. That is a function and it does have a static `addHook`, so the two
    // checks below on their own let it through — and wiring it did real damage.
    // The hooks landed as GLOBAL hooks rather than on one model, and `toJSON`
    // landed on `Sequelize.prototype`, which has none to inherit. `inherited`
    // was `undefined`, so every `toJSON()` on the class threw a TypeError.
    //
    // The instance in `db.sequelize` inherits from that prototype, and the
    // logger serialises whatever an error holds — so once anything reached the
    // logger carrying a Sequelize reference, safe-stable-stringify called the
    // broken `toJSON` and died inside the log call. The TypeError replaced the
    // error being reported: boot failures came out as "Cannot read properties
    // of undefined (reading 'call')" with the real cause nowhere on screen.
    //
    // So require an actual model, the way the association pass in `index.js`
    // does by skipping those two keys by name.
    if (typeof model !== "function" || typeof model.addHook !== "function") continue;
    if (!(model.prototype instanceof Model)) continue;
    if (model.prototype[WIRED]) continue;

    // Registered on every model, not just the ones holding the column, so the
    // include walk still runs when the root of the query has no column itself.
    model.addHook("beforeFind", (options) => {
      // `group` makes this an aggregate query, where a bare extra column would
      // have to join the GROUP BY to be legal SQL. Those rows are counts, not
      // records the UI badges, so leave them alone.
      if (options?.group) return;
      if (!hasColumn(model)) return;

      if (!selectsAggregate(options)) selectColumn(options);
      excludeSeeded(model, options);
      scopeToViewer(model, options);
    });

    // `count()` reaches the database through `aggregate`, which never runs
    // `beforeFind` — so a paginated list narrowed above still reported the
    // company-wide total, and the last page came back empty. `findAndCountAll`
    // routes its count through here, which is what keeps the two in step.
    model.addHook("beforeCount", (options) => {
      if (options?.group) return;
      excludeSeeded(model, options);
      scopeToViewer(model, options);
    });

    // Includes are only conformed to `{ model, ... }` after `beforeFind`, so
    // the nested whitelists have to wait for this hook.
    model.addHook("beforeFindAfterExpandIncludeAll", (options) => {
      if (options?.group) return;
      if (!selectsAggregate(options)) selectThroughIncludes(options?.include);

      if (excludingSampleData() && !inMaintenance()) {
        excludeSeededThroughIncludes(options?.include);
      }
    });

    // ---- Seeded rows are read-only to the application ----
    //
    // Enforced at the model rather than in each controller: ~90 models carry the
    // column and every one of them has its own update and delete endpoints, so a
    // per-service check would be a rule with ninety chances to be forgotten.
    if (hasColumn(model)) {
      // Single-row paths: `instance.update()` / `instance.destroy()`. The
      // instance is in hand, so the check is exact.
      model.addHook("beforeUpdate", (instance) => {
        if (mayWriteSeededRows()) return;
        // `previous` is what the row was before this change: adoption clears the
        // flag, and that must not be judged by its own outcome.
        if (instance.previous(COLUMN) === true) {
          // Most delete endpoints soft-delete, so they land here rather than in
          // beforeDestroy. Naming the action the user actually took keeps the
          // message from sending them after an edit they never made.
          throw readOnlyError(model, isSoftDelete(instance) ? "deleted" : "edited");
        }
      });

      model.addHook("beforeDestroy", (instance) => {
        if (mayWriteSeededRows()) return;
        if (instance.get(COLUMN) === true) throw readOnlyError(model, "deleted");
      });

      // Bulk paths: `Model.update({...}, { where })` / `Model.destroy({ where })`.
      // No instances exist, so ask the database whether the statement would
      // touch a seeded row. Refusing loudly beats silently skipping — a delete
      // that reports success while changing nothing is worse than an error.
      const guardBulk = async (verb, options) => {
        if (mayWriteSeededRows()) return;
        if (options?.where && COLUMN in options.where) return;

        // The caller's `where` goes under `Op.and` rather than being spread: it
        // can be a `sequelize.where(...)` instance, whose own properties are
        // `attribute`/`comparator`/`logic` — spreading one drops the class and
        // leaves those three looking like column names. `COLUMN` stays a
        // top-level key so `excludeSeeded` and `scopeToViewer` still recognise
        // this count as a query that has decided for itself and leave it be.
        const seeded = await model.count({
          where: options?.where
            ? { [Op.and]: [options.where], [COLUMN]: true }
            : { [COLUMN]: true },
          transaction: options?.transaction,
          paranoid: false,
        });
        if (seeded > 0) throw readOnlyError(model, verb);
      };

      model.addHook("beforeBulkUpdate", (options) =>
        // Same reasoning as the single-row path: a bulk write that only sets the
        // soft-delete flag is a delete, and saying "edited" would describe an
        // action nobody took.
        guardBulk(isBulkSoftDelete(options) ? "deleted" : "edited", options));
      model.addHook("beforeBulkDestroy", (options) => guardBulk("deleted", options));
    }

    // ---- Every seeded row is attributed to the person it was imported for ----
    //
    // Only inside `runAsSampleDataOwner`, which is the importer and nothing else,
    // and only for rows the same statement is flagging. An owner already set on
    // the payload wins: the importer reuses a settings master a colleague's
    // earlier import created, and reusing it must not re-attribute it.
    if (hasOwnerColumn(model)) {
      const stampOwner = (instance) => {
        const owner = currentSampleDataOwner();
        if (!owner) return;
        if (instance.get(COLUMN) !== true) return;
        if (instance.get(OWNER_COLUMN)) return;

        instance.set(OWNER_COLUMN, owner);
      };

      model.addHook("beforeCreate", stampOwner);
      // `bulkCreate` skips `beforeCreate` unless asked for per-row hooks, so the
      // batched paths (the Activity timeline, the S Drive) need their own.
      model.addHook("beforeBulkCreate", (instances) => instances.forEach(stampOwner));

      // ---- and it never loses that attribution afterwards ----
      //
      // A re-sync refreshes a seeded row it brought over before by spreading the
      // demo account's row across it — `target.update({ ...source.get({ plain:
      // true }) })`, in a dozen places. The demo account's own records are not
      // sample data, so their `sample_data_owner_id` is NULL, and that NULL went
      // straight over the owner the import had stamped.
      //
      // The row stayed flagged but belonged to nobody, and everything that reads
      // seeded rows reads them BY owner: `scopeToViewer` hid it from every user
      // including the one it was imported for, Settings → Sample Data counted it
      // for nobody, the purge could no longer reach it, and the next sync could
      // not find it to reuse and cloned a second copy alongside it. From the
      // builder's side a Sync simply emptied their sample catalog.
      //
      // Held here rather than at each call site for the reason `stampOwner` is:
      // the importer writes through eighty-odd statements, and a rule with eighty
      // chances to be forgotten is not a rule. Adoption is untouched — it clears
      // the flag in the same statement, so the row is no longer seeded by the
      // time this runs.
      model.addHook("beforeUpdate", (instance) => {
        if (instance.get(COLUMN) !== true) return;

        // The column has to have been SELECTED for its value to mean anything.
        // A find carrying an `attributes` whitelist that leaves it out builds an
        // instance where the owner reads `undefined` — indistinguishable here
        // from a row that genuinely has none, so the restore below took it for
        // an orphan and stamped the running importer onto somebody else's row.
        //
        // That is not a silent mis-attribution: these tables are keyed by
        // (tenant, name, owner), so re-owning a colleague's seeded row collides
        // with the copy the same import just made for this user, and the whole
        // import dies on a 23505 naming a row the caller never asked to touch.
        //
        // An unloaded column is a question this hook cannot answer, so it does
        // not guess. The row keeps whatever owner it has in the database, which
        // is what a partial update should leave behind anyway.
        if (!(OWNER_COLUMN in instance.dataValues)) return;

        if (instance.get(OWNER_COLUMN)) return;

        // Who the row belonged to before this statement. Restored in preference
        // to the importer's current owner so a shared master a colleague's
        // import created keeps naming them, exactly as `stampOwner` intends.
        const previous = instance.previous(OWNER_COLUMN);
        if (previous) {
          instance.set(OWNER_COLUMN, previous);
          return;
        }

        // Already unowned before this write — an orphan from before this hook, or
        // a row flagged by the statement itself. Either way the importer running
        // now is the one it belongs to.
        stampOwner(instance);
      });
    }

    const inherited = model.prototype.toJSON;
    Object.defineProperty(model.prototype, "toJSON", {
      value: function toJSONWithSampleDataFlag() {
        return stampFlag(inherited.call(this));
      },
      writable: true,
      enumerable: false,
      configurable: true,
    });

    model.prototype[WIRED] = true;
  }
};

/**
 * Same stamp, for responses built by hand.
 *
 * Services that map a row into a literal response object never reach the model's
 * `toJSON`, and services using `raw: true` never build an instance at all. Those
 * call this on the way out.
 */
export const withSampleDataFlag = (payload) => stampFlag(payload);

export default wireSampleDataFlag;
