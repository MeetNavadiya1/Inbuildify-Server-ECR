import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";
import { sampleDataSqlScope } from "../../config/database/models/postgre-models/sampleDataFlag.js";
// `Op` is used by the duplicate-name check and by updateLead. It was missing from
// this import, so both threw ReferenceError the moment they were reached.
import { Op, QueryTypes } from "sequelize";
import logger from "../../utils/logger.js";
import { findRoleForCompany } from "../../helper/rbac.helper.js";

/**
 * What "Converted" means, in one place.
 *
 * A lead is converted once it has become an opportunity. `convertLeadToOpportunity`
 * stamps `leads.status = 'Convert'` when it does that, but the status alone is not
 * a safe test on its own: a lead converted before that stamp existed, or one whose
 * status was edited afterwards, still has the opportunity to prove it. Both are
 * accepted, so the tab and its count agree with what the pipeline actually holds.
 *
 * Exported because the list filter and the Leads-List counts both have to ask the
 * identical question — a tab reading one definition and its badge another is how
 * you get a tab showing 20 that opens onto 14 rows.
 *
 * Expects the leads table aliased as `l`.
 */
export const CONVERTED_LEAD_SQL =
  "(l.status = 'Convert' OR EXISTS (SELECT 1 FROM opportunity o WHERE o.leads_id = l.leads_id))";

/**
 * The time window a `created_at` filter token stands for.
 *
 * Shared by the list and by the tab counts that label it, so the two can never
 * disagree about where "today" starts — the kind of drift that shows up as a
 * badge promising rows the list will not hand over.
 *
 * @returns {null | {start: Date, end?: Date}} null for an empty or unknown token
 */
export function resolveCreatedAtRange(token) {
  if (!token) return null;

  const now = Date.now();
  const midnight = () => new Date(new Date().setHours(0, 0, 0, 0));
  const ago = (ms) => new Date(now - ms);
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  switch (String(token).toLowerCase()) {
    case "last_15_minutes": return { start: ago(15 * MINUTE) };
    case "last_1_hour": return { start: ago(HOUR) };
    case "last_2_hours": return { start: ago(2 * HOUR) };
    case "last_24_hours": return { start: ago(DAY) };
    case "today": return { start: midnight() };
    case "yesterday": return { start: new Date(midnight().getTime() - DAY), end: midnight() };
    case "last_7_days": return { start: ago(7 * DAY) };
    case "last_15_days": return { start: ago(15 * DAY) };
    case "last_30_days": return { start: ago(30 * DAY) };
    default: return null;
  }
}

class LeadsRepository {
  constructor() {}

  async createLead(leadData) {
    const t = await db.sequelize.transaction();
    try {
      const { Leads, Users, LeadsContactMap, LeadSource, Address } = db.sequelize.models;

      const {
        company_id, builder_id, name, email, phone,
        notes, send_letter, lead_source_id, status, rating, land, finance,
        face_to_face, purpose, assignee_id, created_by, reference_number,
        house_land_package_id, property_detail_id,
      } = leadData;

      // 1. Insert lead
      const lead = await Leads.create({
        company_id, builder_id, name, email, phone,
        notes, 
        send_letter: send_letter === true || send_letter === "true",
        lead_source_id, status, rating, land, finance,
        face_to_face, purpose, assignee_id, created_by, updated_by: created_by,
        reference_number, house_land_package_id, property_detail_id,
      }, { transaction: t });

      // 2. Auto-create/find contact
      let contact = await Users.findOne({
        where: { email, builder_id, is_deleted: false },
        transaction: t
      });

      if (!contact) {
        // This company's copy of the Contact role, not the global template row —
        // only the company copy is reachable from Role Management.
        const contactRole = await findRoleForCompany("Contact", company_id, { transaction: t });
        if (!contactRole) {
          throw new Error("Contact role not found in database");
        }

        contact = await Users.create({
          builder_id, company_id, name, email, phone, role_id: contactRole.role_id, is_active: true
        }, { transaction: t });
      }

      // 3. Map lead to contact
      await LeadsContactMap.findOrCreate({
        where: { leads_id: lead.leads_id, contact_id: contact.users_id },
        transaction: t
      });

      await t.commit();

      // 4. Fetch enriched data for response
      const result = await Leads.findByPk(lead.leads_id, {
        include: [
          {
            model: LeadSource,
            as: 'leadSource',
            attributes: ['name']
          },
          {
            model: LeadsContactMap,
            as: 'contactMaps',
            include: [{
              model: Users,
              as: 'contact',
              attributes: ['users_id', 'name', 'email', 'phone'],
              include: [{ model: Address, as: 'address' }]
            }]
          }
        ]
      });

      const plainResult = result.get({ plain: true });
      return {
        ...keysToCamelCase(plainResult),
        leadSourceName: plainResult.leadSource?.name || null,
        leadContacts: keysToCamelCase(plainResult.contactMaps?.map(cm => ({
          ...cm.contact,
          id: cm.id
        })) || [])
      };

    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async checkDuplicateName(name, builderId, createdBy, excludeLeadId = null) {
    const { Leads } = db.sequelize.models;
    const where = {
      builder_id: builderId,
      created_by: createdBy,
      name: db.sequelize.where(
        db.sequelize.fn('LOWER', db.sequelize.col('name')),
        '=',
        name.toLowerCase()
      )
    };

    if (excludeLeadId) {
      where.leads_id = { [Op.ne]: excludeLeadId };
    }

    const lead = await Leads.findOne({ where });
    return lead ? keysToCamelCase(lead.get({ plain: true })) : null;
  }

  async getAllLeads(builderId, companyId, filters = {}) {
    try {
      const {
        page = 1, limit = 25, status, rating, lead_source_id,
        client_type_id, region_id, assignee_id, search,
        email, created_at, sort_by = "created_at", sort_order = "desc",
      } = filters;

      const offset = (page - 1) * limit;
      const whereConditions = ["(l.builder_id = :builderId OR (l.company_id = :companyId AND :companyId IS NOT NULL))"];
      const replacements = { builderId, companyId, limit, offset };

      // Demo leads are cloned per person, so the tenant holds one set per
      // colleague who imported them — this is what keeps the caller from seeing
      // all of them stacked on top of each other. Raw SQL, so the model hook
      // that does this everywhere else never runs here.
      const sampleScope = sampleDataSqlScope("l");
      if (sampleScope.sql) {
        whereConditions.push(sampleScope.sql);
        Object.assign(replacements, sampleScope.replacements);
      }

      const createdRange = resolveCreatedAtRange(created_at);
      if (createdRange) {
        whereConditions.push(
          createdRange.end
            ? "l.created_at >= :dateFilter AND l.created_at < :dateFilterEnd"
            : "l.created_at >= :dateFilter",
        );
        replacements.dateFilter = createdRange.start.toISOString();
        if (createdRange.end) replacements.dateFilterEnd = createdRange.end.toISOString();
      }

      if (status) {
        // "Converted" is a question about the pipeline, not about a string in a
        // column — see CONVERTED_LEAD_SQL.
        //
        // The other tabs match the lead's own status and nothing else. This used
        // to also accept a lead with an opportunity whose status equalled the
        // requested one, but the two columns draw from different vocabularies —
        // a lead is New / Working / Convert, an opportunity is Negotiation / Won
        // / Lost — so that arm could only ever match by accident.
        if (status === "Convert") {
          whereConditions.push(CONVERTED_LEAD_SQL);
        } else {
          whereConditions.push("l.status = :status");
          replacements.status = status;
        }
      }

      if (rating?.length) {
        // "None" has to cover an unrated lead as well as one explicitly set to
        // 'None'. The column is nullable and the list renders the two the same
        // way (both show "—"), so a filter matching only the literal string
        // returned a fraction of the rows the user could see it applying to.
        whereConditions.push(
          rating.includes("None")
            ? "(l.rating = ANY(:rating) OR l.rating IS NULL)"
            : "l.rating = ANY(:rating)",
        );
        replacements.rating = rating;
      }

      if (lead_source_id?.length) {
        whereConditions.push("l.lead_source_id = ANY(:lead_source_id::uuid[])");
        replacements.lead_source_id = lead_source_id;
      }

      if (client_type_id) {
        whereConditions.push("l.client_type_id = :client_type_id");
        replacements.client_type_id = client_type_id;
      }

      if (region_id) {
        whereConditions.push("l.region_id = :region_id");
        replacements.region_id = region_id;
      }

      if (assignee_id?.length) {
        whereConditions.push("l.assignee_id = ANY(:assignee_id::uuid[])");
        replacements.assignee_id = assignee_id;
      }

      if (search) {
        whereConditions.push("(l.name ILIKE :search OR l.email ILIKE :search OR l.phone ILIKE :search)");
        replacements.search = `%${search}%`;
      }

      if (email) {
        whereConditions.push("l.email = :email");
        replacements.email = email;
      }

      const whereClause = whereConditions.join(" AND ");
      const allowedSortColumns = { created_at: "l.created_at" };
      const normalizedSortOrder = String(sort_order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
      const orderByColumn = allowedSortColumns[sort_by] || "l.created_at";

      // The ORDER BY below ends on `l.leads_id` to make the sort a TOTAL order.
      //
      // This is what stops the same lead arriving on two pages. LIMIT/OFFSET asks
      // the database to re-sort and re-slice on every request, and where the sort
      // keys tie, Postgres is free to break the tie differently each time — so a
      // row that sat at the end of page 1 can reappear at the start of page 2. The
      // Leads List scrolls infinitely and appends, which puts both copies on
      // screen together, reading as a duplicated lead. Leads imported as sample
      // data hit this hardest: a whole batch is written in one transaction and
      // shares a created_at down to the millisecond.
      //
      // A unique last key leaves no ties to break, so the slices line up.

      const dataQuery = `
        SELECT 
          l.*, ls.name as lead_source_name,
          COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''), NULLIF(TRIM(COALESCE(pd.street, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''), NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''), NULLIF(TRIM(COALESCE(pd.city, '')), ''), NULLIF(TRIM(COALESCE(st.name, '')), ''), NULLIF(TRIM(COALESCE(pd.zip_code, '')), ''))), ''), 'N/A') as property_details,
          ct.client_type as client_type_name, s.name as state_name,
          assignee.name as assignee_name, created_by_user.name as created_by_name, updated_by_user.name as updated_by_name,
          (SELECT COALESCE(json_agg(json_build_object('id', lcm.id, 'contact_id', lcm.contact_id, 'name', u.name, 'email', u.email, 'phone', u.phone)), '[]'::json) FROM leads_contact_map lcm JOIN users u ON lcm.contact_id = u.users_id WHERE lcm.leads_id = l.leads_id) as lead_contacts,
          (SELECT status FROM opportunity WHERE leads_id = l.leads_id LIMIT 1) as opportunity_status,
          (SELECT out_come FROM opportunity WHERE leads_id = l.leads_id LIMIT 1) as opportunity_outcome,
          (SELECT j.job_id FROM job j JOIN opportunity o ON j.opportunity_id = o.opportunity_id WHERE o.leads_id = l.leads_id LIMIT 1) as job_id
        FROM leads l
        LEFT JOIN lead_source ls ON l.lead_source_id = ls.lead_source_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN client_type ct ON l.client_type_id = ct.client_type_id
        LEFT JOIN state st ON pd.state_id = st.state_id
        LEFT JOIN state s ON l.region_id = s.state_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id
        LEFT JOIN users created_by_user ON l.created_by = created_by_user.users_id
        LEFT JOIN users updated_by_user ON l.updated_by = updated_by_user.users_id
        WHERE ${whereClause}
        ORDER BY ${orderByColumn} ${normalizedSortOrder} NULLS LAST, l.updated_at DESC NULLS LAST, l.reference_number DESC, l.leads_id DESC
        LIMIT :limit OFFSET :offset
      `;

      const countQuery = `SELECT COUNT(*) as total FROM leads l WHERE ${whereClause}`;

      const [dataRows, countRows] = await Promise.all([
        db.sequelize.query(dataQuery, { replacements, type: QueryTypes.SELECT }),
        db.sequelize.query(countQuery, { replacements, type: QueryTypes.SELECT })
      ]);

      return {
        leads: keysToCamelCase(dataRows),
        pagination: {
          page, limit,
          total: parseInt(countRows[0].total),
          totalPages: Math.ceil(countRows[0].total / limit),
        },
      };
    } catch (error) {
      logger.error(`Error in getAllLeads: ${error.message || error}`, { stack: error.stack, builderId, companyId, filters });
      throw error;
    }
  }

  async getLeadById(leadId, builderId, companyId) {
    try {
      // Same rule as the list: a colleague's demo lead is not this caller's to
      // open, so it is a 404 for them rather than a row the list never showed.
      const sampleScope = sampleDataSqlScope("l");
      const sampleClause = sampleScope.sql ? ` AND ${sampleScope.sql}` : "";
      const query = `
        SELECT 
          l.*,ls.name as lead_source_name,ct.client_type as client_type_name,s.name as region_name,
          hlp_main.title as house_land_package_name,assignee.name as assignee_name,
          created_by_user.name as created_by_name,updated_by_user.name as updated_by_name,
          (SELECT COALESCE(json_agg(json_build_object('id', lcm.id, 'contact_id', lcm.contact_id, 'name', cu.name, 'email', cu.email, 'phone', cu.phone)), '[]'::json) FROM leads_contact_map lcm JOIN users cu ON lcm.contact_id = cu.users_id WHERE lcm.leads_id = l.leads_id) as lead_contacts,
          (SELECT json_build_object('lot_id', lot.lot_id, 'lot_number', lot.lot_number, 'street', lot.street, 'city', lot.city, 'zip_code', lot.zip_code, 'title_status', lot.title_status, 'title_date', lot.title_date, 'lot_type', lot.lot_type, 'corner_block', lot.corner_block, 'width_m', lot.width_m, 'depth_m', lot.depth_m, 'price', lot.price, 'total_size_m2', lot.total_size_m2, 'site_fall_mm', lot.site_fall_mm, 'land_fill_mm', lot.land_fill_mm, 'state_id', lot.state_id, 'state_name', (SELECT s.name FROM state s WHERE s.state_id = lot.state_id LIMIT 1), 'estate_id', lot.estate_id, 'estate_name', (SELECT e.name FROM estate e WHERE e.estate_id = lot.estate_id LIMIT 1), 'estate_stage_id', lot.estate_stage_id, 'estate_stage_name', (SELECT es.name FROM estate_stages es WHERE es.estate_stage_id = lot.estate_stage_id LIMIT 1)) FROM lot JOIN property_detail pd ON pd.lot_id = lot.lot_id WHERE pd.property_detail_id = l.property_detail_id LIMIT 1) as lot_details,
          (SELECT json_build_object('house_land_package_id', hlp.house_land_package_id, 'title', hlp.title, 'lot_id', hlp.lot_id, 'facade_id', hlp.facade_id, 'floor_plan_id', hlp.floor_plan_id, 'attach_files', hlp.attach_files) FROM house_land_package hlp WHERE hlp.house_land_package_id = l.house_land_package_id LIMIT 1) as house_land_package_details,
          (SELECT COALESCE(json_agg(json_build_object('quotation_id', q.quotation_id, 'reference_number', q.reference_number, 'created_at', q.created_at, 'versions', (SELECT COALESCE(json_agg(json_build_object('quotation_version_id', qv.quotation_version_id, 'quotation_version_no', qv.quotation_version_no, 'location_id', qv.location_id, 'range_id', qv.range_id, 'dwelling_type_id', qv.dwelling_type_id, 'floor_plan_id', qv.floor_plan_id, 'facade_id', qv.facade_id, 'is_approve', qv.is_approve, 'sketch_number', qv.sketch_number, 'total_package_cost', COALESCE((SELECT package_cost FROM quotation_version_items WHERE quotation_version_id = qv.quotation_version_id AND package_id IS NOT NULL LIMIT 1), 0), 'total_pricelist_cost', COALESCE((SELECT SUM(total_price) FROM quotation_version_items WHERE quotation_version_id = qv.quotation_version_id AND package_id IS NULL), 0), 'grand_total_cost', (COALESCE((SELECT package_cost FROM quotation_version_items WHERE quotation_version_id = qv.quotation_version_id AND package_id IS NOT NULL LIMIT 1), 0) + COALESCE((SELECT SUM(total_price) FROM quotation_version_items WHERE quotation_version_id = qv.quotation_version_id AND package_id IS NULL), 0) + COALESCE(qv.structure_engineer_price, 0)), 'package', (SELECT json_build_object('package_id', p.package_id, 'package_name', p.name) FROM package p WHERE p.package_id = qv.package_id LIMIT 1), 'pricelist_item_maps', (SELECT COALESCE(json_agg(json_build_object('id', qpim.id, 'price_list_item_id', qpim.price_list_item_id, 'item_name', (SELECT pli.item_description FROM price_list_item pli WHERE pli.price_list_item_id = qpim.price_list_item_id LIMIT 1), 'quantity', qpim.quantity, 'note', qpim.note, 'total_price', qpim.total_price)), '[]'::json) FROM quotation_version_pricelist_item_map qpim WHERE qpim.quotation_version_id = qv.quotation_version_id), 'custom_sections', (SELECT COALESCE(json_agg(json_build_object('custom_section_id', qcs.custom_section_id, 'file_url', qcs.file_url, 'sort_order', qcs.sort_order) ORDER BY qcs.sort_order ASC), '[]'::json) FROM quotation_version_custom_section qcs WHERE qcs.quotation_version_id = qv.quotation_version_id))) ORDER BY qv.quotation_version_no DESC), '[]'::json) FROM quotation_version qv WHERE qv.quotation_id = q.quotation_id)) ORDER BY q.created_at DESC), '[]'::json) FROM quotation q WHERE q.leads_id = l.leads_id) as quotations,
          (SELECT COALESCE(json_agg(json_build_object('business_contact_id', bc.business_contact_id, 'contact_type', bc.contact_type, 'name', bc.name, 'email', bc.email, 'phone', bc.phone, 'address1', bc.address1, 'city', bc.city)), '[]'::json) FROM business_contact bc WHERE bc.leads_id = l.leads_id) as business_contacts,
          (SELECT COALESCE(json_agg(json_build_object('invoice_id', inv.invoice_id, 'reference_number', inv.reference_number, 'invoice_date', inv.invoice_date, 'due_date', inv.due_date, 'invoice_amount', inv.invoice_amount, 'status', inv.status) ORDER BY inv.created_at DESC), '[]'::json) FROM invoice inv WHERE inv.leads_id = l.leads_id) as invoices,
          (SELECT status FROM opportunity WHERE leads_id = l.leads_id LIMIT 1) as opportunity_status,
          (SELECT out_come FROM opportunity WHERE leads_id = l.leads_id LIMIT 1) as opportunity_outcome,
          (SELECT opportunity_id FROM opportunity WHERE leads_id = l.leads_id LIMIT 1) as opportunity_id,
          (SELECT j.job_id FROM job j JOIN opportunity o ON j.opportunity_id = o.opportunity_id WHERE o.leads_id = l.leads_id LIMIT 1) as job_id
        FROM leads l
        LEFT JOIN lead_source ls ON l.lead_source_id = ls.lead_source_id
        LEFT JOIN client_type ct ON l.client_type_id = ct.client_type_id
        LEFT JOIN state s ON l.region_id = s.state_id
        LEFT JOIN house_land_package hlp_main ON l.house_land_package_id = hlp_main.house_land_package_id
        LEFT JOIN users assignee ON l.assignee_id = assignee.users_id
        LEFT JOIN users created_by_user ON l.created_by = created_by_user.users_id
        LEFT JOIN users updated_by_user ON l.updated_by = updated_by_user.users_id
        WHERE l.leads_id = :leadId AND (l.builder_id = :builderId OR (l.company_id = :companyId AND :companyId IS NOT NULL))${sampleClause}
      `;

      const rows = await db.sequelize.query(query, {
        replacements: { leadId, builderId, companyId, ...sampleScope.replacements },
        type: QueryTypes.SELECT,
      });

      return rows.length > 0 ? keysToCamelCase(rows[0]) : null;
    } catch (error) {
      logger.error(`Error in getLeadById: ${error.message || error}`, { stack: error.stack, leadId, builderId, companyId });
      throw error;
    }
  }

  async updateLead(leadId, leadData, builderId) {
    try {
      const { Leads } = db.sequelize.models;
      const {
        name, email, phone, notes, send_letter, lead_source_id,
        status, rating, land, finance, face_to_face, purpose,
        client_type_id, forcast_close, build_budget, region_id,
        prelim_agreement, client_profile, h_l_budget, assignee_id,
        assignee_note, updated_by, house_land_package_id,
      } = leadData;

      const updateData = {};
      if (name !== undefined) updateData.name = name;
      if (email !== undefined) updateData.email = email;
      if (phone !== undefined) updateData.phone = phone;
      if (notes !== undefined) updateData.notes = notes;
      if (send_letter !== undefined) updateData.send_letter = send_letter;
      if (lead_source_id !== undefined) updateData.lead_source_id = lead_source_id;
      if (status !== undefined) updateData.status = status;
      if (rating !== undefined) updateData.rating = rating;
      if (land !== undefined) updateData.land = land;
      if (finance !== undefined) updateData.finance = finance;
      if (face_to_face !== undefined) updateData.face_to_face = face_to_face;
      if (purpose !== undefined) updateData.purpose = purpose;
      if (client_type_id !== undefined) updateData.client_type_id = client_type_id;
      if (forcast_close !== undefined) updateData.forcast_close = forcast_close;
      if (build_budget !== undefined) updateData.build_budget = build_budget;
      if (region_id !== undefined) updateData.region_id = region_id;
      if (prelim_agreement !== undefined) updateData.prelim_agreement = prelim_agreement;
      if (client_profile !== undefined) updateData.client_profile = client_profile;
      if (h_l_budget !== undefined) updateData.h_l_budget = h_l_budget;
      if (assignee_id !== undefined) updateData.assignee_id = assignee_id;
      if (assignee_note !== undefined) updateData.assignee_note = assignee_note;
      if (house_land_package_id !== undefined) updateData.house_land_package_id = house_land_package_id;
      
      updateData.updated_by = updated_by;
      updateData.updatedAt = new Date();

      const [affectedRows, [updatedLead]] = await Leads.update(updateData, {
        where: {
          leads_id: leadId,
          [Op.or]: [{ builder_id: builderId }, { company_id: { [Op.ne]: null } }]
        },
        returning: true,
      });

      if (affectedRows === 0) return null;
      return keysToCamelCase(updatedLead.get({ plain: true }));
    } catch (error) {
      logger.error(`Error in updateLead: ${error.message || error}`, { stack: error.stack, leadId, builderId });
      throw error;
    }
  }

  async convertLeadToOpportunity(leadId, opportunityNotes, builderId, companyId, status = 'Negotiation', transaction = null) {
    let localTransaction = false;
    let t = transaction;
    if (!t) {
      t = await db.sequelize.transaction();
      localTransaction = true;
    }
    try {
      const { Leads, Opportunity } = db.sequelize.models;
      const lead = await Leads.findOne({
        where: { leads_id: leadId, [Op.or]: [{ builder_id: builderId }, { company_id: companyId }] },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!lead) throw new Error("Lead not found or unauthorized");

      if (lead.status === "Convert") {
        const [affectedRows, [opp]] = await Opportunity.update({ status }, {
          where: { leads_id: leadId }, transaction: t, returning: true
        });
        if (localTransaction) await t.commit();
        return keysToCamelCase(opp.get({ plain: true }));
      }

      if (!lead.property_detail_id) throw new Error("Lead must have a property detail before converting to an opportunity");

      const opportunity = await Opportunity.create({
        leads_id: leadId, opportunity_notes: opportunityNotes || null, status
      }, { transaction: t });

      await lead.update({ status: "Convert" }, { transaction: t });

      if (localTransaction) await t.commit();
      return keysToCamelCase(opportunity.get({ plain: true }));
    } catch (error) {
      if (localTransaction) await t.rollback();
      throw error;
    }
  }

  async deleteLead(leadId, builderId, companyId) {
    try {
      const { Leads } = db.sequelize.models;
      const lead = await Leads.findOne({
        where: { leads_id: leadId, [Op.or]: [{ builder_id: builderId }, { company_id: companyId }] }
      });
      if (!lead) return null;
      const plainLead = lead.get({ plain: true });
      await lead.destroy();
      return keysToCamelCase(plainLead);
    } catch (error) {
      logger.error(`Error in deleteLead: ${error.message || error}`, { stack: error.stack, leadId, builderId, companyId });
      throw error;
    }
  }

  async getLeadStats(builderId, companyId) {
    try {
      // Counts the caller's own leads plus their own demo ones — a colleague's
      // seeded copy would otherwise double every tile on this row.
      const sampleScope = sampleDataSqlScope("leads");
      const sampleClause = sampleScope.sql ? ` AND ${sampleScope.sql}` : "";
      const stats = await db.sequelize.query(`
        SELECT 
          COUNT(*) as total_leads,
          COUNT(CASE WHEN status = 'New' THEN 1 END) as new_leads,
          COUNT(CASE WHEN status = 'Working' THEN 1 END) as working_leads,
          COUNT(CASE WHEN status = 'Qualified' THEN 1 END) as qualified_leads,
          0 as won_leads, 0 as lost_leads,
          COUNT(CASE WHEN rating = 'Hot' THEN 1 END) as hot_leads,
          COUNT(CASE WHEN rating = 'Warm' THEN 1 END) as warm_leads,
          COUNT(CASE WHEN rating = 'Cold' THEN 1 END) as cold_leads
        FROM leads
        WHERE (builder_id = :builderId OR (company_id = :companyId AND :companyId IS NOT NULL))${sampleClause}
      `, { replacements: { builderId, companyId, ...sampleScope.replacements }, type: QueryTypes.SELECT });
      return keysToCamelCase(stats[0]);
    } catch (error) {
      logger.error(`Error in getLeadStats: ${error.message || error}`, { stack: error.stack, builderId, companyId });
      throw error;
    }
  }

  async removeHLPData(leadsId, removeExtras, builderId, companyId) {
    const t = await db.sequelize.transaction();
    try {
      const { Leads, PropertyDetail, Quotation } = db.sequelize.models;
      const lead = await Leads.findOne({
        where: { leads_id: leadsId, builder_id: builderId },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!lead) throw new Error("Lead not found");

      const propertyDetailId = lead.property_detail_id;
      await lead.update({ house_land_package_id: null }, { transaction: t });

      if (removeExtras) {
        if (propertyDetailId) {
          const pd = await PropertyDetail.findByPk(propertyDetailId, { transaction: t });
          if (pd && pd.is_hl_package_lot) {
            await lead.update({ property_detail_id: null }, { transaction: t });
            await pd.destroy({ transaction: t });
          }
        }
        await Quotation.destroy({
          where: { leads_id: leadsId, is_hl_package_quotation: true },
          transaction: t
        });
      }
      await t.commit();
      return true;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async getSalesDashboard(builderId, filters = {}) {
    const {
      userId = null,
      createdAt = null,
      createdAtFrom = null,
      createdAtTo = null,
    } = filters;

    const whereConditions = ["l.builder_id = :builderId"];
    const replacements = { builderId };

    // Shared by every query below, so the whole dashboard counts one set of demo
    // leads — the caller's — rather than one per colleague who imported them.
    const sampleScope = sampleDataSqlScope("l");
    if (sampleScope.sql) {
      whereConditions.push(sampleScope.sql);
      Object.assign(replacements, sampleScope.replacements);
    }

    if (userId) {
      whereConditions.push("l.assignee_id = :userId");
      replacements.userId = userId;
    }

    if (createdAtFrom) {
      whereConditions.push("l.created_at >= :createdAtFrom");
      replacements.createdAtFrom = createdAtFrom;
    }

    if (createdAtTo) {
      whereConditions.push("l.created_at <= :createdAtTo");
      replacements.createdAtTo = createdAtTo;
    }

    if (createdAt && !createdAtFrom && !createdAtTo) {
      const now = new Date();
      let dateFilter = null;
      let dateFilterEnd = null;

      switch (String(createdAt).toLowerCase()) {
        case "last_7_days":
          dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "last_15_days":
          dateFilter = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
          break;
        case "last_30_days":
          dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          break;
      }

      if (dateFilter) {
        whereConditions.push("l.created_at >= :createdAtStart");
        replacements.createdAtStart = dateFilter.toISOString();
      }

      if (dateFilterEnd) {
        whereConditions.push("l.created_at <= :createdAtEnd");
        replacements.createdAtEnd = dateFilterEnd.toISOString();
      }
    }

    const whereClause = whereConditions.join(" AND ");

    // 1. Monthly leads for the last 6 months
    const monthlyLeads = await db.sequelize.query(
      `
        SELECT
          TO_CHAR(DATE_TRUNC('month', l.created_at), 'Mon') AS month,
          COUNT(*)::int AS total,
          COUNT(CASE WHEN l.status = 'New' THEN 1 END)::int AS new_count,
          COUNT(CASE WHEN l.status = 'Working' THEN 1 END)::int AS working_count,
          COUNT(CASE WHEN l.status IN ('Convert', 'Qualified') THEN 1 END)::int AS converted_count
        FROM leads l
        WHERE ${whereClause}
          AND l.created_at >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
        GROUP BY DATE_TRUNC('month', l.created_at)
        ORDER BY DATE_TRUNC('month', l.created_at) ASC
      `,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    );

    // 2. Lead sources distribution — GROUP BY the coalesced value to avoid mismatch
    const leadSources = await db.sequelize.query(
      `
        SELECT
          COALESCE(ls.name, 'Unknown') AS source,
          COUNT(l.leads_id)::int AS lead_count
        FROM leads l
        LEFT JOIN lead_source ls ON l.lead_source_id = ls.lead_source_id
        WHERE ${whereClause}
        GROUP BY COALESCE(ls.name, 'Unknown')
        ORDER BY lead_count DESC
        LIMIT 10
      `,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    );

    // 3. Top 5 performers by assigned leads
    const topPerformers = await db.sequelize.query(
      `
        SELECT
          u.name,
          COUNT(l.leads_id)::int AS lead_count
        FROM leads l
        JOIN users u ON l.assignee_id = u.users_id
        WHERE ${whereClause} AND l.assignee_id IS NOT NULL
        GROUP BY u.users_id, u.name
        ORDER BY lead_count DESC
        LIMIT 5
      `,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    );

    // 4. Overall summary by status
    const overallSummary = await db.sequelize.query(
      `
        SELECT
          COUNT(*)::int AS total_leads,
          COUNT(CASE WHEN status = 'New' THEN 1 END)::int AS new_leads,
          COUNT(CASE WHEN status = 'Working' THEN 1 END)::int AS working_leads,
          COUNT(CASE WHEN status IN ('Convert', 'Qualified') THEN 1 END)::int AS converted_leads
        FROM leads l
        WHERE ${whereClause}
      `,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    );

    // 5. Top 10 floor plans via house_land_package
    const topFloorplans = await db.sequelize.query(
      `
        SELECT
          fp.name,
          COUNT(l.leads_id)::int AS lead_count
        FROM leads l
        JOIN house_land_package hlp ON l.house_land_package_id = hlp.house_land_package_id
        JOIN floor_plan fp ON hlp.floor_plan_id = fp.floor_plan_id
        WHERE ${whereClause}
        GROUP BY fp.floor_plan_id, fp.name
        ORDER BY lead_count DESC
        LIMIT 10
      `,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    );

    // 6. Top 10 facades via house_land_package
    const topFacades = await db.sequelize.query(
      `
        SELECT
          f.name,
          COUNT(l.leads_id)::int AS lead_count
        FROM leads l
        JOIN house_land_package hlp ON l.house_land_package_id = hlp.house_land_package_id
        JOIN facade f ON hlp.facade_id = f.facade_id
        WHERE ${whereClause}
        GROUP BY f.facade_id, f.name
        ORDER BY lead_count DESC
        LIMIT 10
      `,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    );

    // 7. Lead lost reasons — count each reason entry (no FK from leads to lost reason)
    const lostReasons = await db.sequelize.query(
      `
        SELECT
          llr.lost_reason AS name,
          0::int AS lead_count
        FROM lead_lost_reason llr
        WHERE llr.builder_id = :builderId AND llr.is_active = true
        ORDER BY llr.sort_order ASC
      `,
      {
        replacements,
        type: QueryTypes.SELECT,
      },
    );

    return {
      monthlyLeads: monthlyLeads.map(r => keysToCamelCase(r)),
      leadSources: leadSources.map(r => ({
        source: r.source,
        count: r.lead_count,
      })),
      topPerformers: topPerformers.map(r => ({
        name: r.name,
        count: r.lead_count,
      })),
      overallSummary: overallSummary.length > 0
        ? keysToCamelCase(overallSummary[0])
        : { totalLeads: 0, newLeads: 0, workingLeads: 0, convertedLeads: 0 },
      topFloorplans: topFloorplans.map(r => ({
        name: r.name,
        count: r.lead_count,
      })),
      topFacades: topFacades.map(r => ({
        name: r.name,
        count: r.lead_count,
      })),
      leadLostReasons: lostReasons.map(r => ({
        name: r.name,
        count: r.lead_count,
      })),
    };
  }
}


export default new LeadsRepository();
