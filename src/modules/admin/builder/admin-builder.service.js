import { Op, QueryTypes } from "sequelize";

import db from "../../../config/database/models/postgre-models/index.js";
import { parsePagination, listEnvelope, httpError, rowTimestamp, toNumber } from "../admin.helper.js";
import { wonFor, lostFor, quotedFor } from "../lead/admin-lead.service.js";

/**
 * Every builder on the platform, with the size of what sits under them.
 *
 * Counting rule, applied everywhere on this screen so two numbers can never
 * describe different populations:
 *   • a tenant row is reached by `company_id` OR `builder_id` — most tables
 *     carry only one of the two, and company_id != builder_id for some tenants;
 *   • soft-deleted rows are excluded wherever the table has the flag
 *     (`users.is_deleted`, `contractor.is_deleted`);
 *   • sample/demo data is INCLUDED, matching the existing Contractors,
 *     Suppliers, Facades and Dwellings screens, which do not filter it either.
 */

const TENANT = "(l.company_id = c.company_id OR l.builder_id = c.builder_id)";

const LEAD_ID = "l.leads_id";
const WON = wonFor(LEAD_ID);
const LOST = lostFor(LEAD_ID, "l.lead_lost_reason_id");
const QUOTED = quotedFor(LEAD_ID);

const COUNTS_SQL = `
  (SELECT count(*)::int FROM users u
     WHERE (u.company_id = c.company_id OR u.builder_id = c.builder_id) AND u.is_deleted = false) AS users,
  (SELECT count(*)::int FROM leads l WHERE ${TENANT}) AS leads,
  (SELECT count(*)::int FROM leads l WHERE ${TENANT} AND ${WON} AND NOT ${LOST}) AS leads_won,
  (SELECT count(*)::int FROM leads l WHERE ${TENANT} AND ${LOST}) AS leads_lost,
  (SELECT count(*)::int FROM leads l WHERE ${TENANT} AND NOT ${WON} AND NOT ${LOST} AND ${QUOTED}) AS leads_pending,
  (SELECT count(*)::int FROM leads l WHERE ${TENANT} AND NOT ${WON} AND NOT ${LOST} AND NOT ${QUOTED}) AS leads_new,
  (SELECT count(*)::int FROM supplier s
     WHERE s.company_id = c.company_id OR s.builder_id = c.builder_id) AS suppliers,
  (SELECT count(*)::int FROM contractor ct
     WHERE ct.builder_id = c.builder_id AND ct.is_deleted = false) AS contractors,
  (SELECT count(*)::int FROM facade f
     WHERE f.company_id = c.company_id OR f.builder_id = c.builder_id) AS facades,
  (SELECT count(*)::int FROM dwelling_type dt
     WHERE dt.company_id = c.company_id OR dt.builder_id = c.builder_id) AS dwellings,
  (SELECT count(*)::int FROM job j
     WHERE j.company_id = c.company_id OR j.builder_id = c.builder_id) AS jobs,
  (SELECT count(*)::int FROM landing_lead ll
     WHERE (ll.company_id = c.company_id OR ll.builder_id = c.builder_id) AND ll.status = 'released') AS landing_leads_released
`;

const BUILDER_SORTS = {
  name: "company_name",
  companyName: "company_name",
  company_name: "company_name",
  createdAt: "c.created_at",
  created_at: "c.created_at",
  leads: "leads",
  users: "users",
  jobs: "jobs",
};

const shapeBuilder = (row) => ({
  companyId: row.company_id,
  builderId: row.builder_id,
  name: row.builder_name || row.company_name,
  companyName: row.company_name,
  builderName: row.builder_name,
  email: row.email,
  phone: row.phone_number,
  abn: row.abn_number,
  website: row.website,
  logo: row.company_logo || row.logo,
  isOnboardingFinished: row.is_onboarding_finished,
  createdAt: rowTimestamp(row, "created_at"),
  counts: {
    users: toNumber(row.users),
    leads: toNumber(row.leads),
    leadsNew: toNumber(row.leads_new),
    leadsPending: toNumber(row.leads_pending),
    leadsWon: toNumber(row.leads_won),
    leadsLost: toNumber(row.leads_lost),
    suppliers: toNumber(row.suppliers),
    contractors: toNumber(row.contractors),
    facades: toNumber(row.facades),
    dwellings: toNumber(row.dwellings),
    jobs: toNumber(row.jobs),
    landingLeadsReleased: toNumber(row.landing_leads_released),
  },
});

export const listBuildersService = async ({ query }) => {
  const { sequelize } = db;
  const { page, limit, offset } = parsePagination(query);

  const search = query.search ? `%${String(query.search).trim()}%` : null;
  const searchSql = search
    ? "WHERE (c.name ILIKE :search OR b.name ILIKE :search OR b.email ILIKE :search)"
    : "";

  const sortColumn = BUILDER_SORTS[query.sort_by] || "company_name";
  const sortDirection = String(query.sort_dir || (sortColumn === "company_name" ? "asc" : "desc")).toLowerCase() === "asc"
    ? "ASC"
    : "DESC";

  const [rows, countRows] = await Promise.all([
    sequelize.query(
      `SELECT c.company_id,
              c.builder_id,
              c.name        AS company_name,
              c.website,
              c.company_logo,
              c.is_onboarding_finished,
              c.created_at,
              b.name        AS builder_name,
              b.email,
              b.phone_number,
              b.abn_number,
              b.logo,
              ${COUNTS_SQL}
         FROM company c
         LEFT JOIN builder b ON b.builder_id = c.builder_id
         ${searchSql}
        ORDER BY ${sortColumn} ${sortDirection}
        LIMIT :limit OFFSET :offset`,
      { replacements: { search, limit, offset }, type: QueryTypes.SELECT },
    ),
    sequelize.query(
      `SELECT count(*)::int AS total
         FROM company c
         LEFT JOIN builder b ON b.builder_id = c.builder_id
         ${searchSql}`,
      { replacements: { search }, type: QueryTypes.SELECT },
    ),
  ]);

  return listEnvelope(rows.map(shapeBuilder), countRows[0]?.total || 0, page, limit);
};

/** How many rows of each list the modal gets. The counts above are the truth. */
const SAMPLE = 10;

export const getBuilderService = async ({ companyId }) => {
  const { sequelize, Users, Supplier, Contractor, Facade, DwellingType, Leads, LandingLead, Role } = db;

  const [row] = await sequelize.query(
    `SELECT c.company_id,
            c.builder_id,
            c.name        AS company_name,
            c.website,
            c.company_logo,
            c.is_onboarding_finished,
            c.created_at,
            b.name        AS builder_name,
            b.email,
            b.phone_number,
            b.abn_number,
            b.logo,
            ${COUNTS_SQL}
       FROM company c
       LEFT JOIN builder b ON b.builder_id = c.builder_id
      WHERE c.company_id = :companyId`,
    { replacements: { companyId }, type: QueryTypes.SELECT },
  );

  if (!row) throw httpError(404, "Builder not found.");

  const tenant = { [Op.or]: [{ company_id: row.company_id }, { builder_id: row.builder_id }] };

  const [users, suppliers, contractors, facades, dwellings, leads, landingLeads] = await Promise.all([
    Users.findAll({
      where: { ...tenant, is_deleted: false },
      include: [{ model: Role, as: "role", attributes: ["name"], required: false }],
      attributes: ["users_id", "name", "email", "phone", "designation", "is_active", "root_user", "created_at"],
      order: [["root_user", "DESC"], ["created_at", "DESC"]],
      limit: SAMPLE,
      raw: true,
    }),
    Supplier.findAll({
      where: tenant,
      attributes: ["supplier_id", "company_name", "contact_name", "primary_phone", "city", "status", "created_at"],
      order: [["created_at", "DESC"]],
      limit: SAMPLE,
      raw: true,
    }),
    Contractor.findAll({
      where: { builder_id: row.builder_id, is_deleted: false },
      attributes: ["contractor_id", "name", "email", "phone", "created_at"],
      order: [["created_at", "DESC"]],
      limit: SAMPLE,
      raw: true,
    }),
    Facade.findAll({
      where: tenant,
      attributes: ["facade_id", "name", "status", "cost", "created_at"],
      order: [["created_at", "DESC"]],
      limit: SAMPLE,
      raw: true,
    }),
    DwellingType.findAll({
      where: tenant,
      attributes: ["dwelling_type_id", "name", "is_active", "created_at"],
      order: [["created_at", "DESC"]],
      limit: SAMPLE,
      raw: true,
    }),
    Leads.findAll({
      where: tenant,
      attributes: [
        "leads_id", "name", "email", "phone", "status", "reference_number", "created_at",
        [sequelize.literal(`(${wonFor("\"Leads\".\"leads_id\"")})`), "is_won"],
        [sequelize.literal(`(${lostFor("\"Leads\".\"leads_id\"", "\"Leads\".\"lead_lost_reason_id\"")})`), "is_lost"],
        [sequelize.literal(`(${quotedFor("\"Leads\".\"leads_id\"")})`), "is_quoted"],
      ],
      order: [["created_at", "DESC"]],
      limit: SAMPLE,
      raw: true,
    }),
    LandingLead.findAll({
      where: tenant,
      attributes: ["landing_lead_id", "name", "email", "status", "facade_name", "release_amount", "released_at", "created_at"],
      order: [["created_at", "DESC"]],
      limit: SAMPLE,
      raw: true,
    }),
  ]);

  const outcomeOf = (lead) => {
    if (lead.is_lost) return "lost";
    if (lead.is_won) return "won";
    return lead.is_quoted ? "pending" : "new";
  };

  return {
    ...shapeBuilder(row),
    sampleSize: SAMPLE,
    users: users.map((u) => ({
      usersId: u.users_id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      designation: u.designation,
      role: u["role.name"] || null,
      isActive: u.is_active,
      isRootUser: u.root_user,
      createdAt: rowTimestamp(u, "created_at"),
    })),
    suppliers: suppliers.map((s) => ({
      supplierId: s.supplier_id,
      companyName: s.company_name,
      contactName: s.contact_name,
      phone: s.primary_phone,
      city: s.city,
      status: s.status,
      createdAt: rowTimestamp(s, "created_at"),
    })),
    contractors: contractors.map((ct) => ({
      contractorId: ct.contractor_id,
      name: ct.name,
      email: ct.email,
      phone: ct.phone,
      createdAt: rowTimestamp(ct, "created_at"),
    })),
    facades: facades.map((f) => ({
      facadeId: f.facade_id,
      name: f.name,
      status: f.status,
      cost: f.cost === null || f.cost === undefined ? null : Number(f.cost),
      createdAt: rowTimestamp(f, "created_at"),
    })),
    dwellings: dwellings.map((d) => ({
      dwellingTypeId: d.dwelling_type_id,
      name: d.name,
      isActive: d.is_active,
      createdAt: rowTimestamp(d, "created_at"),
    })),
    leads: leads.map((l) => ({
      leadsId: l.leads_id,
      name: l.name,
      email: l.email,
      phone: l.phone,
      status: l.status,
      referenceNumber: l.reference_number,
      outcome: outcomeOf(l),
      createdAt: rowTimestamp(l, "created_at"),
    })),
    landingLeads: landingLeads.map((ll) => ({
      landingLeadId: ll.landing_lead_id,
      name: ll.name,
      email: ll.email,
      status: ll.status,
      facadeName: ll.facade_name,
      releaseAmount: ll.release_amount === null || ll.release_amount === undefined ? null : Number(ll.release_amount),
      releasedAt: rowTimestamp(ll, "released_at"),
      createdAt: rowTimestamp(ll, "created_at"),
    })),
  };
};

export default { listBuildersService, getBuilderService };
