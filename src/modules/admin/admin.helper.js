export const parsePagination = (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100);
  return { page, limit, offset: (page - 1) * limit };
};

/**
 * `camelToSnakeMiddleware` rewrites query *keys*, not values, so `sortBy` arrives
 * camelCase while the column it names does not. Every sort map accepts both
 * spellings rather than making the caller guess which half of the pair to camel.
 */
export const withCamelAliases = (columns) => {
  const map = { ...columns };
  for (const [key, column] of Object.entries(columns)) {
    const camel = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    if (camel !== key) map[camel] = column;
  }
  return map;
};

/**
 * Column whitelist -> Sequelize order clause. `columns` maps the value the
 * client may send to the real column, so an arbitrary string never reaches SQL.
 */
export const parseSort = (query = {}, columns, fallback) => {
  const column = columns[query.sort_by] || columns[fallback] || fallback;
  const direction = String(query.sort_dir || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  return [[column, direction]];
};

export const listEnvelope = (items, total, page, limit) => ({
  items,
  total,
  page,
  limit,
  totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
});

export const httpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

export const parseDateRange = (query = {}, fallbackDays = 30) => {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - fallbackDays * 24 * 60 * 60 * 1000);
  return { from, to };
};

export const monthBuckets = (count = 12, endDate = new Date()) => {
  const buckets = [];
  const cursor = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
  for (let i = count - 1; i >= 0; i -= 1) {
    const start = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    buckets.push({ period: start.toISOString().slice(0, 7), start, end });
  }
  return buckets;
};

export const percentDelta = (current, previous) => {
  if (!previous) {
    return { value: current > 0 ? 100 : 0, direction: current > 0 ? "up" : "flat" };
  }
  const change = ((current - previous) / previous) * 100;
  let direction = "flat";
  if (change > 0) direction = "up";
  if (change < 0) direction = "down";

  return { value: Number(change.toFixed(1)), direction };
};

export const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * A `raw: true` query keys timestamps by the model ATTRIBUTE (`createdAt`)
 * unless the column is named explicitly in `attributes`, in which case the key
 * is the column (`created_at`). Reading both keeps shaping independent of that.
 */
export const rowTimestamp = (row, column) => {
  const camel = column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  return row?.[column] ?? row?.[camel] ?? null;
};

/**
 * Tenant rows are reached either by company_id or by builder_id — most tables
 * carry only one of the two — so every cross-tenant list resolves both.
 */
export const resolveCompanies = async (db, rows) => {
  const { Company } = db;
  const { Op } = await import("sequelize");

  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean))];
  const builderIds = [...new Set(rows.map((r) => r.builder_id).filter(Boolean))];

  if (!companyIds.length && !builderIds.length) return () => null;

  const companies = await Company.findAll({
    attributes: ["company_id", "builder_id", "name"],
    where: {
      [Op.or]: [
        ...(companyIds.length ? [{ company_id: { [Op.in]: companyIds } }] : []),
        ...(builderIds.length ? [{ builder_id: { [Op.in]: builderIds } }] : []),
      ],
    },
    raw: true,
  });

  const byCompanyId = new Map(companies.map((c) => [c.company_id, c]));
  const byBuilderId = new Map(companies.map((c) => [c.builder_id, c]));

  return (row) => {
    const company = byCompanyId.get(row.company_id) || byBuilderId.get(row.builder_id) || null;
    return company ? { companyId: company.company_id, name: company.name } : null;
  };
};

export default {
  parsePagination,
  listEnvelope,
  httpError,
  parseDateRange,
  monthBuckets,
  percentDelta,
  toNumber,
  rowTimestamp,
  resolveCompanies,
};
