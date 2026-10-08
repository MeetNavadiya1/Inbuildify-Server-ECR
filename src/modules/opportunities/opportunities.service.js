import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { applyRowScope } from "../../helper/rbac.helper.js";
import { MODULES } from "../../constants/rbac.js";

const { Opportunity, Leads, Sequelize } = db;
const { Op } = Sequelize;

// An opportunity owns no assignment data of its own — ownership flows through
// the linked lead. So row-scoping is applied to the joined lead's where clause:
// Sales Executive sees opportunities on leads assigned to them (assignee_id),
// Agent sees opportunities on leads they created (created_by).
const OPP_LEAD_SCOPE_COLUMNS = {
  assignedToColumn: "assignee_id",
  createdByColumn: "created_by",
  referrerColumn: "created_by",
};

class OpportunitiesService {
  /**
   * Converts a lead to an opportunity (sets status to IN_PROGRESS)
   * @param {string} leadId - The Lead ID (mapped to leads_id in DB)
   * @param {string} builderId - The Builder ID
   * @returns {Promise<Object>} - The updated lead info
   */
  async createOpportunity(leadId, builderId) {
    const t = await db.sequelize.transaction();
    try {
      // Find lead by leadId (leads_id in DB) and status 'New'
      const lead = await Leads.findOne({
        where: {
          leads_id: leadId,
          status: "New",
          builder_id: builderId
        },
        transaction: t
      });

      if (!lead) {
        throw { status: 404, message: "Lead not found or already converted to opportunity." };
      }

      // Update lead status
      await lead.update({
        status: "IN_PROGRESS",
        updatedAt: new Date()
      }, { transaction: t });

      await t.commit();

      // Return exactly what the original controller returned
      return {
        success: true,
        data: keysToCamelCase({
          lead_id: lead.leads_id,
          status: "IN_PROGRESS",
          updated_at: lead.updatedAt
        }),
        message: "Lead converted to opportunity successfully"
      };
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Fetches all opportunities for a builder
   * @param {string} builderId - The Builder ID
   * @param {string} leadId - Optional lead filter
   * @returns {Promise<Object>} - List of opportunities with lead details
   */
  async getAllOpportunities(builderId, leadId = null, user = null) {
    const where = {};
    if (leadId) {
      where.leads_id = leadId;
    }

    // Phase 4 — row-level scoping. For Sales Executive / Agent this constrains
    // the joined lead to ones they own; no-op for builder/admin tiers and for
    // internal callers that don't pass `user`.
    const leadWhere = applyRowScope({ builder_id: builderId }, user, MODULES.OPPORTUNITY, OPP_LEAD_SCOPE_COLUMNS);

    const opportunities = await Opportunity.findAll({
      where,
      include: [
        {
          model: Leads,
          as: "lead",
          where: leadWhere,
          attributes: ["name", "reference_number"],
          required: true
        }
      ],
      order: [["created_at", "DESC"]]
    });

    // Format results to match raw SQL structure (joining fields into the main object)
    const formatted = opportunities.map(opp => {
      const plain = opp.get({ plain: true });
      const lead = plain.lead || {};
      delete plain.lead;
      
      return keysToCamelCase({
        ...plain,
        lead_name: lead.name || null,
        reference_number: lead.reference_number || null
      });
    });

    return {
      success: true,
      data: formatted,
      message: "Opportunities fetched successfully"
    };
  }
}

export default new OpportunitiesService();
