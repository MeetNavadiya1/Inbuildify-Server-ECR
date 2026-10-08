import { Op } from "sequelize";

import db from "../../config/database/models/postgre-models/index.js";
import {
  parseFormula,
  evaluateFormula,
  formulaVariables,
  formulaIdentifiers,
  renameFormulaVariable,
  isFormulaFunctionName,
  FormulaError,
  FORMULA_FUNCTIONS,
} from "../../utils/estimateFormula.js";
import { sampleDataReadOnlyError } from "../../config/database/models/postgre-models/sampleDataFlag.js";
import { STARTER_PARAMETERS, STARTER_MATERIALS } from "./estimate.template.js";

/**
 * Estimation — the builder's parameters, the materials priced from them, and
 * the calculation that turns one into the other.
 *
 * Parameters and materials share ONE formula namespace: a material formula can
 * name a parameter (`total_area * 1.3`), a calculated parameter
 * (`wall_volume / 0.0015`) or another material (`cement * 2`). Everything
 * below treats the two tables as a single dependency graph keyed by `variable`,
 * which is why variables are unique across both and why every write that could
 * change the graph (a new formula, a rename, a deactivation, a delete) is
 * checked against the whole of it.
 */

export const INPUT_TYPES = Object.freeze(["number", "select", "boolean", "formula"]);
export const VARIABLE_PATTERN = /^[a-z][a-z0-9_]*$/;

/** Per-tenant caps so one account cannot make the graph (or a request) unbounded. */
const MAX_PARAMETERS = 200;
const MAX_MATERIALS = 300;

const KINDS = Object.freeze({
  parameter: {
    model: "EstimateParameter",
    pk: "estimate_parameter_id",
    nameField: "label",
    noun: "Parameter",
    max: MAX_PARAMETERS,
  },
  material: {
    model: "EstimateMaterial",
    pk: "estimate_material_id",
    nameField: "name",
    noun: "Material",
    max: MAX_MATERIALS,
  },
});

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

// ─── Tenant ──────────────────────────────────────────────────────────────────

/**
 * One estimation set per builder; users with no builder (Company
 * Administrators from /company-signup) fall back to their company. Same rule,
 * and same reason, as quotation_terms' tenantWhere.
 */
const tenantWhere = ({ builderId, companyId }) => {
  if (builderId) {
    return { builder_id: builderId };
  }
  if (companyId) {
    return { builder_id: null, company_id: companyId };
  }
  throw httpError(403, "Estimation settings belong to a builder or company account.");
};

const tenantColumns = ({ builderId, companyId }) => ({
  builder_id: builderId ?? null,
  company_id: companyId ?? null,
});

// ─── Serialisation ───────────────────────────────────────────────────────────

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const round = (value, digits) => {
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** Plain object with DECIMAL columns as numbers (pg hands them back as strings). */
const plainParameter = (row) => {
  const data = typeof row.toJSON === "function" ? row.toJSON() : { ...row };
  return {
    ...data,
    default_value: toNumber(data.default_value),
    options: Array.isArray(data.options) ? data.options : [],
  };
};

const plainMaterial = (row) => {
  const data = typeof row.toJSON === "function" ? row.toJSON() : { ...row };
  return {
    ...data,
    unit_price: toNumber(data.unit_price) ?? 0,
    previous_unit_price: toNumber(data.previous_unit_price),
  };
};

/**
 * The price a line changed from, or null when there is no change to show —
 * never changed, or changed and then set back to the same amount.
 */
const previousPriceOf = (material) => {
  const previous = toNumber(material.previous_unit_price);
  return previous === null || previous === toNumber(material.unit_price) ? null : previous;
};

const displayNameOf = (kind, row) => row[KINDS[kind].nameField];

// ─── Loading ─────────────────────────────────────────────────────────────────

const ORDER = [
  ["sort_order", "ASC"],
  ["created_at", "ASC"],
];

async function loadConfig(actor, transaction) {
  const { EstimateParameter, EstimateMaterial } = db;
  const where = tenantWhere(actor);
  const [parameters, materials] = await Promise.all([
    EstimateParameter.findAll({ where, order: ORDER, transaction }),
    EstimateMaterial.findAll({ where, order: ORDER, transaction }),
  ]);
  return {
    parameters: parameters.map(plainParameter),
    materials: materials.map(plainMaterial),
  };
}

/** Every row of both kinds, tagged with its kind — the formula namespace. */
const allRows = (config) => [
  ...config.parameters.map((row) => ({ kind: "parameter", row })),
  ...config.materials.map((row) => ({ kind: "material", row })),
];

const idOf = (kind, row) => row[KINDS[kind].pk];

/** The formula a row contributes to the graph, or null for an input parameter. */
const formulaOf = (kind, row) => {
  if (kind === "material") {
    return row.formula ?? "";
  }
  return row.input_type === "formula" ? (row.formula ?? "") : null;
};

// ─── Graph ───────────────────────────────────────────────────────────────────

/**
 * Active rows as graph nodes keyed by variable. Parse errors are kept on the
 * node rather than thrown, so one broken formula shows up as one broken line
 * on the estimate instead of failing the whole calculation.
 */
function buildNodes(config) {
  const nodes = new Map();
  for (const { kind, row } of allRows(config)) {
    if (!row.is_active) {
      continue;
    }
    const formula = formulaOf(kind, row);
    const node = { kind, row, variable: row.variable, formula, deps: new Set(), ast: null, parseError: null };
    if (formula !== null) {
      try {
        node.ast = parseFormula(formula);
        node.deps = formulaVariables(node.ast);
      } catch (err) {
        node.parseError = err instanceof FormulaError ? err.message : "Invalid formula";
      }
    }
    nodes.set(row.variable, node);
  }
  return nodes;
}

/**
 * The first dependency cycle that runs back through `start`, as a list of
 * variables (`["a", "b", "a"]`), or null.
 */
function findCycleThrough(nodes, start) {
  const path = [];
  const onPath = new Set();
  const done = new Set();

  const visit = (name) => {
    if (onPath.has(name)) {
      return name === start ? [...path, name] : null;
    }
    if (done.has(name)) {
      return null;
    }
    const node = nodes.get(name);
    if (!node) {
      return null;
    }

    path.push(name);
    onPath.add(name);
    for (const dep of node.deps) {
      const cycle = visit(dep);
      if (cycle) {
        return cycle;
      }
    }
    path.pop();
    onPath.delete(name);
    done.add(name);
    return null;
  };

  return visit(start);
}

/**
 * Resolve every node. Input parameters take their value from `inputs`; formula
 * nodes are evaluated on demand, so dependency order falls out of the
 * recursion. A node that fails records its own message, and anything built on
 * it records which dependency let it down.
 */
function computeGraph(nodes, inputs) {
  const values = new Map();
  const errors = new Map();
  const visiting = new Set();

  const resolve = (name) => {
    if (values.has(name)) {
      return values.get(name);
    }
    if (errors.has(name)) {
      throw new FormulaError(`Depends on "${name}", which could not be calculated`);
    }
    const node = nodes.get(name);
    if (!node) {
      throw new FormulaError(`Unknown variable "${name}"`);
    }
    if (visiting.has(name)) {
      throw new FormulaError(`Circular reference through "${name}"`);
    }

    visiting.add(name);
    try {
      let value;
      if (node.formula === null) {
        value = inputs.get(name) ?? 0;
      } else if (node.parseError) {
        throw new FormulaError(node.parseError);
      } else {
        value = evaluateFormula(node.ast, resolve);
      }
      values.set(name, value);
      return value;
    } catch (err) {
      errors.set(name, err instanceof FormulaError ? err.message : "Could not be calculated");
      throw new FormulaError(`Depends on "${name}", which could not be calculated`);
    } finally {
      visiting.delete(name);
    }
  };

  for (const name of nodes.keys()) {
    try {
      resolve(name);
    } catch {
      // Recorded in `errors`; keep going so every other line still computes.
    }
  }

  return { values, errors };
}

/**
 * The value each active input parameter takes: the caller's value when given,
 * else the parameter's default, else a sensible zero (a dropdown's first
 * option). Yes/No inputs are coerced to 1/0.
 */
function resolveInputs(parameters, provided) {
  const inputs = new Map();
  for (const param of parameters) {
    if (!param.is_active || param.input_type === "formula") {
      continue;
    }

    let value = provided.has(param.variable) ? toNumber(provided.get(param.variable)) : null;
    if (value === null) {
      value = toNumber(param.default_value);
    }
    if (value === null) {
      value = param.input_type === "select" ? (toNumber(param.options?.[0]?.value) ?? 0) : 0;
    }
    if (param.input_type === "boolean") {
      value = value ? 1 : 0;
    }

    inputs.set(param.variable, value);
  }
  return inputs;
}

const displayValue = (param, value) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (param.input_type === "boolean") {
    return value ? "Yes" : "No";
  }
  if (param.input_type === "select") {
    const option = (param.options || []).find((opt) => toNumber(opt.value) === value);
    return option ? option.label : String(value);
  }
  return null;
};

// ─── Formula validation ──────────────────────────────────────────────────────

/**
 * Check a formula as it would sit in the graph: syntax, every variable it
 * names exists and is active, it does not name itself, and it does not close a
 * cycle. `candidate` is { kind, id, variable, formula } — `id` null for a row
 * that does not exist yet. Throws a 400 with a message written for the builder.
 */
function assertFormulaFits(config, candidate) {
  let ast;
  try {
    ast = parseFormula(candidate.formula);
  } catch (err) {
    throw httpError(400, `Formula error: ${err.message}`);
  }

  const deps = formulaVariables(ast);
  if (candidate.variable && deps.has(candidate.variable)) {
    throw httpError(400, `A formula cannot refer to its own variable "${candidate.variable}".`);
  }

  const others = allRows(config).filter(
    ({ kind, row }) => !(kind === candidate.kind && idOf(kind, row) === candidate.id),
  );
  const byVariable = new Map(others.map((entry) => [entry.row.variable, entry]));

  for (const dep of deps) {
    const entry = byVariable.get(dep);
    if (!entry) {
      throw httpError(400, `Unknown variable "${dep}". Add it as a parameter or material first.`);
    }
    if (!entry.row.is_active) {
      throw httpError(
        400,
        `"${dep}" (${displayNameOf(entry.kind, entry.row)}) is inactive. Activate it or remove it from the formula.`,
      );
    }
  }

  if (candidate.variable) {
    const nodes = buildNodes({
      parameters: others.filter((e) => e.kind === "parameter").map((e) => e.row),
      materials: others.filter((e) => e.kind === "material").map((e) => e.row),
    });
    nodes.set(candidate.variable, { variable: candidate.variable, deps, formula: candidate.formula, ast });
    const cycle = findCycleThrough(nodes, candidate.variable);
    if (cycle) {
      throw httpError(400, `This formula creates a circular reference: ${cycle.join(" → ")}.`);
    }
  }

  return ast;
}

/** Active rows (other than `exceptKind/exceptId`) whose formula names `variable`. */
function activeReferrers(config, variable, exceptKind, exceptId) {
  return allRows(config).filter(({ kind, row }) => {
    if (!row.is_active) {
      return false;
    }
    if (kind === exceptKind && idOf(kind, row) === exceptId) {
      return false;
    }
    const formula = formulaOf(kind, row);
    return formula !== null && formulaIdentifiers(formula).has(variable);
  });
}

const referrerList = (referrers) =>
  referrers.map(({ kind, row }) => `${displayNameOf(kind, row)}`).join(", ");

// ─── Variable names ──────────────────────────────────────────────────────────

/** "Total Built-up Area (m²)" → "total_built_up_area_m2" (NFKD turns ² into 2). */
export const variableFromLabel = (label) => {
  let name = String(label ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  if (!name) {
    name = "value";
  }
  if (!/^[a-z]/.test(name)) {
    name = `v_${name}`.slice(0, 60);
  }
  if (isFormulaFunctionName(name)) {
    name = `${name}_value`;
  }
  return name;
};

function assertVariableFree(config, variable, selfKind, selfId) {
  if (!VARIABLE_PATTERN.test(variable) || variable.length > 60) {
    throw httpError(
      400,
      "Variable must start with a letter and use only lowercase letters, numbers and underscores (max 60).",
    );
  }
  if (isFormulaFunctionName(variable)) {
    throw httpError(400, `"${variable}" is a formula function name and cannot be used as a variable.`);
  }
  const clash = allRows(config).find(
    ({ kind, row }) => row.variable === variable && !(kind === selfKind && idOf(kind, row) === selfId),
  );
  if (clash) {
    throw httpError(
      409,
      `Variable "${variable}" is already used by the ${clash.kind} "${displayNameOf(clash.kind, clash.row)}".`,
    );
  }
}

/** Names are what the estimate shows; two lines called "Paint" would be ambiguous. */
function assertNameFree(config, kind, name, selfId) {
  const rows = kind === "parameter" ? config.parameters : config.materials;
  const wanted = name.trim().toLowerCase();
  const clash = rows.find(
    (row) => idOf(kind, row) !== selfId && String(displayNameOf(kind, row)).trim().toLowerCase() === wanted,
  );
  if (clash) {
    throw httpError(409, `A ${kind} named "${displayNameOf(kind, clash)}" already exists.`);
  }
}

/**
 * Inputs a parameter must have to be usable in an estimate. Only enforced when
 * the request actually sets them (a create, or an update that touches the type,
 * options or default) — toggling an older row active must not fail over a
 * field nobody changed.
 */
function assertParameterInputs(shaped) {
  if (shaped.input_type === "select" && shaped.options.length < 2) {
    throw httpError(400, "A dropdown needs at least two options.");
  }
  if (shaped.input_type === "number" && shaped.default_value === null) {
    throw httpError(400, "Enter a default value — it is used until the estimator changes it.");
  }
}

const touchesInputs = (payload) =>
  payload.input_type !== undefined || payload.options !== undefined || payload.default_value !== undefined;

/**
 * Rename `from` → `to` inside every OTHER row's formula (active or not, so an
 * inactive row still points at the right thing when it comes back). Returns the
 * rows that changed so the caller can persist them, and mutates `config` so any
 * validation that follows sees the renamed graph.
 */
function renameAcrossConfig(config, from, to, selfKind, selfId) {
  const changed = [];
  for (const { kind, row } of allRows(config)) {
    if (kind === selfKind && idOf(kind, row) === selfId) {
      continue;
    }
    if (!row.formula || !formulaIdentifiers(row.formula).has(from)) {
      continue;
    }
    const next = renameFormulaVariable(row.formula, from, to);
    if (next !== row.formula) {
      row.formula = next;
      changed.push({ kind, row });
    }
  }
  return changed;
}

// ─── Payload normalisation ───────────────────────────────────────────────────

const cleanText = (value) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
};

/**
 * Bring a parameter into a consistent shape for its type: only formula
 * parameters keep a formula, only dropdowns keep options, and a dropdown's
 * default is always one of its own option values.
 */
function normaliseParameterShape(param) {
  const next = { ...param };

  if (next.input_type !== "formula") {
    next.formula = null;
  }
  if (next.input_type !== "select") {
    next.options = [];
  }

  switch (next.input_type) {
  case "select": {
    const options = (next.options || []).map((opt) => ({
      label: String(opt.label ?? "").trim(),
      value: toNumber(opt.value),
    }));
    if (options.length === 0) {
      throw httpError(400, "A dropdown parameter needs at least one option.");
    }
    if (options.some((opt) => !opt.label || opt.value === null)) {
      throw httpError(400, "Every dropdown option needs a label and a numeric value.");
    }
    const labels = new Set(options.map((opt) => opt.label.toLowerCase()));
    if (labels.size !== options.length) {
      throw httpError(400, "Dropdown option labels must be unique.");
    }
    const values = new Set(options.map((opt) => opt.value));
    if (values.size !== options.length) {
      throw httpError(400, "Dropdown option values must be unique — formulas tell options apart by value.");
    }
    next.options = options;
    const def = toNumber(next.default_value);
    next.default_value = def !== null && values.has(def) ? def : options[0].value;
    break;
  }
  case "boolean":
    next.default_value = toNumber(next.default_value) ? 1 : 0;
    break;
  case "formula":
    next.default_value = null;
    if (!cleanText(next.formula)) {
      throw httpError(400, "A calculated parameter needs a formula.");
    }
    next.formula = String(next.formula).trim();
    break;
  default:
    next.default_value = toNumber(next.default_value);
    break;
  }

  return next;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function getConfigService(actor) {
  const config = await loadConfig(actor);
  return { ...config, functions: FORMULA_FUNCTIONS };
}

/**
 * Run the estimate. `values` is [{ variable, value }] — an array, not an
 * object keyed by variable, because the API layer rewrites object keys between
 * camelCase and snake_case and would mangle `total_area`.
 */
export async function calculateService(actor, values = []) {
  const config = await loadConfig(actor);
  const provided = new Map((values || []).map((entry) => [String(entry.variable).toLowerCase(), entry.value]));
  return buildEstimate(config, provided);
}

function buildEstimate(config, provided) {
  const nodes = buildNodes(config);
  const inputs = resolveInputs(config.parameters, provided);
  const { values, errors } = computeGraph(nodes, inputs);

  const parameters = config.parameters
    .filter((param) => param.is_active)
    .map((param) => {
      const value = values.has(param.variable) ? values.get(param.variable) : null;
      return {
        estimate_parameter_id: param.estimate_parameter_id,
        label: param.label,
        variable: param.variable,
        input_type: param.input_type,
        unit: param.unit,
        formula: param.input_type === "formula" ? param.formula : null,
        value: value === null ? null : round(value, 4),
        display_value: displayValue(param, value),
        error: errors.get(param.variable) ?? null,
      };
    });

  let grandTotal = 0;
  const materials = config.materials
    .filter((material) => material.is_active)
    .map((material) => {
      const error = errors.get(material.variable) ?? null;
      const quantity = error ? null : values.get(material.variable);
      const totalCost = quantity === null || quantity === undefined ? null : round(quantity * material.unit_price, 2);
      if (totalCost !== null) {
        grandTotal += totalCost;
      }
      return {
        estimate_material_id: material.estimate_material_id,
        name: material.name,
        variable: material.variable,
        unit: material.unit,
        formula: material.formula,
        unit_price: material.unit_price,
        previous_unit_price: previousPriceOf(material),
        quantity: quantity === null || quantity === undefined ? null : round(quantity, 4),
        total_cost: totalCost,
        error,
      };
    });

  grandTotal = round(grandTotal, 2);
  materials.forEach((line) => {
    line.share_percent =
      grandTotal > 0 && line.total_cost !== null ? round((line.total_cost / grandTotal) * 100, 2) : 0;
  });

  return {
    parameters,
    materials,
    grand_total: grandTotal,
    error_count: materials.filter((line) => line.error).length + parameters.filter((p) => p.error).length,
  };
}

/**
 * Validate a formula while the builder is still typing it, and preview what it
 * comes to with the default parameter values. Never throws for a bad formula —
 * the answer IS whether it is valid.
 */
export async function checkFormulaService(actor, { formula, kind, id, variable }) {
  const config = await loadConfig(actor);
  const candidateVariable = cleanText(variable)?.toLowerCase() || null;

  let ast;
  try {
    ast = assertFormulaFits(config, { kind, id: id ?? null, variable: candidateVariable, formula });
  } catch (err) {
    if (err.statusCode === 400) {
      return { valid: false, error: err.message.replace(/^Formula error: /, ""), variables: [] };
    }
    throw err;
  }

  // Preview: drop the candidate into the graph and evaluate it with defaults.
  const previewVariable = candidateVariable || "__formula_preview__";
  const nodes = buildNodes({
    parameters: config.parameters.filter((row) => !(kind === "parameter" && row.estimate_parameter_id === id)),
    materials: config.materials.filter((row) => !(kind === "material" && row.estimate_material_id === id)),
  });
  nodes.set(previewVariable, {
    variable: previewVariable,
    formula,
    ast,
    deps: formulaVariables(ast),
    parseError: null,
  });
  const { values, errors } = computeGraph(nodes, resolveInputs(config.parameters, new Map()));

  return {
    valid: true,
    error: null,
    variables: [...formulaVariables(ast)],
    preview_value: values.has(previewVariable) ? round(values.get(previewVariable), 4) : null,
    preview_error: errors.get(previewVariable) ?? null,
  };
}

// ─── Writes (shared) ─────────────────────────────────────────────────────────

async function nextSortOrder(model, actor, transaction) {
  const max = await model.max("sort_order", { where: tenantWhere(actor), transaction });
  return (Number(max) || 0) + 1;
}

async function persistRenamed(changed, actor, transaction) {
  for (const { kind, row } of changed) {
    await db[KINDS[kind].model].update(
      { formula: row.formula, updated_by: actor.userId ?? null },
      { where: { [KINDS[kind].pk]: idOf(kind, row), ...tenantWhere(actor) }, transaction },
    );
  }
}

async function findOwnRow(kind, actor, id, transaction) {
  const { model, pk, noun } = KINDS[kind];
  const row = await db[model].findOne({ where: { [pk]: id, ...tenantWhere(actor) }, transaction });
  if (!row) {
    throw httpError(404, `${noun} not found.`);
  }
  return row;
}

async function deleteRowService(kind, actor, id, applyToExisting) {
  return db.sequelize.transaction(async (transaction) => {
    const row = await findOwnRow(kind, actor, id, transaction);
    const config = await loadConfig(actor, transaction);
    const referrers = activeReferrers(config, row.variable, kind, id);
    if (referrers.length) {
      throw httpError(
        409,
        `"${displayNameOf(kind, row)}" is used in the formula of: ${referrerList(referrers)}. Update those formulas first.`,
      );
    }

    // Copy it before it goes: protecting existing jobs from a deletion means
    // they keep pricing the line, which there is no live row left to read.
    const before = kind === "parameter" ? plainParameter(row) : plainMaterial(row);
    const impact = await applyImpactChoice(
      actor,
      { applyToExisting, kind, rowId: id, before, reason: "deleted" },
      transaction,
    );

    await row.destroy({ transaction });
    return { id, ...impact };
  });
}

// ─── Parameters ──────────────────────────────────────────────────────────────

export async function createParameterService(actor, payload, applyToExisting) {
  const { EstimateParameter, sequelize } = db;

  return sequelize.transaction(async (transaction) => {
    const config = await loadConfig(actor, transaction);
    if (config.parameters.length >= MAX_PARAMETERS) {
      throw httpError(400, `You can have up to ${MAX_PARAMETERS} parameters.`);
    }

    const label = cleanText(payload.label);
    assertNameFree(config, "parameter", label, null);
    const variable = cleanText(payload.variable)?.toLowerCase() || variableFromLabel(label);
    assertVariableFree(config, variable, "parameter", null);

    const shaped = normaliseParameterShape({
      input_type: payload.input_type || "number",
      options: payload.options || [],
      default_value: payload.default_value,
      formula: payload.formula,
    });
    assertParameterInputs(shaped);
    const isActive = payload.is_active ?? true;

    if (shaped.input_type === "formula" && isActive) {
      assertFormulaFits(config, { kind: "parameter", id: null, variable, formula: shaped.formula });
    }

    const created = await EstimateParameter.create(
      {
        ...tenantColumns(actor),
        label,
        variable,
        ...shaped,
        unit: cleanText(payload.unit),
        description: cleanText(payload.description),
        sort_order: payload.sort_order ?? (await nextSortOrder(EstimateParameter, actor, transaction)),
        is_active: isActive,
        created_by: actor.userId ?? null,
        updated_by: actor.userId ?? null,
      },
      { transaction },
    );

    // A new parameter did not exist for older jobs, so protecting them means
    // freezing it as absent rather than freezing a previous version of it.
    const impact = await applyImpactChoice(
      actor,
      {
        applyToExisting,
        kind: "parameter",
        rowId: created.estimate_parameter_id,
        before: null,
        reason: "added",
      },
      transaction,
    );

    return { ...plainParameter(created), ...impact };
  });
}

export async function updateParameterService(actor, id, payload, applyToExisting) {
  const { sequelize } = db;

  return sequelize.transaction(async (transaction) => {
    const row = await findOwnRow("parameter", actor, id, transaction);
    const config = await loadConfig(actor, transaction);
    const copies = copyRows(config);
    const current = plainParameter(row);

    const next = {
      label: payload.label !== undefined ? cleanText(payload.label) : current.label,
      variable: payload.variable !== undefined ? cleanText(payload.variable)?.toLowerCase() || current.variable : current.variable,
      input_type: payload.input_type ?? current.input_type,
      options: payload.options !== undefined ? payload.options : current.options,
      default_value: payload.default_value !== undefined ? payload.default_value : current.default_value,
      formula: payload.formula !== undefined ? payload.formula : current.formula,
      unit: payload.unit !== undefined ? cleanText(payload.unit) : current.unit,
      description: payload.description !== undefined ? cleanText(payload.description) : current.description,
      sort_order: payload.sort_order ?? current.sort_order,
      is_active: payload.is_active ?? current.is_active,
    };
    if (!next.label) {
      throw httpError(400, "Parameter name is required.");
    }
    if (next.label !== current.label) {
      assertNameFree(config, "parameter", next.label, id);
    }

    Object.assign(next, normaliseParameterShape(next));
    if (touchesInputs(payload)) {
      assertParameterInputs(next);
    }

    if (current.is_active && !next.is_active) {
      const referrers = activeReferrers(config, current.variable, "parameter", id);
      if (referrers.length) {
        throw httpError(
          409,
          `"${current.label}" is used in the formula of: ${referrerList(referrers)}. Update those formulas before deactivating it.`,
        );
      }
    }

    let renamed = [];
    if (next.variable !== current.variable) {
      assertVariableFree(config, next.variable, "parameter", id);
      renamed = renameAcrossConfig(config, current.variable, next.variable, "parameter", id);
    }

    if (next.input_type === "formula" && next.is_active) {
      assertFormulaFits(config, { kind: "parameter", id, variable: next.variable, formula: next.formula });
    }

    await persistRenamed(renamed, actor, transaction);
    await row.update({ ...next, updated_by: actor.userId ?? null }, { transaction });

    const impact = await applyEditImpact(
      actor,
      { applyToExisting, kind: "parameter", id, copies, renamed, reason: "changed" },
      transaction,
    );

    return {
      ...plainParameter(row),
      renamed_in: renamed.map(({ kind, row: r }) => displayNameOf(kind, r)),
      ...impact,
    };
  });
}

export const deleteParameterService = (actor, id, applyToExisting) =>
  deleteRowService("parameter", actor, id, applyToExisting);

// ─── Materials ───────────────────────────────────────────────────────────────

export async function createMaterialService(actor, payload, applyToExisting) {
  const { EstimateMaterial, sequelize } = db;

  return sequelize.transaction(async (transaction) => {
    const config = await loadConfig(actor, transaction);
    if (config.materials.length >= MAX_MATERIALS) {
      throw httpError(400, `You can have up to ${MAX_MATERIALS} materials.`);
    }

    const name = cleanText(payload.name);
    assertNameFree(config, "material", name, null);
    const variable = cleanText(payload.variable)?.toLowerCase() || variableFromLabel(name);
    assertVariableFree(config, variable, "material", null);

    const formula = String(payload.formula ?? "").trim();
    const isActive = payload.is_active ?? true;
    if (isActive) {
      assertFormulaFits(config, { kind: "material", id: null, variable, formula });
    } else {
      // Inactive rows skip the graph checks, but must at least parse.
      try {
        parseFormula(formula);
      } catch (err) {
        throw httpError(400, `Formula error: ${err.message}`);
      }
    }

    const created = await EstimateMaterial.create(
      {
        ...tenantColumns(actor),
        name,
        variable,
        unit: cleanText(payload.unit),
        formula,
        unit_price: toNumber(payload.unit_price) ?? 0,
        description: cleanText(payload.description),
        sort_order: payload.sort_order ?? (await nextSortOrder(EstimateMaterial, actor, transaction)),
        is_active: isActive,
        created_by: actor.userId ?? null,
        updated_by: actor.userId ?? null,
      },
      { transaction },
    );

    // A new material did not exist for older jobs, so protecting them means
    // freezing it as absent rather than freezing a previous version of it.
    const impact = await applyImpactChoice(
      actor,
      {
        applyToExisting,
        kind: "material",
        rowId: created.estimate_material_id,
        before: null,
        reason: "added",
      },
      transaction,
    );

    return { ...plainMaterial(created), ...impact };
  });
}

export async function updateMaterialService(actor, id, payload, applyToExisting) {
  const { sequelize } = db;

  return sequelize.transaction(async (transaction) => {
    const row = await findOwnRow("material", actor, id, transaction);
    const config = await loadConfig(actor, transaction);
    const copies = copyRows(config);
    const current = plainMaterial(row);

    const next = {
      name: payload.name !== undefined ? cleanText(payload.name) : current.name,
      variable: payload.variable !== undefined ? cleanText(payload.variable)?.toLowerCase() || current.variable : current.variable,
      unit: payload.unit !== undefined ? cleanText(payload.unit) : current.unit,
      formula: payload.formula !== undefined ? String(payload.formula ?? "").trim() : current.formula,
      unit_price: payload.unit_price !== undefined ? (toNumber(payload.unit_price) ?? 0) : current.unit_price,
      description: payload.description !== undefined ? cleanText(payload.description) : current.description,
      sort_order: payload.sort_order ?? current.sort_order,
      is_active: payload.is_active ?? current.is_active,
    };
    // A price change keeps the price it replaced, so the change can be shown.
    if (next.unit_price !== current.unit_price) {
      next.previous_unit_price = current.unit_price;
    }
    if (!next.name) {
      throw httpError(400, "Material name is required.");
    }
    if (next.name !== current.name) {
      assertNameFree(config, "material", next.name, id);
    }

    if (current.is_active && !next.is_active) {
      const referrers = activeReferrers(config, current.variable, "material", id);
      if (referrers.length) {
        throw httpError(
          409,
          `"${current.name}" is used in the formula of: ${referrerList(referrers)}. Update those formulas before deactivating it.`,
        );
      }
    }

    let renamed = [];
    if (next.variable !== current.variable) {
      assertVariableFree(config, next.variable, "material", id);
      renamed = renameAcrossConfig(config, current.variable, next.variable, "material", id);
    }

    if (next.is_active) {
      assertFormulaFits(config, { kind: "material", id, variable: next.variable, formula: next.formula });
    } else {
      try {
        parseFormula(next.formula);
      } catch (err) {
        throw httpError(400, `Formula error: ${err.message}`);
      }
    }

    await persistRenamed(renamed, actor, transaction);
    await row.update({ ...next, updated_by: actor.userId ?? null }, { transaction });

    const impact = await applyEditImpact(
      actor,
      { applyToExisting, kind: "material", id, copies, renamed, reason: "changed" },
      transaction,
    );

    return {
      ...plainMaterial(row),
      renamed_in: renamed.map(({ kind, row: r }) => displayNameOf(kind, r)),
      ...impact,
    };
  });
}

export const deleteMaterialService = (actor, id, applyToExisting) =>
  deleteRowService("material", actor, id, applyToExisting);

// ─── "Apply changes to existing jobs?" ───────────────────────────────────────

/**
 * Estimation settings are one shared set, and a job is priced from them live —
 * so by default every change reaches every job. When an admin answers NO to
 * "Apply changes to existing jobs?", the row they are changing is frozen as it
 * stands and pinned to every job that exists at that moment. Those jobs go on
 * being priced from the frozen copy; the live row moves on for new jobs.
 *
 * `applyToExisting` is deliberately THREE-valued:
 *   true      — the change reaches existing jobs: release any freeze on this row
 *   false     — existing jobs are protected: freeze this row for all of them
 *   undefined — no choice was made, so leave the existing arrangement alone.
 *               Used by the Estimate & Dashboard's incidental default-value
 *               autosave, which must neither freeze everything on a keystroke
 *               nor quietly undo a freeze an admin asked for.
 */

/** The tenant predicate for `job`, as SQL — same rule as findJobInTenant. */
const jobTenantSql = (actor) => {
  const clauses = [];
  if (actor.builderId) {
    clauses.push("j.builder_id = :builderId");
  }
  if (actor.companyId) {
    clauses.push("j.company_id = :companyId");
  }
  return clauses.join(" OR ");
};

/**
 * Hold every job that exists right now at `snapshot` for one configuration row.
 *
 * `snapshot` is the row as it stands (freeze it before the write), or null for
 * "this row does not exist for you" — which is how a newly added material is
 * kept off older jobs.
 *
 * A job already frozen on this row is skipped rather than re-frozen: it
 * declined an EARLIER change to it, and that older copy is the one it is
 * entitled to. Returns how many jobs were protected.
 */
async function freezeRowForExistingJobs(actor, kind, rowId, snapshot, reason, transaction) {
  const { EstimateFrozenRow, sequelize } = db;
  const tenantSql = jobTenantSql(actor);
  if (!tenantSql) {
    throw httpError(403, "Estimation settings belong to a builder or company account.");
  }

  const frozen = await EstimateFrozenRow.create(
    {
      ...tenantColumns(actor),
      kind,
      row_id: rowId,
      snapshot: snapshot ?? null,
      reason: reason ?? null,
      created_by: actor.userId ?? null,
    },
    { transaction },
  );

  const [, inserted] = await sequelize.query(
    `INSERT INTO estimate_job_frozen_row (job_id, frozen_row_id)
     SELECT j.job_id, :frozenRowId
       FROM job j
      WHERE (${tenantSql})
        AND NOT EXISTS (
              SELECT 1
                FROM estimate_job_frozen_row p
                JOIN estimate_frozen_row f ON f.frozen_row_id = p.frozen_row_id
               WHERE p.job_id = j.job_id
                 AND f.kind = :kind
                 AND f.row_id = :rowId
            )
     ON CONFLICT DO NOTHING`,
    {
      replacements: {
        frozenRowId: frozen.frozen_row_id,
        kind,
        rowId,
        builderId: actor.builderId ?? null,
        companyId: actor.companyId ?? null,
      },
      transaction,
    },
  );

  // Sequelize hands back the affected row count as the SECOND element for an
  // INSERT — a plain number on postgres. Reading `.rowCount` off it would be
  // undefined, and this function would then delete every freeze it just made.
  const protectedJobs = Number(
    typeof inserted === "number" ? inserted : (inserted?.rowCount ?? 0),
  );

  // Nothing to hold — no jobs yet, or every one of them was already frozen on
  // this row. Keep the table free of a snapshot nothing points at.
  if (protectedJobs === 0) {
    await frozen.destroy({ transaction });
  }
  return protectedJobs;
}

/**
 * Let every job follow the live row again — the YES answer.
 *
 * Only this row's freezes go; a job protected on some OTHER material stays
 * protected on it. That is the whole reason freezing is per row.
 */
async function releaseRowToExistingJobs(actor, kind, rowId, transaction) {
  const { EstimateFrozenRow } = db;
  return EstimateFrozenRow.destroy({
    where: { kind, row_id: rowId, ...tenantWhere(actor) },
    transaction,
  });
}

/**
 * Apply one admin's answer to a row they just changed.
 *
 * `before` is the row as it stood (null when it did not exist, i.e. a create).
 * Called AFTER the write for `true`, BEFORE it for `false` — the caller decides,
 * because only a freeze needs the pre-change state.
 */
async function applyImpactChoice(actor, { applyToExisting, kind, rowId, before, reason }, transaction) {
  if (applyToExisting === undefined) {
    return { protectedJobs: 0, released: 0 };
  }
  if (applyToExisting) {
    const released = await releaseRowToExistingJobs(actor, kind, rowId, transaction);
    return { protectedJobs: 0, released };
  }
  const protectedJobs = await freezeRowForExistingJobs(actor, kind, rowId, before, reason, transaction);
  return { protectedJobs, released: 0 };
}

/**
 * Copies of every row, taken before anything mutates them.
 *
 * A rename rewrites OTHER rows' formulas in place (`renameAcrossConfig`), so by
 * the time the caller knows which rows were touched their previous formula is
 * already gone. Whoever might need to freeze them has to have copied first.
 */
function copyRows(config) {
  const copies = new Map();
  for (const { kind, row } of allRows(config)) {
    copies.set(`${kind}:${idOf(kind, row)}`, { ...row });
  }
  return copies;
}

/**
 * The admin's answer for an EDIT: the row they changed, plus every other row a
 * rename dragged along with it — those had their formula rewritten too, so a
 * job being protected has to keep their old version as well.
 */
async function applyEditImpact(actor, { applyToExisting, kind, id, copies, renamed, reason }, transaction) {
  const targets = [{ kind, id }, ...renamed.map((entry) => ({ kind: entry.kind, id: idOf(entry.kind, entry.row) }))];

  let protectedJobs = 0;
  let released = 0;
  for (const target of targets) {
    const result = await applyImpactChoice(
      actor,
      {
        applyToExisting,
        kind: target.kind,
        rowId: target.id,
        before: copies.get(`${target.kind}:${target.id}`) ?? null,
        reason: target.id === id ? reason : "renamed in a formula",
      },
      transaction,
    );
    protectedJobs = Math.max(protectedJobs, result.protectedJobs);
    released += result.released;
  }
  return { protectedJobs, released };
}

/** Every frozen row pinned to one job. */
async function loadFrozenRows(jobId, transaction) {
  const [rows] = await db.sequelize.query(
    `SELECT f.kind, f.row_id, f.snapshot, f.created_at
       FROM estimate_job_frozen_row p
       JOIN estimate_frozen_row f ON f.frozen_row_id = p.frozen_row_id
      WHERE p.job_id = :jobId`,
    { replacements: { jobId }, transaction },
  );
  return rows ?? [];
}

const bySortOrder = (a, b) =>
  (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
  String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));

/**
 * The configuration as ONE job sees it: the live set, with every row this job
 * is frozen on swapped back to the copy it was left at (or removed, where the
 * freeze says the row did not exist for it).
 */
function applyFrozenRows(config, frozen) {
  if (frozen.length === 0) {
    return config;
  }

  const kinds = {
    parameter: new Map(config.parameters.map((row) => [row.estimate_parameter_id, row])),
    material: new Map(config.materials.map((row) => [row.estimate_material_id, row])),
  };

  for (const entry of frozen) {
    const rows = kinds[entry.kind];
    if (!rows) {
      continue;
    }
    if (entry.snapshot === null || entry.snapshot === undefined) {
      rows.delete(entry.row_id);
    } else {
      rows.set(entry.row_id, entry.snapshot);
    }
  }

  const parameters = [...kinds.parameter.values()].sort(bySortOrder);
  const materials = [...kinds.material.values()].sort(bySortOrder);

  /**
   * A deleted material's variable can later be handed to a new one, leaving a
   * frozen job holding both. Parameters and materials share one formula
   * namespace, so the two would collide and one line would silently vanish from
   * the estimate. The frozen copy is what this job was priced from, so it
   * claims the name first and the live newcomer is the one dropped.
   */
  const frozenIds = new Set(frozen.map((entry) => entry.row_id));
  const isFrozen = (kind, row) => frozenIds.has(row[KINDS[kind].pk]);

  const taken = new Set();
  for (const [kind, rows] of [["parameter", parameters], ["material", materials]]) {
    for (const row of rows) {
      if (isFrozen(kind, row)) {
        taken.add(row.variable);
      }
    }
  }

  const survives = (kind) => (row) => {
    if (isFrozen(kind, row)) {
      return true;
    }
    if (taken.has(row.variable)) {
      return false;
    }
    taken.add(row.variable);
    return true;
  };

  return {
    parameters: parameters.filter(survives("parameter")),
    materials: materials.filter(survives("material")),
  };
}

/** The live settings, seen through whatever this job has been frozen on. */
async function loadJobConfig(actor, jobId, transaction) {
  const [config, frozen] = await Promise.all([
    loadConfig(actor, transaction),
    loadFrozenRows(jobId, transaction),
  ]);
  return { config: applyFrozenRows(config, frozen), frozenCount: frozen.length };
}

// ─── Job-wise estimates ──────────────────────────────────────────────────────

/**
 * Estimating a job runs the SAME engine as Admin → Estimation: one set of
 * parameters, formulas and unit prices per tenant. What belongs to the job is
 * only what the estimator typed, kept in `estimate_job_value` and applied here
 * on top of the shared config. A parameter the job has no value for falls back
 * to its own default, so a job opened for the first time prices immediately —
 * and nothing a job saves can be seen by another job.
 */

/**
 * The job, checked against the requester's tenant. A job outside it is a 404
 * rather than a 403: whether that id exists is not the caller's business.
 */
async function findJobInTenant(actor, jobId, transaction) {
  const { Job } = db;
  const scope = [];
  if (actor.builderId) {
    scope.push({ builder_id: actor.builderId });
  }
  if (actor.companyId) {
    scope.push({ company_id: actor.companyId });
  }
  if (scope.length === 0) {
    throw httpError(403, "Estimation settings belong to a builder or company account.");
  }

  const job = await Job.findOne({
    where: { job_id: jobId, [Op.or]: scope },
    attributes: ["job_id", "builder_id", "company_id", "is_sample_data"],
    transaction,
  });
  if (!job) {
    throw httpError(404, "Job not found.");
  }
  return job;
}

/**
 * What the job already knows about itself, by the variable an estimate would
 * name it with.
 *
 * A job is sold before it is estimated: the lead's property details say how big
 * the site is, the floor plan says how many bedrooms and bathrooms it has.
 * Re-typing those is how the estimate and the contract drift apart, so they are
 * read straight off the job and used wherever the estimator has not said
 * otherwise.
 *
 * Matched by the starter template's variable names. A builder who renamed
 * `bedrooms` simply gets no fact for it and keeps their own default — nothing
 * breaks, it is just not pre-filled.
 *
 * `locked` is the difference between a figure the job SETTLES and one it merely
 * starts you off with. The area sold and how many bedrooms and bathrooms it has
 * are the lead's to state, so those inputs are read-only and are changed on the
 * lead. The rest — how many living areas the estimate counts, the block's
 * dimensions — pre-fill and can then be typed over, and the estimator's number
 * is what sticks.
 */
const JOB_FACTS = [
  // The area estimated from is the one recorded against the lead — width ×
  // depth on the property details, the same figure the lead and the quotation
  // show. The floor plan's own area only stands in when the lead has no
  // property details at all, so a job still pre-fills rather than falling back
  // to a parameter default that belongs to no job.
  {
    variable: "total_area",
    source: ({ property }) =>
      toNumber(property?.total_size_m2) !== null ? "property details" : "floor plan",
    locked: true,
    of: ({ property, floorPlan }) =>
      property?.total_size_m2 ?? floorPlan?.total_area ?? floorPlan?.dwelling_area,
  },
  { variable: "bedrooms", source: "floor plan", locked: true, of: ({ floorPlan }) => floorPlan?.beds },
  { variable: "bathrooms", source: "floor plan", locked: true, of: ({ floorPlan }) => floorPlan?.baths },
  { variable: "halls", source: "floor plan", of: ({ floorPlan }) => floorPlan?.living },
  { variable: "carpark", source: "floor plan", of: ({ floorPlan }) => floorPlan?.carpark },
  { variable: "garage_area", source: "floor plan", of: ({ floorPlan }) => floorPlan?.garage_area },
  { variable: "alfresco_area", source: "floor plan", of: ({ floorPlan }) => floorPlan?.alfresco_area },
  { variable: "porch_area", source: "floor plan", of: ({ floorPlan }) => floorPlan?.porch_area },
  { variable: "land_area", source: "property details", of: ({ property }) => property?.total_size_m2 },
  { variable: "land_width", source: "property details", of: ({ property }) => property?.width_m },
  { variable: "land_depth", source: "property details", of: ({ property }) => property?.depth_m },
  { variable: "site_fall", source: "property details", of: ({ property }) => property?.site_fall_mm },
];

const FLOOR_PLAN_FACT_COLUMNS = [
  "floor_plan_id",
  "total_area",
  "dwelling_area",
  "beds",
  "baths",
  "living",
  "carpark",
  "garage_area",
  "alfresco_area",
  "porch_area",
];

/**
 * The floor plan and property details behind a job.
 *
 * Same two hops, and the same precedence, as the job detail screen itself: the
 * quotation the job was created from wins over the house-and-land package the
 * lead started on, because the quotation is what was actually sold.
 */
async function loadJobSources(jobId, transaction) {
  const { Job, Opportunity, Leads, PropertyDetail, HouseLandPackage, FloorPlan, QuotationVersion } = db;

  const job = await Job.findOne({
    where: { job_id: jobId },
    attributes: ["job_id"],
    include: [
      {
        model: Opportunity,
        as: "opportunity",
        attributes: ["opportunity_id"],
        include: [
          {
            model: Leads,
            as: "lead",
            attributes: ["leads_id"],
            include: [
              {
                model: PropertyDetail,
                as: "propertyDetail",
                attributes: ["property_detail_id", "total_size_m2", "width_m", "depth_m", "site_fall_mm"],
              },
              {
                model: HouseLandPackage,
                as: "houseLandPackage",
                attributes: ["house_land_package_id"],
                include: [{ model: FloorPlan, as: "floorPlan", attributes: FLOOR_PLAN_FACT_COLUMNS }],
              },
            ],
          },
        ],
      },
      {
        model: QuotationVersion,
        as: "quotationVersion",
        attributes: ["quotation_version_id"],
        include: [{ model: FloorPlan, as: "floorPlan", attributes: FLOOR_PLAN_FACT_COLUMNS }],
      },
    ],
    transaction,
  });

  const plain = job?.get({ plain: true });
  const lead = plain?.opportunity?.lead;
  return {
    floorPlan: plain?.quotationVersion?.floorPlan ?? lead?.houseLandPackage?.floorPlan ?? null,
    property: lead?.propertyDetail ?? null,
  };
}

/** The facts that actually have a number, as variable → { value, source }. */
function jobFacts(sources) {
  const facts = new Map();
  for (const fact of JOB_FACTS) {
    const value = toNumber(fact.of(sources));
    if (value !== null) {
      // A fact that can come from either place names the one it actually used,
      // so the note under the box is never pointing at the wrong record.
      const source = typeof fact.source === "function" ? fact.source(sources) : fact.source;
      facts.set(fact.variable, { value, source, locked: fact.locked === true });
    }
  }
  return facts;
}

/** The facts as the client sees them, kept to parameters that actually exist. */
function factList(config, facts) {
  return config.parameters
    .filter((param) => param.is_active && param.input_type !== "formula" && facts.has(param.variable))
    .map((param) => ({
      estimate_parameter_id: param.estimate_parameter_id,
      variable: param.variable,
      value: facts.get(param.variable).value,
      source: facts.get(param.variable).source,
      locked: facts.get(param.variable).locked,
    }));
}

/** This job's saved values, keyed by parameter id (rename-proof). */
async function loadJobValues(jobId, transaction) {
  const rows = await db.EstimateJobValue.findAll({ where: { job_id: jobId }, transaction });
  return new Map(rows.map((row) => [row.estimate_parameter_id, toNumber(row.value)]));
}

/** The saved values as the client sees them, dropping any whose parameter is gone. */
function savedValueList(config, stored) {
  return config.parameters
    .filter((param) => stored.has(param.estimate_parameter_id))
    .map((param) => ({
      estimate_parameter_id: param.estimate_parameter_id,
      variable: param.variable,
      value: stored.get(param.estimate_parameter_id),
    }));
}

/**
 * What the job is priced with, weakest first:
 *
 *   the parameter's default  (left out here — `resolveInputs` falls back to it)
 *   → a fact that only pre-fills (`halls`, the block's dimensions…)
 *   → what was saved against this job
 *   → a fact the job settles outright (`locked`: area, bedrooms, bathrooms)
 *   → what the estimator is typing right now
 *
 * A locked fact sits ABOVE the saved value because it is not an opinion: the
 * house has the bedrooms the floor plan says it has. Its input is read-only on
 * screen and skipped by the save, so nothing can be written over one — and a
 * value stored before a parameter was locked is superseded rather than left to
 * contradict the plan forever.
 *
 * An unlocked fact sits BELOW it, so it is a starting point and the estimator's
 * own figure wins. Clearing such a box is not "zero": it drops back down to the
 * job's own figure, and to the parameter's default if there isn't one.
 */
function jobInputs(config, facts, stored, values = []) {
  const provided = new Map();
  for (const [variable, fact] of facts) {
    if (!fact.locked) {
      provided.set(variable, fact.value);
    }
  }
  for (const param of config.parameters) {
    const saved = stored.get(param.estimate_parameter_id);
    if (saved !== null && saved !== undefined) {
      provided.set(param.variable, saved);
    }
  }
  for (const [variable, fact] of facts) {
    if (fact.locked) {
      provided.set(variable, fact.value);
    }
  }
  for (const entry of values) {
    const variable = String(entry.variable).toLowerCase();
    const fact = facts.get(variable);
    if (fact?.locked) {
      continue;
    }
    const value = toNumber(entry.value);
    if (value !== null) {
      provided.set(variable, value);
    } else if (fact) {
      provided.set(variable, fact.value);
    } else {
      provided.delete(variable);
    }
  }
  return provided;
}

/** Config + this job's saved values + the estimate they come to, in one read. */
export async function getJobEstimateService(actor, jobId) {
  await findJobInTenant(actor, jobId);
  const [{ config, frozenCount }, stored, sources] = await Promise.all([
    loadJobConfig(actor, jobId),
    loadJobValues(jobId),
    loadJobSources(jobId),
  ]);
  const facts = jobFacts(sources);

  return {
    job_id: jobId,
    parameters: config.parameters,
    materials: config.materials,
    functions: FORMULA_FUNCTIONS,
    values: savedValueList(config, stored),
    // What the job filled in for itself, so the screen can say where a
    // pre-filled number came from instead of it appearing out of nowhere.
    facts: factList(config, facts),
    // Settings this job was held back from, so the screen can say it is not
    // priced on the current ones rather than quietly disagreeing with them.
    protected_setting_count: frozenCount,
    result: buildEstimate(config, jobInputs(config, facts, stored)),
  };
}

/**
 * Re-price the job as the estimator types. Nothing is written — `values` is an
 * unsaved overlay on what the job already has, exactly as on the admin screen.
 */
export async function calculateJobEstimateService(actor, jobId, values = []) {
  await findJobInTenant(actor, jobId);
  const [{ config }, stored, sources] = await Promise.all([
    loadJobConfig(actor, jobId),
    loadJobValues(jobId),
    loadJobSources(jobId),
  ]);
  return buildEstimate(config, jobInputs(config, jobFacts(sources), stored, values));
}

/**
 * Save what the estimator typed against THIS job. Deliberately not
 * `updateParameterService`: on the admin screen a changed input becomes the
 * parameter's default for everyone, which is precisely what must not happen
 * here — a job's area is the job's, not the next job's starting point.
 *
 * A cleared box deletes the job's row rather than storing nothing, so the
 * parameter goes back to its default instead of being pinned at zero.
 */
export async function saveJobEstimateValuesService(actor, jobId, values = []) {
  const { EstimateJobValue, sequelize } = db;

  return sequelize.transaction(async (transaction) => {
    const job = await findJobInTenant(actor, jobId, transaction);
    // The row is new but what it edits is the demo job, which is view-only.
    if (job.is_sample_data) {
      throw sampleDataReadOnlyError("job", "edited");
    }
    const [{ config }, sources] = await Promise.all([
      loadJobConfig(actor, jobId, transaction),
      loadJobSources(jobId, transaction),
    ]);
    const facts = jobFacts(sources);
    const inputParameters = new Map(
      config.parameters
        .filter((param) => param.is_active && param.input_type !== "formula")
        .map((param) => [param.variable, param]),
    );

    for (const entry of values) {
      const variable = String(entry.variable ?? "").toLowerCase();
      const param = inputParameters.get(variable);
      if (!param) {
        throw httpError(400, `"${entry.variable}" is not an input parameter of this estimate.`);
      }
      // Read-only on screen: this one is the floor plan's to say, and is
      // changed there. Ignored rather than refused — a client sending it is out
      // of date, not wrong, and failing the whole save over a value that would
      // have been superseded anyway helps nobody. An UNLOCKED fact is only a
      // starting point, so an estimator's own figure for it saves normally.
      if (facts.get(variable)?.locked) {
        continue;
      }

      const where = { job_id: jobId, estimate_parameter_id: param.estimate_parameter_id };
      const existing = await EstimateJobValue.findOne({ where, transaction });
      const value = toNumber(entry.value);

      if (value === null) {
        if (existing) {
          await existing.destroy({ transaction });
        }
        continue;
      }
      if (existing) {
        await existing.update({ value, updated_by: actor.userId ?? null }, { transaction });
      } else {
        await EstimateJobValue.create(
          {
            ...where,
            company_id: job.company_id ?? actor.companyId ?? null,
            builder_id: job.builder_id ?? actor.builderId ?? null,
            value,
            created_by: actor.userId ?? null,
            updated_by: actor.userId ?? null,
          },
          { transaction },
        );
      }
    }

    const stored = await loadJobValues(jobId, transaction);
    return { job_id: jobId, values: savedValueList(config, stored) };
  });
}

// ─── Starter template ────────────────────────────────────────────────────────

/**
 * Add the starter parameters and materials. Additive only: a variable the
 * builder already uses is skipped, and a starter formula that no longer fits
 * their set (it names something they renamed or removed) is skipped with the
 * reason, rather than saved broken.
 */
export async function loadTemplateService(actor, applyToExisting) {
  const { EstimateParameter, EstimateMaterial, sequelize } = db;

  return sequelize.transaction(async (transaction) => {
    const config = await loadConfig(actor, transaction);
    const taken = new Set(allRows(config).map(({ row }) => row.variable));
    const skipped = [];
    // Everything the template adds is new, so protecting existing jobs means
    // freezing each addition as absent for them. Collected as they are created
    // and frozen in one pass at the end.
    const added = [];
    let parameterSort = await nextSortOrder(EstimateParameter, actor, transaction);
    let materialSort = await nextSortOrder(EstimateMaterial, actor, transaction);
    let parametersAdded = 0;
    let materialsAdded = 0;

    for (const starter of STARTER_PARAMETERS) {
      if (taken.has(starter.variable)) {
        skipped.push({ name: starter.label, reason: `variable "${starter.variable}" is already in use` });
        continue;
      }
      if (config.parameters.some((p) => p.label.trim().toLowerCase() === starter.label.toLowerCase())) {
        skipped.push({ name: starter.label, reason: "a parameter with this name already exists" });
        continue;
      }
      const shaped = normaliseParameterShape({
        input_type: starter.input_type,
        options: starter.options || [],
        default_value: starter.default_value,
        formula: starter.formula,
      });
      if (shaped.input_type === "formula") {
        try {
          assertFormulaFits(config, { kind: "parameter", id: null, variable: starter.variable, formula: shaped.formula });
        } catch (err) {
          skipped.push({ name: starter.label, reason: err.message });
          continue;
        }
      }
      const created = await EstimateParameter.create(
        {
          ...tenantColumns(actor),
          label: starter.label,
          variable: starter.variable,
          ...shaped,
          unit: starter.unit ?? null,
          description: starter.description ?? null,
          sort_order: parameterSort++,
          is_active: true,
          created_by: actor.userId ?? null,
          updated_by: actor.userId ?? null,
        },
        { transaction },
      );
      config.parameters.push(plainParameter(created));
      added.push({ kind: "parameter", rowId: created.estimate_parameter_id });
      taken.add(starter.variable);
      parametersAdded += 1;
    }

    for (const starter of STARTER_MATERIALS) {
      if (taken.has(starter.variable)) {
        skipped.push({ name: starter.name, reason: `variable "${starter.variable}" is already in use` });
        continue;
      }
      if (config.materials.some((m) => m.name.trim().toLowerCase() === starter.name.toLowerCase())) {
        skipped.push({ name: starter.name, reason: "a material with this name already exists" });
        continue;
      }
      try {
        assertFormulaFits(config, { kind: "material", id: null, variable: starter.variable, formula: starter.formula });
      } catch (err) {
        skipped.push({ name: starter.name, reason: err.message });
        continue;
      }
      const created = await EstimateMaterial.create(
        {
          ...tenantColumns(actor),
          name: starter.name,
          variable: starter.variable,
          unit: starter.unit ?? null,
          formula: starter.formula,
          unit_price: starter.unit_price,
          description: starter.description ?? null,
          sort_order: materialSort++,
          is_active: true,
          created_by: actor.userId ?? null,
          updated_by: actor.userId ?? null,
        },
        { transaction },
      );
      config.materials.push(plainMaterial(created));
      added.push({ kind: "material", rowId: created.estimate_material_id });
      taken.add(starter.variable);
      materialsAdded += 1;
    }

    let protectedJobs = 0;
    for (const entry of added) {
      const impact = await applyImpactChoice(
        actor,
        { applyToExisting, kind: entry.kind, rowId: entry.rowId, before: null, reason: "added" },
        transaction,
      );
      protectedJobs = Math.max(protectedJobs, impact.protectedJobs);
    }

    return {
      parameters_added: parametersAdded,
      materials_added: materialsAdded,
      skipped,
      protected_jobs: protectedJobs,
    };
  });
}

// Exposed for unit tests of the pure graph logic.
export const __testing = {
  buildEstimate,
  assertFormulaFits,
  renameAcrossConfig,
  activeReferrers,
  jobFacts,
  jobInputs,
  factList,
  applyFrozenRows,
};
