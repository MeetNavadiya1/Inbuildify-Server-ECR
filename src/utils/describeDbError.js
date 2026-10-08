/**
 * Turn a Sequelize/pg failure into something a human can act on.
 *
 * A driver error surfaces as an Error whose own `message` is often empty — the
 * useful part (SQLSTATE, table, constraint, offending column, detail) hangs off
 * `parent`/`original`. Logging the error alone therefore prints a bare stack and
 * storing `error.message` writes a blank reason into the row the UI reads.
 */
export function describeDbError(error, fallback = "Database operation failed.") {
  const pg = error?.parent || error?.original;
  const parts = [
    error?.message,
    pg?.code && `[${pg.code}]`,
    pg?.table && `table=${pg.table}`,
    pg?.constraint && `constraint=${pg.constraint}`,
    pg?.column && `column=${pg.column}`,
    pg?.detail,
  ].filter(Boolean);

  return parts.join(" ").trim() || fallback;
}

/**
 * Re-throw `error` with `context` prefixed onto a described message.
 *
 * The original is kept as `cause` and its stack is carried over, so the trace
 * still points at the statement that actually failed rather than at this helper.
 * A deliberate app error (one carrying `statusCode`) keeps its status so the
 * request handler still answers 400 instead of 500.
 */
export function rethrowWithCause(error, context) {
  const wrapped = new Error(`${context}: ${describeDbError(error, context)}`, {
    cause: error,
  });

  if (error?.stack) wrapped.stack = error.stack;
  if (error?.statusCode) wrapped.statusCode = error.statusCode;

  throw wrapped;
}

export default describeDbError;
