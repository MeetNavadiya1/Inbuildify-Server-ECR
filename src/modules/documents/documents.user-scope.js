import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";

/**
 * ─── Documents — user scoping ────────────────────────────────────────────────
 *
 * Documents are stored against a Lead or a Job (polymorphic reference_id /
 * reference_type on drive_files), so "show me this user's documents" has to be
 * resolved into the set of leads + jobs that user is attached to, and from there
 * into the full set of reference ids their files can carry.
 *
 * A user is attached to work in five ways — all five count:
 *
 *   leads.assignee_id          the salesperson who owns the lead
 *   leads.created_by           whoever entered it
 *   leads_contact_map          the customer named on the lead (a Contact user)
 *   job.supervisor_id          the site supervisor running the build
 *   job.customer_contact_id    the homebuyer's portal contact (also a users row)
 *
 * The contact map is what makes a customer reachable before their lead converts:
 * a homebuyer is neither the assignee nor the creator of their own lead, and
 * job.customer_contact_id only comes into existence at conversion — so without
 * it a customer would have no documents until a job was raised for them.
 *
 * The set is then closed over the lead ⇄ job link: a lead the user owns brings
 * that lead's jobs, and a job they supervise brings the lead behind it. That is
 * what makes the result "every document for this user, regardless of which Lead
 * or Job it happens to hang off".
 *
 * Files the user uploaded anywhere else (including the reference-less global
 * drive) are folded in separately by the callers, which key on
 * drive_files.uploaded_by.
 */

/** A row is visible if it belongs to the caller's builder or company. */
function buildTenantScope(user) {
  const conditions = [];
  if (user?.builder_id) {
    conditions.push({ builder_id: user.builder_id });
  }
  if (user?.company_id) {
    conditions.push({ company_id: user.company_id });
  }
  // No tenant on the token → a condition that can never match, so an unscoped
  // caller never sees another tenant's rows.
  if (!conditions.length) {
    return { [Op.and]: [{ company_id: null }, { company_id: { [Op.ne]: null } }] };
  }
  return { [Op.or]: conditions };
}

const uniq = (values) => [...new Set(values.filter(Boolean))];

/**
 * Load the target user, bounded by the caller's tenant.
 * @returns {Promise<null|object>} null when the user does not exist or is out of
 *          the caller's scope.
 */
export async function resolveScopedUser(userId, requester) {
  if (!userId) {
    return null;
  }
  return db.Users.findOne({
    where: { users_id: userId, is_deleted: false, ...buildTenantScope(requester) },
    attributes: ["users_id", "name", "email", "initials", "photo", "company_id", "builder_id"],
  });
}

/**
 * Every lead + job the user is attached to, closed over the lead ⇄ job link.
 *
 * @returns {Promise<null|{user:object, leadIds:string[], jobIds:string[]}>}
 *          null when the user is unknown / out of scope.
 */
export async function resolveUserEntityIds(userId, requester) {
  const user = await resolveScopedUser(userId, requester);
  if (!user) {
    return null;
  }

  const tenant = buildTenantScope(requester);

  // 0. The leads this user is the named contact on. Read first because it widens
  //    the lead query below; the tenant scope still applies there, so a map row
  //    pointing at another tenant's lead brings nothing back.
  const contactMaps = await db.LeadsContactMap.findAll({
    where: { contact_id: userId },
    attributes: ["leads_id"],
  });
  const contactLeadIds = uniq(contactMaps.map((m) => m.leads_id));

  const leadAttachment = [{ assignee_id: userId }, { created_by: userId }];
  if (contactLeadIds.length) {
    leadAttachment.push({ leads_id: { [Op.in]: contactLeadIds } });
  }

  // 1. Directly attached leads and jobs.
  const [ownLeads, ownJobs] = await Promise.all([
    db.Leads.findAll({
      where: {
        [Op.and]: [tenant, { [Op.or]: leadAttachment }],
      },
      attributes: ["leads_id"],
    }),
    db.Job.findAll({
      where: {
        [Op.and]: [tenant, { [Op.or]: [{ supervisor_id: userId }, { customer_contact_id: userId }] }],
      },
      attributes: ["job_id", "opportunity_id"],
    }),
  ]);

  const leadIds = new Set(ownLeads.map((l) => l.leads_id));
  const jobIds = new Set(ownJobs.map((j) => j.job_id));

  // 2. Close the loop both ways: the leads behind the user's jobs, and the jobs
  //    hanging off the user's leads. Both hops go through `opportunity`.
  const jobOpportunityIds = uniq(ownJobs.map((j) => j.opportunity_id));
  const [opportunitiesOfJobs, opportunitiesOfLeads] = await Promise.all([
    jobOpportunityIds.length
      ? db.Opportunity.findAll({
        where: { opportunity_id: { [Op.in]: jobOpportunityIds } },
        attributes: ["opportunity_id", "leads_id"],
      })
      : [],
    leadIds.size
      ? db.Opportunity.findAll({
        where: { leads_id: { [Op.in]: [...leadIds] } },
        attributes: ["opportunity_id", "leads_id"],
      })
      : [],
  ]);

  for (const o of opportunitiesOfJobs) {
    if (o.leads_id) {
      leadIds.add(o.leads_id);
    }
  }

  const relatedOpportunityIds = uniq(opportunitiesOfLeads.map((o) => o.opportunity_id));
  if (relatedOpportunityIds.length) {
    const relatedJobs = await db.Job.findAll({
      where: { [Op.and]: [tenant, { opportunity_id: { [Op.in]: relatedOpportunityIds } }] },
      attributes: ["job_id"],
    });
    for (const j of relatedJobs) {
      jobIds.add(j.job_id);
    }
  }

  return { user, leadIds: [...leadIds], jobIds: [...jobIds] };
}

/**
 * The full set of drive_files.reference_id values the user's documents can
 * carry. Files do not all hang off the lead/job id itself — quotation reports
 * key on quotation_version_id, floor plans / facades on the property detail,
 * variation PDFs on variation_id, invoices on job_invoice_id. This walks each of
 * those in a fixed number of set-based queries (never per lead/job), so it stays
 * cheap for a user with hundreds of leads.
 *
 * @param {object} [preResolved] the result of an earlier resolveUserEntityIds
 *        call, so a caller that already has it does not pay for it twice.
 * @returns {Promise<null|{user, leadIds, jobIds, referenceIds:string[]}>}
 */
export async function collectUserReferenceIds(userId, requester, preResolved = null) {
  const resolved = preResolved || (await resolveUserEntityIds(userId, requester));
  if (!resolved) {
    return null;
  }

  const { user, leadIds, jobIds } = resolved;
  const referenceIds = new Set([...leadIds, ...jobIds]);

  const [leads, quotations, variations, jobInvoices] = await Promise.all([
    leadIds.length
      ? db.Leads.findAll({
        where: { leads_id: { [Op.in]: leadIds } },
        attributes: ["leads_id", "property_detail_id"],
      })
      : [],
    leadIds.length
      ? db.Quotation.findAll({
        where: { leads_id: { [Op.in]: leadIds } },
        attributes: ["quotation_id"],
        include: [
          { model: db.QuotationVersion, as: "versions", attributes: ["quotation_version_id"] },
        ],
      })
      : [],
    jobIds.length
      ? db.JobVariation.findAll({
        where: { job_id: { [Op.in]: jobIds } },
        attributes: ["variation_id"],
      })
      : [],
    jobIds.length
      ? db.JobInvoice.findAll({
        where: { job_id: { [Op.in]: jobIds } },
        attributes: ["job_invoice_id"],
      })
      : [],
  ]);

  for (const l of leads) {
    if (l.property_detail_id) {
      referenceIds.add(l.property_detail_id);
    }
  }
  for (const q of quotations) {
    for (const v of q.versions || []) {
      referenceIds.add(v.quotation_version_id);
    }
  }
  for (const v of variations) {
    referenceIds.add(v.variation_id);
  }
  for (const i of jobInvoices) {
    referenceIds.add(i.job_invoice_id);
  }

  return { user, leadIds, jobIds, referenceIds: [...referenceIds] };
}

/**
 * Every drive_files.reference_id a single lead's documents can carry — the lead
 * itself, its property detail, and every one of its quotation versions. Powers
 * the "Customer-wise" document filter (a customer is a lead/client). Match with
 * `reference_id IN (...) OR lead_id = leadId` so denormalised lead files count too.
 *
 * @returns {Promise<null|{leadId:string, referenceIds:string[]}>} null when the
 *          lead is unknown / out of the caller's tenant.
 */
export async function collectLeadReferenceIds(leadId, requester) {
  const tenant = buildTenantScope(requester);
  const lead = await db.Leads.findOne({
    where: { leads_id: leadId, ...tenant },
    attributes: ["leads_id", "property_detail_id"],
  });
  if (!lead) {
    return null;
  }

  const referenceIds = new Set([lead.leads_id]);
  if (lead.property_detail_id) {
    referenceIds.add(lead.property_detail_id);
  }

  const quotations = await db.Quotation.findAll({
    where: { leads_id: leadId },
    attributes: ["quotation_id"],
    include: [{ model: db.QuotationVersion, as: "versions", attributes: ["quotation_version_id"] }],
  });
  for (const q of quotations) {
    for (const v of q.versions || []) {
      referenceIds.add(v.quotation_version_id);
    }
  }

  return { leadId, referenceIds: [...referenceIds] };
}

/**
 * Every drive_files.reference_id a single job's documents can carry — the job
 * itself plus its variation and invoice ids. Powers the "Project-wise" filter (a
 * project is a job). Quotation / property paperwork stays under the customer
 * (lead) filter, so the two filters read as distinct, non-overlapping views.
 *
 * @returns {Promise<null|{jobId:string, referenceIds:string[]}>} null when the
 *          job is unknown / out of the caller's tenant.
 */
export async function collectJobReferenceIds(jobId, requester) {
  const tenant = buildTenantScope(requester);
  const job = await db.Job.findOne({
    where: { job_id: jobId, ...tenant },
    attributes: ["job_id"],
  });
  if (!job) {
    return null;
  }

  const referenceIds = new Set([job.job_id]);

  const [variations, invoices] = await Promise.all([
    db.JobVariation.findAll({ where: { job_id: jobId }, attributes: ["variation_id"] }),
    db.JobInvoice.findAll({ where: { job_id: jobId }, attributes: ["job_invoice_id"] }),
  ]);
  for (const v of variations) {
    referenceIds.add(v.variation_id);
  }
  for (const i of invoices) {
    referenceIds.add(i.job_invoice_id);
  }

  return { jobId, referenceIds: [...referenceIds] };
}

/**
 * The user a Job or Lead's documents should be grouped under, so the per-entity
 * Documents tabs can switch from "this job's files" to "this user's files"
 * without the client having to know the ownership rules.
 *
 * Preference order — most specific owner of the paperwork first:
 *   job   → customer_contact_id → supervisor_id → its lead's assignee_id → created_by
 *   lead  → assignee_id → created_by
 *
 * @returns {Promise<string|null>} a users_id, or null when nothing is attached.
 */
export async function resolveUserForEntity(entityType, entityId, requester) {
  const tenant = buildTenantScope(requester);
  const type = String(entityType || "").toLowerCase();

  if (type === "lead") {
    const lead = await db.Leads.findOne({
      where: { leads_id: entityId, ...tenant },
      attributes: ["assignee_id", "created_by"],
    });
    return lead?.assignee_id || lead?.created_by || null;
  }

  if (type === "job") {
    const job = await db.Job.findOne({
      where: { job_id: entityId, ...tenant },
      attributes: ["job_id", "supervisor_id", "customer_contact_id"],
      include: [
        {
          model: db.Opportunity,
          as: "opportunity",
          attributes: ["opportunity_id"],
          include: [{ model: db.Leads, as: "lead", attributes: ["assignee_id", "created_by"] }],
        },
      ],
    });
    if (!job) {
      return null;
    }
    const lead = job.opportunity?.lead;
    return (
      job.customer_contact_id ||
      job.supervisor_id ||
      lead?.assignee_id ||
      lead?.created_by ||
      null
    );
  }

  return null;
}

export default {
  resolveScopedUser,
  resolveUserEntityIds,
  collectUserReferenceIds,
  collectLeadReferenceIds,
  collectJobReferenceIds,
  resolveUserForEntity,
};
