import db from "../../config/database/models/postgre-models/index.js";
import { Op, literal } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import sendEmail from "../../service/sendMail.service.js";

/* ─── helpers ─────────────────────────────────────────────── */
function csvToArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  return val
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The campaign's contact_filter JSONB stores contactTypes as a comma-separated
 * string (e.g. "leads,supplier"). Consumers expect contactTypes back as an array
 * of strings, so reshape it on the (already camelCased) response object. Purely
 * a response transform — the stored JSONB is left untouched — and idempotent:
 * an already-array value is returned as-is.
 */
/**
 * Contacts never carry a city column of their own — the address lives in the
 * `address` table (users.address_id → address), in `property_detail` for a
 * lead's property address, or on the supplier row itself. These two helpers
 * turn whichever address record we joined into the flat display string the
 * contact list expects.
 */
function joinAddress(record) {
  if (!record) return "";
  return [record.address_line1, record.address_line2, record.city, record.zip_code]
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean)
    .join(", ");
}

/**
 * A lead can hold two addresses: the property address (property_detail) and the
 * contact address (leads_contact_map → users → address). `address_type` decides
 * which of them is eligible; when a city filter is active we show the address
 * that actually matched it.
 */
function pickLeadAddress(lead, { needle, useProperty, useContact }) {
  const candidates = [];
  if (useProperty && lead.propertyDetail) candidates.push(lead.propertyDetail);
  if (useContact) {
    (lead.contactMaps || []).forEach((m) => {
      if (m.contact?.address) candidates.push(m.contact.address);
    });
  }

  const n = needle?.toLowerCase();
  const matched = n
    ? candidates.find((a) => joinAddress(a).toLowerCase().includes(n))
    : null;
  return joinAddress(matched || candidates.find((a) => joinAddress(a)));
}

function withContactTypesAsArray(campaign) {
  if (campaign?.contactFilter && typeof campaign.contactFilter.contactTypes === "string") {
    campaign.contactFilter = {
      ...campaign.contactFilter,
      contactTypes: csvToArray(campaign.contactFilter.contactTypes),
    };
  }
  return campaign;
}

/* ─── LIST ─────────────────────────────────────────────────── */
export async function getCampaigns(currentUser, query) {
  const { Campaign, Users } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;

  let { page = 1, limit = 25, search, status } = query;
  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  const where = { is_deleted: false };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  if (search) where.name = { [Op.iLike]: `%${search}%` };
  if (status && status !== "all") where.status = status;

  const { count, rows } = await Campaign.findAndCountAll({
    where,
    limit,
    offset,
    order: [["created_at", "DESC"]],
    include: [
      { model: Users, as: "createdByUser", attributes: ["name"], required: false },
      { model: Users, as: "sentByUser", attributes: ["name"], required: false },
    ],
  });

  const campaigns = rows.map((r) => {
    const plain = r.get({ plain: true });
    return withContactTypesAsArray(keysToCamelCase({
      ...plain,
      created_by_name: plain.createdByUser?.name || null,
      sent_by_name: plain.sentByUser?.name || null,
    }));
  });

  return {
    campaigns,
    totalRecords: count,
    currentPage: page,
    limit,
    totalPages: Math.ceil(count / limit),
  };
}

/* ─── STATS ────────────────────────────────────────────────── */
export async function getCampaignStats(currentUser) {
  const { Campaign, UserGroup } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;

  const base = { is_deleted: false };
  if (builderId) base.builder_id = builderId;
  else if (companyId) base.company_id = companyId;

  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

  const [total, sent, lastMonthCreated, lastMonthSent, groups] = await Promise.all([
    Campaign.count({ where: base }),
    Campaign.count({ where: { ...base, status: "sent" } }),
    Campaign.count({ where: { ...base, created_at: { [Op.gte]: lastMonth } } }),
    Campaign.count({ where: { ...base, status: "sent", sent_at: { [Op.gte]: lastMonth } } }),
    UserGroup.count({ where: { ...(builderId ? { builder_id: builderId } : { company_id: companyId }), is_active: true } }),
  ]);

  return {
    created: total,
    sent,
    lastMonthCreated,
    lastMonthSent,
    groups,
    campaignContacts: 0,
    unsubscribed: 0,
    usage: 0,
  };
}

/* ─── GET BY ID ────────────────────────────────────────────── */
export async function getCampaignById(currentUser, campaignId) {
  const { Campaign, Users, CampaignFooter } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;

  const where = { campaign_id: campaignId, is_deleted: false };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  const campaign = await Campaign.findOne({
    where,
    include: [
      { model: Users, as: "createdByUser", attributes: ["name"], required: false },
      { model: Users, as: "sentByUser", attributes: ["name"], required: false },
      { model: CampaignFooter, as: "footer", required: false },
    ],
  });

  if (!campaign) throw { status: 404, message: "Campaign not found." };

  const plain = campaign.get({ plain: true });
  return withContactTypesAsArray(keysToCamelCase({
    ...plain,
    created_by_name: plain.createdByUser?.name || null,
    sent_by_name: plain.sentByUser?.name || null,
  }));
}

/* ─── CREATE ───────────────────────────────────────────────── */
export async function createCampaign(currentUser, body) {
  const { Campaign } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;
  const userId = currentUser?.user_id;

  const { name, type, subject, content, attachment_url, footer_id } = body;

  const campaign = await Campaign.create({
    company_id: companyId || null,
    builder_id: builderId || null,
    name: name || null,
    type: type || "email",
    subject: subject || null,
    content: content || null,
    attachment_url: attachment_url || null,
    footer_id: footer_id || null,
    status: "draft",
    created_by: userId,
    updated_by: userId,
  });

  return keysToCamelCase(campaign.get({ plain: true }));
}

/* ─── UPDATE ───────────────────────────────────────────────── */
export async function updateCampaign(currentUser, campaignId, body) {
  const { Campaign } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;
  const userId = currentUser?.user_id;

  const where = { campaign_id: campaignId, is_deleted: false };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  const campaign = await Campaign.findOne({ where });
  if (!campaign) throw { status: 404, message: "Campaign not found." };

  const { name, type, subject, content, attachment_url, footer_id } = body;
  const updateData = { updated_by: userId };
  if (name !== undefined) updateData.name = name;
  if (type !== undefined) updateData.type = type;
  if (subject !== undefined) updateData.subject = subject;
  if (content !== undefined) updateData.content = content;
  if (attachment_url !== undefined) updateData.attachment_url = attachment_url;
  if (footer_id !== undefined) updateData.footer_id = footer_id || null;

  await campaign.update(updateData);
  return withContactTypesAsArray(keysToCamelCase(campaign.get({ plain: true })));
}

/* ─── DELETE ───────────────────────────────────────────────── */
export async function deleteCampaign(currentUser, campaignId) {
  const { Campaign } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;
  const userId = currentUser?.user_id;

  const where = { campaign_id: campaignId, is_deleted: false };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  const campaign = await Campaign.findOne({ where });
  if (!campaign) throw { status: 404, message: "Campaign not found." };

  await campaign.update({ is_deleted: true, updated_by: userId });
  return { campaignId };
}

/* ─── GET FILTERED CONTACTS ────────────────────────────────── */
export async function getFilteredContacts(currentUser, query) {
  const { Leads, Users, UserGroup, AgentReferralPartner, Supplier, Role, Address, PropertyDetail, LeadsContactMap } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;

  const {
    page = 1,
    limit = 50,
    search,
    contact_types,
    lead_status,
    job_status,
    construction,
    rating,
    purpose,
    land,
    finance,
    client_type_id,
    assignee_id,
    created_at_from,
    created_at_to,
    address_type,
    address_field,
    address_search,
    group_ids,
    group_id,
  } = query;

  const pg = parseInt(page);
  const lm = parseInt(limit);

  const selectedTypes = csvToArray(contact_types);
  const allTypes = selectedTypes.length === 0;

  // No address_type means "either address"; otherwise only the requested one.
  const useProperty = !address_type || address_type === "property";
  const useContact = !address_type || address_type === "contact";

  // Address filter. The UI lets the user pick which field to search
  // (Full Address / Suburb / State / Post Code, arriving as `address_field`) and
  // type a value (`address_search`). We only filter when something was actually
  // typed — an empty search must never narrow results, otherwise clearing the
  // filters would hide every contact. (The typed value previously leaked in as a
  // literal `city` match of the *mode* string, e.g. "full_address", which matched
  // nothing and blanked the whole list.)
  const addressText = String(address_search || "").trim();
  const hasAddress = addressText.length > 0;
  const addressLike = { [Op.iLike]: `%${addressText}%` };

  const ADDRESS_COLUMNS = ["address_line1", "address_line2", "city", "zip_code"];

  // Columns each mode searches. `state` is a relation rather than a text column,
  // so it falls back to a broad address-line match (best-effort).
  const MODE_COLUMNS = {
    full_address: ADDRESS_COLUMNS,
    suburb: ["city"],
    post_code: ["zip_code"],
    state: ["address_line1", "address_line2", "city"],
  };
  const modeColumns = MODE_COLUMNS[address_field] || MODE_COLUMNS.full_address;

  // Build a where-fragment matching the mode's columns for a model that exposes
  // some of `available`. Returns null when no filter is active or none apply.
  const addressWhereFor = (available) => {
    if (!hasAddress) return null;
    const cols = modeColumns.filter((c) => available.includes(c));
    if (!cols.length) return null;
    return { [Op.or]: cols.map((c) => ({ [c]: addressLike })) };
  };

  /** address join for anything that hangs off users.address_id */
  const userAddressInclude = () => {
    const addrWhere = addressWhereFor(ADDRESS_COLUMNS);
    return {
      model: Address,
      as: "address",
      attributes: ["address_line1", "address_line2", "city", "zip_code"],
      required: Boolean(addrWhere),
      ...(addrWhere ? { where: addrWhere } : {}),
    };
  };

  let allContacts = [];

  /* ── Leads/jobs ── */
  if (allTypes || selectedTypes.includes("leads")) {
    const where = {};
    if (builderId) where.builder_id = builderId;
    else if (companyId) where.company_id = companyId;
    where.email = { [Op.ne]: null, [Op.ne]: "" };

    const leadStatuses = csvToArray(lead_status);
    const jobStatuses = csvToArray(job_status);

    // Lead-status filter. `leads.status` only ever holds New/Working/Convert;
    // opportunity-stage concepts (open opportunity, lost, on hold) live on the
    // related `opportunity` row. Translate each UI label to the matching
    // condition — mirroring how the Leads list resolves status — instead of
    // comparing against status strings that never exist on the leads table.
    const statusOr = [];
    const directLeadStatuses = [];
    const oppExists = (cond) =>
      literal(
        `EXISTS (SELECT 1 FROM opportunity o WHERE o.leads_id = "Leads"."leads_id" AND ${cond})`
      );

    leadStatuses.forEach((label) => {
      switch (label) {
        case "Open-Leads":
          directLeadStatuses.push("New", "Working");
          break;
        case "Open-Opportunity":
          directLeadStatuses.push("Convert");
          break;
        case "Closed Lost":
          statusOr.push(oppExists("LOWER(o.out_come) = 'lost'"));
          break;
        case "On Hold":
          statusOr.push(oppExists("o.status = 'On Hold'"));
          break;
        default:
          // Unknown label: fall back to a direct match so callers passing raw
          // status values still work.
          directLeadStatuses.push(label);
      }
    });

    const constructionStatuses = csvToArray(construction);
    if (constructionStatuses.length > 0) {
      jobStatuses.push(...constructionStatuses);
    }

    // If there is a job status filter, we must also match Leads that have been converted
    if (jobStatuses.length) {
      directLeadStatuses.push("Convert");
    }

    if (directLeadStatuses.length) {
      statusOr.push({ status: { [Op.in]: [...new Set(directLeadStatuses)] } });
    }

    if (statusOr.length) {
      where[Op.and] = [...(where[Op.and] || []), { [Op.or]: statusOr }];
    }

    if (csvToArray(rating).length) where.rating = { [Op.in]: csvToArray(rating) };
    if (csvToArray(purpose).length) where.purpose = { [Op.in]: csvToArray(purpose) };
    if (land) where.land = land;
    if (finance) where.finance = finance;
    if (client_type_id) where.client_type_id = client_type_id;
    if (assignee_id) where.assignee_id = assignee_id;

    if (created_at_from && created_at_to) {
      where.created_at = { [Op.between]: [created_at_from, created_at_to] };
    } else if (created_at_from) {
      where.created_at = { [Op.gte]: created_at_from };
    } else if (created_at_to) {
      where.created_at = { [Op.lte]: created_at_to };
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const include = [];
    if (jobStatuses.length) {
      include.push({
        model: db.Opportunity,
        as: "opportunities",
        required: true,
        include: [{
          model: db.Job,
          as: "jobs",
          required: true,
          where: { status: { [Op.in]: jobStatuses } }
        }]
      });
    }

    /* The leads row has no city of its own: the property address sits on
       property_detail and the contact address on leads_contact_map → users →
       address. Join whichever of the two address_type allows. When only one is
       eligible the join itself filters (required + where); when both are, the
       city has to match either side, so it becomes an OR over the joined
       columns — which needs subQuery:false for the $nested$ refs to resolve. */
    const bothAddresses = hasAddress && useProperty && useContact;

    if (useProperty) {
      // When both address types are eligible the match is applied as the OR below
      // (needs subQuery:false), so this join stays optional in that case.
      const propWhere = !useContact ? addressWhereFor(ADDRESS_COLUMNS) : null;
      include.push({
        model: PropertyDetail,
        as: "propertyDetail",
        attributes: ["address_line1", "address_line2", "city", "zip_code"],
        required: Boolean(propWhere),
        ...(propWhere ? { where: propWhere } : {}),
      });
    }

    if (useContact) {
      const contactWhere = !useProperty ? addressWhereFor(ADDRESS_COLUMNS) : null;
      const contactAddressRequired = Boolean(contactWhere);
      include.push({
        model: LeadsContactMap,
        as: "contactMaps",
        attributes: ["id"],
        required: contactAddressRequired,
        include: [{
          model: Users,
          as: "contact",
          attributes: ["users_id"],
          required: contactAddressRequired,
          include: [{
            model: Address,
            as: "address",
            attributes: ["address_line1", "address_line2", "city", "zip_code"],
            required: contactAddressRequired,
            ...(contactWhere ? { where: contactWhere } : {}),
          }],
        }],
      });
    }

    if (bothAddresses) {
      const cols = modeColumns.filter((c) => ADDRESS_COLUMNS.includes(c));
      const ors = [];
      cols.forEach((c) => {
        ors.push({ [`$propertyDetail.${c}$`]: addressLike });
        ors.push({ [`$contactMaps.contact.address.${c}$`]: addressLike });
      });
      if (ors.length) {
        where[Op.and] = [...(where[Op.and] || []), { [Op.or]: ors }];
      }
    }

    const leads = await Leads.findAll({
      where,
      attributes: ["leads_id", "name", "email", "phone"],
      limit: 500,
      include,
      ...(bothAddresses ? { subQuery: false } : {}),
    });
    leads.forEach((row) => {
      const l = row.get({ plain: true });
      allContacts.push({
        id: l.leads_id,
        type: "lead",
        name: l.name,
        email: l.email,
        phone: l.phone || "",
        address: pickLeadAddress(l, { needle: addressText, useProperty, useContact }),
      });
    });
  }

  /* ── Import Contacts / Campaign Contacts ── */
  if (
    allTypes ||
    selectedTypes.includes("import") ||
    selectedTypes.includes("campaign_contacts")
  ) {
    const where = { is_deleted: false };
    if (builderId) where.builder_id = builderId;
    else if (companyId) where.company_id = companyId;
    where.email = { [Op.ne]: null };

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const contacts = await Users.findAll({
      where,
      include: [
        { model: Role, as: "role", where: { name: { [Op.iLike]: "contact" } }, attributes: [] },
        userAddressInclude(),
      ],
      attributes: ["users_id", "name", "email", "phone"],
      limit: 500,
    });

    contacts.forEach((c) => {
      allContacts.push({
        id: c.users_id,
        type: "contact",
        name: c.name,
        email: c.email,
        phone: c.phone || "",
        address: joinAddress(c.address),
      });
    });
  }

  /* ── Groups ── */
  if (allTypes || selectedTypes.includes("groups")) {
    const groupWhere = { is_active: true };
    if (builderId) groupWhere.builder_id = builderId;
    else if (companyId) groupWhere.company_id = companyId;

    const selectedGroupIds = [
      ...csvToArray(group_ids),
      ...csvToArray(group_id),
    ];
    if (selectedGroupIds.length > 0) {
      groupWhere.user_group_id = { [Op.in]: selectedGroupIds };
    }

    const groups = await UserGroup.findAll({ where: groupWhere, attributes: ["user_group_id", "name", "users_id"] });
    const allUserIds = [...new Set(groups.flatMap((g) => g.users_id || []))];

    if (allUserIds.length) {
      const groupUserWhere = { users_id: { [Op.in]: allUserIds }, is_deleted: false, email: { [Op.ne]: null } };
      if (search) {
        groupUserWhere[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
        ];
      }
      const groupUsers = await Users.findAll({
        where: groupUserWhere,
        attributes: ["users_id", "name", "email", "phone"],
        include: [userAddressInclude()],
      });
      groupUsers.forEach((u) => {
        allContacts.push({ id: u.users_id, type: "group", name: u.name, email: u.email, phone: u.phone || "", address: joinAddress(u.address) });
      });
    }
  }

  /* ── Referral Partners ── */
  if (allTypes || selectedTypes.includes("referral")) {
    const refWhere = {};
    if (builderId) refWhere.builder_id = builderId;
    else if (companyId) refWhere.company_id = companyId;

    const referrals = await AgentReferralPartner.findAll({
      where: refWhere,
      include: [{
        model: Users,
        as: "user",
        attributes: ["users_id", "name", "email", "phone"],
        required: hasAddress,
        include: [userAddressInclude()],
      }],
      attributes: ["agent_referral_partner_id"],
      limit: 500,
    });

    referrals.forEach((r) => {
      if (r.user?.email) {
        const matches =
          !search ||
          r.user.name?.toLowerCase().includes(search.toLowerCase()) ||
          r.user.email?.toLowerCase().includes(search.toLowerCase());
        if (matches) {
          allContacts.push({ id: r.agent_referral_partner_id, type: "referral", name: r.user.name, email: r.user.email, phone: r.user.phone || "", address: joinAddress(r.user.address) });
        }
      }
    });
  }

  /* ── Supplier/Trades ── */
  if (allTypes || selectedTypes.includes("supplier")) {
    const supWhere = { status: true };
    if (builderId) supWhere.builder_id = builderId;
    else if (companyId) supWhere.company_id = companyId;

    if (search) {
      supWhere[Op.or] = [
        { company_name: { [Op.iLike]: `%${search}%` } },
        { contact_name: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Suppliers keep their address on the supplier row itself, not in `address`
    // (only address_line1 + city are available, so post_code searches can't match).
    const supAddr = addressWhereFor(["address_line1", "city"]);
    if (supAddr) {
      supWhere[Op.and] = [...(supWhere[Op.and] || []), supAddr];
    }

    const suppliers = await Supplier.findAll({ where: supWhere, attributes: ["supplier_id", "company_name", "contact_name", "email", "primary_phone", "city", "address_line1"], limit: 500 });
    suppliers.forEach((s) => {
      const email = s.email?.trim();
      if (email) {
        allContacts.push({
          id: s.supplier_id,
          type: "supplier",
          name: s.contact_name || s.company_name,
          email,
          phone: s.primary_phone || "",
          address: [s.address_line1, s.city].filter(Boolean).join(", "),
        });
      }
    });
  }

  /* ── Deduplicate by email ── */
  const seen = new Set();
  const deduped = allContacts.filter((c) => {
    if (!c.email || seen.has(c.email.toLowerCase())) return false;
    seen.add(c.email.toLowerCase());
    return true;
  });

  const total = deduped.length;
  const paginated = deduped.slice((pg - 1) * lm, pg * lm);

  return {
    contacts: paginated,
    totalRecords: total,
    currentPage: pg,
    limit: lm,
    totalPages: Math.ceil(total / lm),
  };
}

/* ─── SAVE CONTACT SELECTION ───────────────────────────────── */
export async function saveContactSelection(currentUser, campaignId, body) {
  const { Campaign } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;
  const userId = currentUser?.user_id;

  const where = { campaign_id: campaignId, is_deleted: false };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  const campaign = await Campaign.findOne({ where });
  if (!campaign) throw { status: 404, message: "Campaign not found." };

  await campaign.update({
    contact_filter: body.contact_filter || null,
    selected_contact_ids: body.selected_contact_ids || [],
    updated_by: userId,
  });

  return withContactTypesAsArray(keysToCamelCase(campaign.get({ plain: true })));
}

/* ─── SEND TEST EMAIL ──────────────────────────────────────── */
export async function sendTestEmail(currentUser, campaignId, body) {
  const { Campaign, CampaignFooter } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;

  const where = { campaign_id: campaignId, is_deleted: false };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  const campaign = await Campaign.findOne({ 
    where,
    include: [{ model: CampaignFooter, as: 'footer' }]
  });
  if (!campaign) throw { status: 404, message: "Campaign not found." };

  const { emails } = body;

  await Promise.all(
    emails.map((email) => {
      const attachmentKeys = campaign.attachment_url ? [{
        key: campaign.attachment_url,
        filename: campaign.attachment_url.split('/').pop()
      }] : [];
      const finalHtml = `${campaign.content || ""}${campaign.footer?.content ? `<br/><br/>${campaign.footer.content}` : ""}`;
      return sendEmail(
        email,
        campaign.subject || `Test: ${campaign.name || "Campaign"}`,
        campaign.content || "",
        finalHtml,
        [],
        null,
        attachmentKeys
      );
    })
  );

  return { sent: emails.length };
}

/* ─── SEND CAMPAIGN ────────────────────────────────────────── */
export async function sendCampaign(currentUser, campaignId) {
  const { Campaign, CampaignFooter } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;
  const userId = currentUser?.user_id;

  const where = { campaign_id: campaignId, is_deleted: false };
  if (builderId) where.builder_id = builderId;
  else if (companyId) where.company_id = companyId;

  const campaign = await Campaign.findOne({ 
    where,
    include: [{ model: CampaignFooter, as: 'footer' }]
  });
  if (!campaign) throw { status: 404, message: "Campaign not found." };
  if (campaign.status === "sent") throw { status: 400, message: "Campaign has already been sent." };

  const selectedContacts = campaign.selected_contact_ids || [];
  if (!selectedContacts.length) throw { status: 400, message: "No contacts selected for this campaign." };

  const emails = [...new Set(selectedContacts.map((c) => c.email).filter(Boolean))];
  if (!emails.length) throw { status: 400, message: "No valid email addresses in selected contacts." };

  await Promise.all(
    emails.map((email) => {
      const attachmentKeys = campaign.attachment_url ? [{
        key: campaign.attachment_url,
        filename: campaign.attachment_url.split('/').pop()
      }] : [];
      const finalHtml = `${campaign.content || ""}${campaign.footer?.content ? `<br/><br/>${campaign.footer.content}` : ""}`;
      return sendEmail(
        email,
        campaign.subject || campaign.name || "Campaign",
        campaign.content || "",
        finalHtml,
        [],
        null,
        attachmentKeys
      );
    })
  );

  await campaign.update({
    status: "sent",
    sent_at: new Date(),
    sent_by: userId,
    updated_by: userId,
  });

  return { sent: emails.length, campaignId };
}

export default {
  getCampaigns,
  getCampaignStats,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getFilteredContacts,
  saveContactSelection,
  sendTestEmail,
  sendCampaign,
};
