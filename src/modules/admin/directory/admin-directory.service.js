import { Op } from "sequelize";

import db from "../../../config/database/models/postgre-models/index.js";
import { parsePagination, parseSort, withCamelAliases, listEnvelope, resolveCompanies, rowTimestamp } from "../admin.helper.js";

const searchOr = (search, fields) => {
  const term = `%${String(search).trim()}%`;
  return { [Op.or]: fields.map((field) => ({ [field]: { [Op.iLike]: term } })) };
};

export const CONTRACTOR_SORTS = withCamelAliases({ name: "name", created_at: "created_at" });

export const SUPPLIER_SORTS = withCamelAliases({
  company_name: "company_name",
  contact_name: "contact_name",
  city: "city",
  created_at: "created_at",
});

export const listContractorsService = async ({ query }) => {
  const { Contractor, Service, Company } = db;
  const { page, limit, offset } = parsePagination(query);

  const where = { is_deleted: false };

  // contractor carries only builder_id, so a company filter resolves through the
  // company's builder first.
  if (query.company_id) {
    const company = await Company.findByPk(query.company_id, { attributes: ["builder_id"], raw: true });
    where.builder_id = company?.builder_id || query.company_id;
  }

  if (query.search) Object.assign(where, searchOr(query.search, ["name", "email", "phone", "address"]));

  const { count, rows } = await Contractor.findAndCountAll({
    where,
    include: [{ model: Service, as: "service", attributes: ["service_id", "service"], required: false }],
    order: parseSort(query, CONTRACTOR_SORTS, "name"),
    limit,
    offset,
    raw: true,
    distinct: true,
  });

  const companyOf = await resolveCompanies(db, rows);

  const items = rows.map((row) => ({
    contractorId: row.contractor_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    company: companyOf(row),
    service: row["service.service_id"]
      ? { serviceId: row["service.service_id"], name: row["service.service"] }
      : null,
    createdAt: rowTimestamp(row, "created_at"),
  }));

  return listEnvelope(items, count, page, limit);
};

export const listSuppliersService = async ({ query }) => {
  const { Supplier, SupplierType } = db;
  const { page, limit, offset } = parsePagination(query);

  const where = {};
  if (query.company_id) where.company_id = query.company_id;
  if (query.status !== undefined && query.status !== "") where.status = query.status;
  if (query.search) {
    Object.assign(where, searchOr(query.search, ["company_name", "contact_name", "abn", "city", "primary_phone"]));
  }

  const { count, rows } = await Supplier.findAndCountAll({
    where,
    order: parseSort(query, SUPPLIER_SORTS, "company_name"),
    limit,
    offset,
    raw: true,
    distinct: true,
  });

  // supplier.supplier_type_id is a uuid[] and the model's only association to
  // supplier_type is the many-to-many map table, so labels are resolved here.
  const typeIds = [...new Set(rows.flatMap((r) => (Array.isArray(r.supplier_type_id) ? r.supplier_type_id : [])).filter(Boolean))];
  const [companyOf, types] = await Promise.all([
    resolveCompanies(db, rows),
    typeIds.length
      ? SupplierType.findAll({
        where: { supplier_type_id: { [Op.in]: typeIds } },
        attributes: ["supplier_type_id", "name"],
        raw: true,
      })
      : [],
  ]);

  const typeMap = new Map(types.map((t) => [t.supplier_type_id, t]));

  const items = rows.map((row) => ({
    supplierId: row.supplier_id,
    companyName: row.company_name,
    contactName: row.contact_name,
    abn: row.abn,
    primaryPhone: row.primary_phone,
    secondaryPhone: row.secondary_phone,
    email: row.email,
    website: row.website,
    city: row.city,
    zipCode: row.zip_code,
    leadTime: row.lead_time,
    status: row.status,
    inductionPackReceived: row.induction_pack_received,
    company: companyOf(row),
    supplierTypes: (Array.isArray(row.supplier_type_id) ? row.supplier_type_id : [])
      .filter((id) => typeMap.has(id))
      .map((id) => ({ supplierTypeId: id, name: typeMap.get(id).name })),
    createdAt: rowTimestamp(row, "created_at"),
  }));

  return listEnvelope(items, count, page, limit);
};

export default { listContractorsService, listSuppliersService };
