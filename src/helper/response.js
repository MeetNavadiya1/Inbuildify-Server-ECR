export const successResponse = (res, data, message = "Success") => {
  res.status(200).json({
    success: true,
    statusCode: 200,
    message,
    data,
  });
};

export const errorResponse = (res, statusCode = 500, message = "Internal Server Error", extra = null) => {
  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    data: extra && typeof extra === "object" ? extra : null,
  });
};

/**
 * Answer a caught exception with the status it actually carries.
 *
 * Controllers catch everything and reply 500 "Internal server error". That is
 * right for a genuine fault and wrong for the errors that already know what they
 * are: a refusal to modify sample data is a deliberate 403 with a message
 * written for the person reading it, and flattening it to 500 threw that away —
 * the client saw a server fault and a stack trace went to the log for what was
 * really a rule working exactly as designed.
 *
 * Only two kinds of error are trusted to speak for themselves:
 *
 *   - the sample-data guard, which sets `isSampleDataReadOnly` (see
 *     sampleDataFlag.js) and is always a 403;
 *   - anything carrying an explicit 4xx `statusCode` / `status`, which is a
 *     service deliberately reporting a client-side problem.
 *
 * Everything else keeps the old behaviour exactly — the caller's fallback
 * message and a 500 — so this is safe to use in place of a bare `errorResponse`
 * in any catch block. A 5xx on the error is deliberately NOT forwarded: an
 * upstream library's 502 is not this API's 502, and its message is not ours to
 * repeat to a client.
 *
 * The one exception is an error this API raised on purpose AND marked `expose`.
 * A missing document converter, for instance, is a real 503 with a message
 * written for the person reading it — flattening that to "Internal server error"
 * tells an administrator nothing about the install they are missing. The flag has
 * to be set deliberately, so an upstream 5xx still cannot slip through.
 *
 * A `code` on the error is passed through as `data.code`, which is what lets a
 * client branch on a rule (DOCUMENT_EDIT_DISABLED, CONVERTER_UNAVAILABLE) rather
 * than string-matching the message.
 */
export const handleControllerError = (res, error, fallbackMessage = "Internal server error") => {
  // Only ever a string code — never the whole error, whose fields are not ours
  // to hand a client.
  const extra = typeof error?.code === "string" ? { code: error.code } : null;

  if (error?.isSampleDataReadOnly) {
    return errorResponse(res, 403, error.message, extra);
  }

  const status = Number(error?.statusCode ?? error?.status);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return errorResponse(res, status, error?.message || fallbackMessage, extra);
  }

  if (error?.expose && Number.isInteger(status) && status >= 500 && status < 600) {
    return errorResponse(res, status, error?.message || fallbackMessage, extra);
  }

  // A 500 is the branch nobody planned for, so it is the one worth logging.
  // Most callers pass `err.message` as the fallback, which means a driver-level
  // error answers in the driver's own words and says nothing else anywhere: a
  // unique-constraint violation reaches the client as Sequelize's bare
  // "Validation error", naming no table, no column and no value, with no stack
  // in the server output to look it up by. The `parent` fields below are where
  // Postgres actually says which constraint failed.
  console.error("Unhandled controller error:", {
    name: error?.name,
    message: error?.message,
    constraint: error?.parent?.constraint,
    detail: error?.parent?.detail,
    table: error?.parent?.table,
    sql: error?.sql,
  });
  console.error(error?.stack || error);

  return errorResponse(res, 500, fallbackMessage);
};

export default {
  successResponse,
  errorResponse,
  handleControllerError,
};
