/**
 * Formula engine for the estimation module (Admin → Estimation).
 *
 * A builder writes spreadsheet-style formulas such as
 *
 *     total_area * ceiling_height * 0.36 / (0.19 * 0.09 * 0.09)
 *     if(project_type == 2, 1.8, 1) * total_area
 *     ceil(cement * 2)
 *
 * Formulas are builder input that runs on the server, so they are NEVER handed
 * to `eval`/`Function`. They are tokenised and parsed into a small AST by the
 * recursive-descent parser below, and the evaluator only knows numbers, the
 * variables the caller supplies and the whitelisted functions in FUNCTIONS.
 * There is no way to reach a property, a global or a string from a formula.
 *
 * Grammar (lowest to highest precedence):
 *
 *   comparison     := additive (("<" | "<=" | ">" | ">=" | "==" | "!=") additive)?
 *   additive       := multiplicative (("+" | "-") multiplicative)*
 *   multiplicative := unary (("*" | "/" | "%") unary)*
 *   unary          := ("-" | "+") unary | power
 *   power          := primary ("^" unary)?          (right-associative)
 *   primary        := NUMBER | IDENT | IDENT "(" args? ")" | "(" comparison ")"
 *
 * Identifiers and function names are case-insensitive — they are lower-cased
 * while tokenising, which matches how variables are stored.
 */

export const MAX_FORMULA_LENGTH = 1000;
const MAX_DEPTH = 60;

export class FormulaError extends Error {
  constructor(message, position = null) {
    super(message);
    this.name = "FormulaError";
    this.position = position;
  }
}

/**
 * Whitelisted functions. `lazy` functions receive thunks so only the branch
 * that is actually taken gets evaluated — `if(bathrooms > 0, area / bathrooms, 0)`
 * must not fail on a division by zero in the branch it skips.
 */
const FUNCTIONS = {
  ceil: { min: 1, max: 1, fn: (x) => Math.ceil(x) },
  floor: { min: 1, max: 1, fn: (x) => Math.floor(x) },
  round: {
    min: 1,
    max: 2,
    fn: (x, digits = 0) => {
      const factor = 10 ** Math.trunc(digits);
      return Math.round(x * factor) / factor;
    },
  },
  abs: { min: 1, max: 1, fn: (x) => Math.abs(x) },
  sqrt: {
    min: 1,
    max: 1,
    fn: (x) => {
      if (x < 0) {
        throw new FormulaError("sqrt() of a negative number");
      }
      return Math.sqrt(x);
    },
  },
  min: { min: 1, max: 50, fn: (...xs) => Math.min(...xs) },
  max: { min: 1, max: 50, fn: (...xs) => Math.max(...xs) },
  if: {
    min: 3,
    max: 3,
    lazy: true,
    fn: (cond, whenTrue, whenFalse) => (cond() !== 0 ? whenTrue() : whenFalse()),
  },
};

/** Shown in the formula help next to the variable list. */
export const FORMULA_FUNCTIONS = [
  { name: "ceil", syntax: "ceil(x)", description: "Round up to a whole number" },
  { name: "floor", syntax: "floor(x)", description: "Round down to a whole number" },
  { name: "round", syntax: "round(x, digits)", description: "Round to the given decimal places" },
  { name: "abs", syntax: "abs(x)", description: "Absolute value" },
  { name: "sqrt", syntax: "sqrt(x)", description: "Square root" },
  { name: "min", syntax: "min(a, b, …)", description: "Smallest value" },
  { name: "max", syntax: "max(a, b, …)", description: "Largest value" },
  { name: "if", syntax: "if(condition, a, b)", description: "a when the condition holds, otherwise b" },
];

export const isFormulaFunctionName = (name) =>
  Object.prototype.hasOwnProperty.call(FUNCTIONS, String(name).toLowerCase());

// ─── Tokeniser ───────────────────────────────────────────────────────────────

const OPERATORS = ["<=", ">=", "==", "!=", "+", "-", "*", "/", "%", "^", "<", ">", "(", ")", ","];

/**
 * Spreadsheet habits that are harmless to accept: a leading "=", the × and ÷
 * signs, and a lone "=" meaning equality inside if().
 */
function normaliseSource(source) {
  let src = String(source ?? "");
  src = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  const trimmed = src.trimStart();
  if (trimmed.startsWith("=") && !trimmed.startsWith("==")) {
    src = src.slice(src.indexOf("=") + 1);
  }
  return src;
}

/**
 * Tokens carry their [start, end) offsets into the NORMALISED source so a
 * variable can be renamed in place without reformatting the rest of the formula.
 */
function tokenise(src) {
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i])) {
        i += 1;
      }
      const raw = src.slice(start, i);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(raw)) {
        throw new FormulaError(`Invalid number "${raw}"`, start);
      }
      tokens.push({ type: "num", value: Number(raw), start, end: i });
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) {
        i += 1;
      }
      tokens.push({ type: "ident", value: src.slice(start, i).toLowerCase(), start, end: i });
      continue;
    }

    const at = i;
    const op = OPERATORS.find((candidate) => src.startsWith(candidate, at));
    if (op) {
      tokens.push({ type: "op", value: op, start: i, end: i + op.length });
      i += op.length;
      continue;
    }

    // A single "=" is what a spreadsheet user types for equality.
    if (ch === "=") {
      tokens.push({ type: "op", value: "==", start: i, end: i + 1 });
      i += 1;
      continue;
    }

    throw new FormulaError(`Unexpected character "${ch}"`, i);
  }

  return tokens;
}

// ─── Parser ──────────────────────────────────────────────────────────────────

const COMPARISON_OPS = new Set(["<", "<=", ">", ">=", "==", "!="]);

function createParser(tokens) {
  let pos = 0;
  let depth = 0;

  const peek = () => tokens[pos];
  const isOp = (value) => peek()?.type === "op" && peek().value === value;

  const describe = (token) => (token ? `"${token.value}"` : "end of formula");

  const expectOp = (value) => {
    if (!isOp(value)) {
      const token = peek();
      throw new FormulaError(
        value === ")" ? "Missing closing bracket \")\"" : `Expected "${value}" but found ${describe(token)}`,
        token?.start ?? null,
      );
    }
    pos += 1;
  };

  const guardDepth = (token) => {
    depth += 1;
    if (depth > MAX_DEPTH) {
      throw new FormulaError("Formula is nested too deeply", token?.start ?? null);
    }
  };

  function parseComparison() {
    const left = parseAdditive();
    const token = peek();
    if (token?.type === "op" && COMPARISON_OPS.has(token.value)) {
      pos += 1;
      const right = parseAdditive();
      return { type: "bin", op: token.value, left, right };
    }
    return left;
  }

  function parseAdditive() {
    let node = parseMultiplicative();
    while (isOp("+") || isOp("-")) {
      const op = peek().value;
      pos += 1;
      node = { type: "bin", op, left: node, right: parseMultiplicative() };
    }
    return node;
  }

  function parseMultiplicative() {
    let node = parseUnary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = peek().value;
      pos += 1;
      node = { type: "bin", op, left: node, right: parseUnary() };
    }
    return node;
  }

  function parseUnary() {
    if (isOp("-") || isOp("+")) {
      const token = peek();
      guardDepth(token);
      pos += 1;
      const arg = parseUnary();
      depth -= 1;
      return token.value === "-" ? { type: "neg", arg } : arg;
    }
    return parsePower();
  }

  function parsePower() {
    const base = parsePrimary();
    if (isOp("^")) {
      const token = peek();
      guardDepth(token);
      pos += 1;
      const exponent = parseUnary();
      depth -= 1;
      return { type: "bin", op: "^", left: base, right: exponent };
    }
    return base;
  }

  function parsePrimary() {
    const token = peek();

    if (!token) {
      throw new FormulaError("Formula ends unexpectedly", null);
    }

    if (token.type === "num") {
      pos += 1;
      return { type: "num", value: token.value };
    }

    if (token.type === "ident") {
      pos += 1;
      if (isOp("(")) {
        const fnDef = FUNCTIONS[token.value];
        if (!fnDef) {
          throw new FormulaError(`Unknown function "${token.value}()"`, token.start);
        }
        guardDepth(token);
        pos += 1;
        const args = [];
        if (!isOp(")")) {
          args.push(parseComparison());
          while (isOp(",")) {
            pos += 1;
            args.push(parseComparison());
          }
        }
        expectOp(")");
        depth -= 1;
        if (args.length < fnDef.min || args.length > fnDef.max) {
          const expected = fnDef.min === fnDef.max ? `${fnDef.min}` : `${fnDef.min}–${fnDef.max}`;
          throw new FormulaError(
            `${token.value}() takes ${expected} argument${fnDef.max === 1 ? "" : "s"}, got ${args.length}`,
            token.start,
          );
        }
        return { type: "call", name: token.value, args };
      }
      if (isFormulaFunctionName(token.value)) {
        throw new FormulaError(`"${token.value}" is a function — use it as ${token.value}(…)`, token.start);
      }
      return { type: "var", name: token.value };
    }

    if (isOp("(")) {
      guardDepth(token);
      pos += 1;
      const inner = parseComparison();
      expectOp(")");
      depth -= 1;
      return inner;
    }

    throw new FormulaError(`Unexpected ${describe(token)}`, token.start);
  }

  return {
    parse() {
      if (tokens.length === 0) {
        throw new FormulaError("Formula is empty", 0);
      }
      const ast = parseComparison();
      if (pos < tokens.length) {
        const token = peek();
        throw new FormulaError(
          token.type === "op" && token.value === ")"
            ? "Unmatched closing bracket \")\""
            : `Unexpected ${describe(token)} — is an operator missing?`,
          token.start,
        );
      }
      return ast;
    },
  };
}

/**
 * Parse a formula into an AST. Throws FormulaError on any syntax problem.
 */
export function parseFormula(source) {
  const src = normaliseSource(source);
  if (src.length > MAX_FORMULA_LENGTH) {
    throw new FormulaError(`Formula is longer than ${MAX_FORMULA_LENGTH} characters`);
  }
  return createParser(tokenise(src)).parse();
}

/** Every variable name the formula refers to (all branches, including untaken if() ones). */
export function formulaVariables(ast) {
  const names = new Set();
  const walk = (node) => {
    switch (node.type) {
    case "var":
      names.add(node.name);
      break;
    case "neg":
      walk(node.arg);
      break;
    case "bin":
      walk(node.left);
      walk(node.right);
      break;
    case "call":
      node.args.forEach(walk);
      break;
    default:
      break;
    }
  };
  walk(ast);
  return names;
}

/**
 * Variable names mentioned in a formula, read from the tokens alone. Unlike
 * formulaVariables() this works on a formula that no longer parses, which is
 * what "who still refers to this variable?" needs before a delete — a broken
 * formula still names the thing it depends on.
 */
export function formulaIdentifiers(source) {
  let tokens;
  try {
    tokens = tokenise(normaliseSource(source));
  } catch {
    return new Set();
  }
  const names = new Set();
  tokens.forEach((token, index) => {
    const next = tokens[index + 1];
    const isCall = next?.type === "op" && next.value === "(";
    if (token.type === "ident" && !isCall) {
      names.add(token.value);
    }
  });
  return names;
}

// ─── Evaluator ───────────────────────────────────────────────────────────────

const assertFinite = (value, what) => {
  if (!Number.isFinite(value)) {
    throw new FormulaError(`${what} is not a finite number`);
  }
  return value;
};

/**
 * Evaluate an AST. `lookup(name)` must return a finite number or throw — it is
 * where the caller resolves (and dependency-orders) other variables.
 */
export function evaluateFormula(ast, lookup) {
  const evaluate = (node) => {
    switch (node.type) {
    case "num":
      return node.value;
    case "var":
      return assertFinite(lookup(node.name), `"${node.name}"`);
    case "neg":
      return -evaluate(node.arg);
    case "bin": {
      const left = evaluate(node.left);
      const right = evaluate(node.right);
      switch (node.op) {
      case "+":
        return left + right;
      case "-":
        return left - right;
      case "*":
        return left * right;
      case "/":
        if (right === 0) {
          throw new FormulaError("Division by zero");
        }
        return left / right;
      case "%":
        if (right === 0) {
          throw new FormulaError("Division by zero");
        }
        return left % right;
      case "^":
        return assertFinite(left ** right, "Power result");
      case "<":
        return left < right ? 1 : 0;
      case "<=":
        return left <= right ? 1 : 0;
      case ">":
        return left > right ? 1 : 0;
      case ">=":
        return left >= right ? 1 : 0;
      case "==":
        return left === right ? 1 : 0;
      case "!=":
        return left !== right ? 1 : 0;
      default:
        throw new FormulaError(`Unknown operator "${node.op}"`);
      }
    }
    case "call": {
      const fnDef = FUNCTIONS[node.name];
      if (fnDef.lazy) {
        return fnDef.fn(...node.args.map((arg) => () => evaluate(arg)));
      }
      return fnDef.fn(...node.args.map(evaluate));
    }
    default:
      throw new FormulaError("Invalid formula");
    }
  };

  return assertFinite(evaluate(ast), "Result");
}

/**
 * Rename a variable inside a formula without touching anything else in it —
 * spacing, number formatting and the builder's own layout survive. Used when a
 * parameter or material variable is renamed, so the formulas that point at it
 * follow instead of breaking.
 *
 * Returns the source unchanged when it does not tokenise (a broken formula is
 * left for the builder to fix, not rewritten blindly).
 */
export function renameFormulaVariable(source, from, to) {
  const src = normaliseSource(source);
  let tokens;
  try {
    tokens = tokenise(src);
  } catch {
    return source;
  }

  const target = String(from).toLowerCase();
  let result = "";
  let cursor = 0;
  let changed = false;

  tokens.forEach((token, index) => {
    const next = tokens[index + 1];
    const isCall = next?.type === "op" && next.value === "(";
    if (token.type === "ident" && token.value === target && !isCall) {
      result += src.slice(cursor, token.start) + to;
      cursor = token.end;
      changed = true;
    }
  });

  return changed ? result + src.slice(cursor) : source;
}
