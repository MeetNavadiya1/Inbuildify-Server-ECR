import "dotenv/config";

const PROCESSENV = process.env;

function getEnvValue(name) {
  const value = PROCESSENV[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

/**
 * A whole number of things, or the default. Anything else — unset, blank, a
 * word, a negative, a fraction — falls back rather than throwing: a typo in a
 * count should leave the site on its documented default, not refuse to boot.
 */
function positiveInt(raw, fallback) {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  NODE_ENV: (PROCESSENV.NODE_ENV) || "development",
  PORT: getEnvValue("PORT"),
  BACKEND_URL: process.env.BACKEND_URL || `http://localhost:${PROCESSENV.PORT || 5000}`,
  DB: {
    DB_NAME: getEnvValue("DB_NAME"),
    DB_PORT: getEnvValue("DB_PORT"),
    DB_USER: getEnvValue("DB_USER"),
    DB_PASSWORD: getEnvValue("DB_PASSWORD"),
    DB_HOST: getEnvValue("DB_HOST"),
    DATABASE_URL: PROCESSENV.DATABASE_URL || null,
  },

  JWT: {
    JWT_SECRET: getEnvValue("JWT_SECRET"),
    JWT_REFRESH_SECRET: getEnvValue("JWT_REFRESH_SECRET"),
    JWT_SECRET_EXPIRATION: getEnvValue("JWT_SECRET_EXPIRATION"),
    JWT_REFRESH_SECRET_EPXIRATION: getEnvValue("JWT_REFRESH_SECRET_EXPIRATION"),
    JWT_ADMIN_SECRET: PROCESSENV.JWT_ADMIN_SECRET || null,
    JWT_ADMIN_EXPIRATION: PROCESSENV.JWT_ADMIN_EXPIRATION || "8h",

  },

  EMAIL: {
    GMAIL: getEnvValue("GMAIL"),
    PASSWORD: getEnvValue("PASSWORD"),
    PASSWORD_SECRET: getEnvValue("JWT_REFRESH_SECRET_EXPIRATION"),
    FRONTEND_BASE_URL: getEnvValue("FRONTEND_BASE_URL"),
    BACKEND_BASE_URL: process.env.BACKEND_URL || process.env.BACKEND_BASE_URL || `http://localhost:${process.env.PORT || 5000}`,
    DEFAULT_TO_EMAIL: process.env.DEFAULT_TO_EMAIL || "sales@inbuildify.com",
    SMTP_HOST: PROCESSENV.SMTP_HOST || null,
    SMTP_PORT: PROCESSENV.SMTP_PORT || 587,
    SMTP_USER: PROCESSENV.SMTP_USER || null,
    SMTP_PASS: PROCESSENV.SMTP_PASS || null,
    MAIL_FROM: PROCESSENV.MAIL_FROM || null,
    MAIL_REPLY_TO: PROCESSENV.MAIL_REPLY_TO || null,
  },
  AWS: {
    AWS_ACCESS_KEY_ID: getEnvValue("AWS_ACCESS_KEY_ID"),
    AWS_SECRET_ACCESS_KEY: getEnvValue("AWS_SECRET_ACCESS_KEY"),
    AWS_REGION: getEnvValue("AWS_REGION"),
    S3_BUCKET_NAME: getEnvValue("S3_BUCKET_NAME"),
    FILE_TYPES: getEnvValue("FILE_TYPES"),
    FILE_SIZE: getEnvValue("FILE_SIZE"),
  },
  REDIS: {
    REDIS_HOST: getEnvValue("REDIS_HOST"),
    REDIS_PORT: getEnvValue("REDIS_PORT"),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || null,
  },
  QUOTATION_HASH_SECRET: process.env.QUOTATION_HASH_SECRET || "inbuildify-quotation-hash-key-2024",
  EXTERNAL_API: {
    SECRET: process.env.NEXT_PUBLIC_API_SECRET || "fallback_secret_key_123",
    SECRET_TEXT: process.env.NEXT_PUBLIC_API_SECRET_TEXT || "ALLOW_REPORT",
  },
  LANDING_PAGE_SECRET: process.env.LANDING_PAGE_SECRET || "fallback_secret_key_123",
  LANDING_PAGE_SECRET_TEXT: process.env.LANDING_PAGE_SECRET_TEXT || "ALLOW_REPORT",
  DOCUSIGN: {
    BASE_URL: process.env.DOCUSIGN_BASE_URL || "https://demo.docusign.net/restapi",
    OAUTH_BASE_PATH: process.env.DOCUSIGN_OAUTH_BASE_PATH || "account-d.docusign.com",
    CLIENT_ID: getEnvValue("DOCUSIGN_CLIENT_ID"),
    USER_ID: getEnvValue("DOCUSIGN_USER_ID"),
    RSA_KEY: getEnvValue("DOCUSIGN_RSA_KEY"),
    WEBHOOK_URL: process.env.DOCUSIGN_WEBHOOK_URL || "",
    WEBHOOK_SECRET: process.env.DOCUSIGN_WEBHOOK_SECRET || "",
    SIGNING_REDIRECT_URL: process.env.DOCUSIGN_SIGNING_REDIRECT_URL || "",
    EXPIRATION_DAYS: parseInt(process.env.DOCUSIGN_EXPIRATION_DAYS || "30"),
  },
  GOOGLE: {
    CLIENT_ID: process.env.GOOGLE_CLIENT_ID || null,
    CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || null,
    CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL || null,
  },
  DUMMY_DATA_EMAIL: process.env.DUMMY_DATA_EMAIL || "dummy@inbuildify.com",
  /**
   * How many places the landing page's facade carousel has.
   *
   * A floor and a ceiling, because the strip is a fixed piece of the front page
   * rather than a list that grows and shrinks with it. Below MIN_SLOTS the site
   * tops the carousel up with the platform's most-used facades instead of
   * showing gaps; above MAX_SLOTS live promotions are held in order and take a
   * place as one above them expires. See `landing-fill.service.js`.
   *
   * Configurable because "how big is the carousel" is a decision about the front
   * page's layout, not about this code — a redesign that fits twenty-four
   * tiles should not need a deploy of the backend to match.
   */
  LANDING_CAROUSEL: {
    MIN_SLOTS: positiveInt(process.env.LANDING_MIN_SLOTS, 6),
    /**
     * Read after MIN so it can never be the smaller of the two: a ceiling below
     * the floor would have the feed cut promotions off a strip it then padded
     * back out with fillers, which is the one state neither rule can describe.
     */
    MAX_SLOTS: Math.max(
      positiveInt(process.env.LANDING_MAX_SLOTS, 20),
      positiveInt(process.env.LANDING_MIN_SLOTS, 6),
    ),
  },
  WORKFLOW_TASK: {
    /**
     * How long a workflow task may grow to, as a multiple of the duration it
     * has now. The cap is on the TOTAL, so what may be added is one multiple
     * less than the whole:
     *
     *   maximum total days = task duration x TASK_EXTENSION_MULTIPLIER
     *   maximum added days = that total, minus the duration it already has
     *
     * At 3, a 7 day task may reach 21 days — so at most 14 more. At the default
     * of 2 a task can at most double: 7 days, up to 7 more, 14 in total. A value
     * of 1 leaves nothing to add and so switches extensions off.
     *
     * Configurable so the rule can change without a code change. Falls back to 2
     * when unset or not a positive number.
     */
    EXTENSION_MULTIPLIER: (() => {
      const parsed = Number(process.env.TASK_EXTENSION_MULTIPLIER);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
    })(),
    /**
     * How many times a single task may have its date extended. Every applied
     * extension spends one chance; once they are gone the task cannot be
     * extended again and the "Add Days" link stops being offered.
     *
     * This is a separate limit from EXTENSION_MULTIPLIER: that caps how many
     * days one extension may add, this caps how many extensions there can be.
     *
     * Configurable so the rule can change without a code change. Read from
     * TASK_EXTENSION_LIMIT to sit alongside TASK_EXTENSION_MULTIPLIER, or from
     * the shorter EXTENSION_LIMIT. Falls back to 2 when neither is set to a
     * positive whole number.
     */
    EXTENSION_LIMIT: (() => {
      const raw = process.env.TASK_EXTENSION_LIMIT ?? process.env.EXTENSION_LIMIT;
      const parsed = Number(raw);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : 2;
    })(),
  },
};
