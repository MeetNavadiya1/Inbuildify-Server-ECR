import { Op } from "sequelize";
import leadsService from "./leads.service.js";
import { captureLandingLeadService } from "../landing-lead/landing-lead.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

import { logActivity, compareAndLogUpdates } from "../../utils/activityLogger.js";
import logger from "../../utils/logger.js";

/**
 * A repeatable query param as an array.
 *
 * Express gives `?rating=Hot&rating=Warm` as an array and `?rating=Hot,Warm` as
 * one string; the multi-selects on the Leads List send either depending on the
 * client. Shared by the list and its counts so a filter cannot be read one way
 * for the rows and another for the badge above them.
 */
const toArray = (value) => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

export async function createLead(req, res) {
 
  try {
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    // Handle both forceCreate (before middleware) and force_create (after middleware)
    const forceCreate =
      req.body.forceCreate === true ||
      req.body.forceCreate === "true" ||
      req.body.force_create === true ||
      req.body.force_create === "true";

    if (!userId || !builderId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: User or builder ID missing",
      );
    }

    const result = await leadsService.createLead(
      req.body,
      userId,
      builderId,
      companyId,
      forceCreate,
    );

    if (result.success) {
      await logActivity(null, {
        userId,
        builderId,
        companyId,
        referenceId: result.data.leadsId,
        referenceType: "LEAD",
        module: "Lead",
        moduleId: result.data.leadsId,
        recordName: result.data.name,
        action: "CREATE",
        description: `Lead created: ${result.data.name}`,
      });
      return successResponse(res, result.data, result.message);
    } if (result.emailExists) {
      return errorResponse(res, 409, result.message, {
        emailExists: true,
        existingLead: result.existingLead,
      });
    } if (result.nameExists) {
      return errorResponse(res, 409, result.message, {
        nameExists: true,
        existingLead: result.existingLead,
      });
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    logger.error(`Create lead error: ${error.message || error}`, { stack: error.stack, userId: req.user?.users_id, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function forceCreateLead(req, res) {
  try {
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!userId || !builderId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: User or builder ID missing",
      );
    }

    const result = await leadsService.createLead(
      req.body,
      userId,
      builderId,
      companyId,
      true,
    );

    if (result.success) {
      await logActivity(null, {
        userId,
        builderId,
        companyId,
        referenceId: result.data.leadsId,
        referenceType: "LEAD",
        module: "Lead",
        moduleId: result.data.leadsId,
        recordName: result.data.name,
        action: "CREATE",
        description: `Lead created: ${result.data.name}`,
      });
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    logger.error(`Force create lead error: ${error.message || error}`, { stack: error.stack, userId: req.user?.users_id, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

/**
 * Legacy landing-site capture. A "Get Quote" enquiry no longer becomes the
 * facade owner's CRM lead on arrival — it is captured as a `landing_lead` owned
 * by the platform and only becomes a lead when an admin releases it. The URL
 * stays because the deployed landing build still posts here; both it and
 * `POST /landing-lead/public` run the same service.
 */
export async function createPublicLead(req, res) {
  // Old behaviour — wrote straight into the builder's CRM:
  // try {
  //   const { builder_id, company_id, featur_facade_id, ...leadData } = req.body;
  //   if (!builder_id) {
  //     return errorResponse(res, 400, "Builder ID is required");
  //   }
  //   const result = await leadsService.createPublicLead(
  //     leadData, builder_id, company_id || null, featur_facade_id,
  //   );
  //   if (result.success) {
  //     await logActivity(null, {
  //       userId: null,
  //       builderId: builder_id,
  //       companyId: company_id || null,
  //       referenceId: result.data.leadsId,
  //       referenceType: "LEAD",
  //       module: "Lead",
  //       moduleId: result.data.leadsId,
  //       recordName: result.data.name,
  //       action: "CREATE",
  //       description: `Lead created via Public API: ${result.data.name}`,
  //     });
  //     return successResponse(res, result.data, "Lead created successfully from website");
  //   }
  //   if (result.emailExists) {
  //     return errorResponse(res, 409, result.message, {
  //       emailExists: true, existingLead: result.existingLead, featuredFacadeLead: result.featuredFacadeLead,
  //     });
  //   }
  //   if (result.nameExists) {
  //     return errorResponse(res, 409, result.message, {
  //       nameExists: true, existingLead: result.existingLead, featuredFacadeLead: result.featuredFacadeLead,
  //     });
  //   }
  //   return errorResponse(res, 400, result.message);
  // } catch (error) { … }
  try {
    const data = await captureLandingLeadService(req.body);
    return successResponse(res, data, "Enquiry received successfully");
  } catch (error) {
    logger.error(`Public create lead error: ${error.message || error}`, { stack: error.stack });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getAllLeads(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Builder or company ID missing");
    }

    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 25,
      status: req.query.status,
      rating: toArray(req.query.rating),
      lead_source_id: toArray(req.query.lead_source_id),
      client_type_id: req.query.client_type_id,
      region_id: req.query.region_id,
      assignee_id: toArray(req.query.assignee_id),
      search: req.query.search,
      email: req.query.email,
      created_at: req.query.created_at,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
    };

    const result = await leadsService.getAllLeads(builderId, companyId, filters, req.user);

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    logger.error(`Get all leads error: ${error.message || error}`, { stack: error.stack, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getLeadById(req, res) {
  try {
    const { leads_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Builder or company ID missing");
    }

    const result = await leadsService.getLeadById(leads_id, builderId, companyId, req.user);

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 404, result.message);

  } catch (error) {
    logger.error(`Get lead by ID error: ${error.message || error}`, { stack: error.stack, leadsId: req.params?.leads_id, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getLeadDocuments(req, res) {
  try {
    const { leads_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Builder or company ID missing");
    }

    const result = await leadsService.getLeadDocuments(leads_id, builderId, companyId);

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 404, result.message);

  } catch (error) {
    logger.error(`Get lead documents error: ${error.message || error}`, { stack: error.stack, leadsId: req.params?.leads_id, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updateLead(req, res) {
  try {
    const { leads_id } = req.params;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!userId || !builderId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: User or builder ID missing",
      );
    }

    const existingLeadResult = await leadsService.getLeadById(leads_id, builderId, companyId);
    if (!existingLeadResult.success) {
      return errorResponse(res, 404, "Lead not found");
    }



    const result = await leadsService.updateLead(
      leads_id,
      req.body,
      userId,
      builderId,
      companyId,
    );

    if (result.success) {
      await compareAndLogUpdates(null, {
        userId,
        builderId,
        companyId,
        referenceId: leads_id,
        referenceType: "LEAD",
        module: "Lead",
        moduleId: leads_id,
        recordName: result.data.name,
        oldData: existingLeadResult.data,
        newData: result.data,
      });
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    logger.error(`Update lead error: ${error.message || error}`, { stack: error.stack, leadsId: req.params?.leads_id, userId: req.user?.users_id, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function deleteLead(req, res) {
  try {
    const { leads_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Builder or company ID missing");
    }

    const existingLeadResult = await leadsService.getLeadById(leads_id, builderId, companyId);

    if (!existingLeadResult.success) {
      return errorResponse(res, 404, "Lead not found");
    }

    // Log activity BEFORE deletion to avoid foreign key vibration on ACTIVITY LOG Table
    await logActivity(null, {
      userId: req.user?.users_id,
      builderId,
      companyId,
      referenceId: leads_id,
      referenceType: "LEAD",
      module: "Lead",
      moduleId: leads_id,
      recordName: existingLeadResult.data.name,
      action: "DELETE",
      description: `Lead deleted: ${existingLeadResult.data.name}`
    });

    const result = await leadsService.deleteLead(leads_id, builderId, companyId);

    if (result.success) {
      return successResponse(res, null, "Lead deleted successfully");
    }
    return errorResponse(res, 404, result.message);

  } catch (error) {
    logger.error(`Delete lead error: ${error.message || error}`, { stack: error.stack, leadsId: req.params?.leads_id, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function convertLeadToOpportunity(req, res) {
  try {
    const { leads_id } = req.params;
    const { opportunity_notes } = req.body;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Builder or company ID missing");
    }

    const result = await leadsService.convertLeadToOpportunity(
      leads_id,
      opportunity_notes,
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, result.data, 201, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    logger.error(`Convert lead error: ${error.message || error}`, { stack: error.stack, leadsId: req.params?.leads_id, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getLeadStats(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Builder or company ID missing");
    }

    // The same filters the list is under, so each tab's count describes the rows
    // that tab would actually show. Status is deliberately not among them — see
    // getLeadStats.
    const result = await leadsService.getLeadStats(builderId, companyId, {
      search: req.query.search || undefined,
      lead_source_id: toArray(req.query.lead_source_id),
      assignee_id: toArray(req.query.assignee_id),
      rating: toArray(req.query.rating),
      created_at: req.query.created_at || undefined,
    });

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    logger.error(`Get lead stats error: ${error.message || error}`, { stack: error.stack, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getSalesDashboard(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const {
      user_id,
      created_at,
      created_at_from,
      created_at_to,
    } = req.query;

    if (!builderId) {
      return errorResponse(res, 401, "Unauthorized: Builder ID missing");
    }

    const filters = {
      userId: user_id && user_id !== "all" ? user_id : null,
      createdAt: created_at || null,
      createdAtFrom: created_at_from || null,
      createdAtTo: created_at_to || null,
    };

    const result = await leadsService.getSalesDashboard(builderId, filters);

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    logger.error(`Get sales dashboard error: ${error.message || error}`, { stack: error.stack, builderId: req.user?.builder_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function updateLeadStatus(req, res) {
  try {
    const { leads_id } = req.params;
    const { status } = req.body;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!userId || !builderId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: User or builder ID missing",
      );
    }

    if (!status) {
      return errorResponse(res, 400, "Status is required");
    }

    const result = await leadsService.updateLeadStatus(
      leads_id,
      status,
      userId,
      builderId,
      companyId,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    logger.error(`Update lead status error: ${error.message || error}`, { stack: error.stack, leadsId: req.params?.leads_id, userId: req.user?.users_id, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function assignLead(req, res) {
  try {
    const { leads_id } = req.params;
    const { assignee_id, assignee_note } = req.body;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;

    if (!userId || !builderId) {
      return errorResponse(
        res,
        401,
        "Unauthorized: User or builder ID missing",
      );
    }

    if (!assignee_id) {
      return errorResponse(res, 400, "Assignee ID is required");
    }

    const result = await leadsService.assignLead(
      leads_id,
      assignee_id,
      assignee_note,
      userId,
      builderId,
    );

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    logger.error(`Assign lead error: ${error.message || error}`, { stack: error.stack, leadsId: req.params?.leads_id, userId: req.user?.users_id, builderId: req.user?.builder_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export const removeHLPackage = async (req, res) => {
  try {
    const { leads_id } = req.params;
    const { remove_hl_package_lot_quotation } = req.body;
    const { users_id, builder_id, company_id } = req.user;

    const result = await leadsService.removeHLPackage(
      leads_id,
      { remove_hl_package_lot_quotation },
      builder_id,
      company_id,
    );

    if (result.success) {
      return successResponse(res, null, result.message);
    }
    return errorResponse(res, 400, result.message);

  } catch (error) {
    logger.error(`Remove HL Package error: ${error.message || error}`, { stack: error.stack, leadsId: req.params?.leads_id, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
};

export async function getAllLeadActions(req, res) {
  try {
    const { leads_id } = req.params;
    const { job_id, link_type } = req.query; // when present, return the job's timeline (not the lead's)
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Builder or company ID missing");
    }

    const result = await leadsService.getAllLeadActions(leads_id, builderId, companyId, job_id || null, link_type || null);

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 404, result.message);

  } catch (error) {
    logger.error(`Get all lead actions error: ${error.message || error}`, { stack: error.stack, leadsId: req.params?.leads_id, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getLeadActivityLog(req, res) {
  try {
    const { leads_id } = req.params;
    const { module, action, search, page = 1, limit = 20, all = false } = req.query;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: Builder or company ID missing");
    }

    const pageValue = parseInt(page, 10);
    const limitValue = parseInt(limit, 10);
    const offset = (pageValue - 1) * limitValue;

    const result = await leadsService.getLeadActivityLog(leads_id, builderId, companyId, {
      module,
      action,
      search,
      limit: limitValue,
      offset,
      page: pageValue,
      all: all === true || all === "true",
    });

    if (result.success) {
      return successResponse(res, result.data, result.message);
    }
    return errorResponse(res, 404, result.message);

  } catch (error) {
    logger.error(`Get lead activity log error: ${error.message || error}`, { stack: error.stack, leadsId: req.params?.leads_id, builderId: req.user?.builder_id, companyId: req.user?.company_id });
    return handleControllerError(res, error, "Internal server error");
  }
}
