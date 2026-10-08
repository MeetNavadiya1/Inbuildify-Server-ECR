import db from "../../config/database/models/postgre-models/index.js";

const { Contractor, Users, Leads } = db;

/**
 * FETCH DASHBOARD DATA
 * Fetches counts and top 3 recent records for Contractors, Users, and Leads.
 */
export const getDashboardDataService = async (builderId) => {
  const [
    contractorCount,
    contractorData,
    usersCount,
    usersData,
    leadCount,
    leadData,
  ] = await Promise.all([
    // Contractor Count
    Contractor.count({
      where: { builder_id: builderId, is_deleted: false },
    }),
    // Recent Contractors
    Contractor.findAll({
      attributes: ["contractor_id", "name", "email", "created_at"],
      where: { builder_id: builderId, is_deleted: false },
      order: [["created_at", "DESC"]],
      limit: 3,
      raw: true,
    }),
    // User Count
    Users.count({
      where: { builder_id: builderId, is_deleted: false, is_verified: true },
    }),
    // Recent Users
    Users.findAll({
      attributes: ["users_id", "name", "email", "created_at"],
      where: { builder_id: builderId, is_deleted: false, is_verified: true },
      order: [["created_at", "DESC"]],
      limit: 3,
      raw: true,
    }),
    // Lead Count
    Leads.count({
      where: { builder_id: builderId, is_deleted: false },
    }),
    // Recent Leads
    Leads.findAll({
      attributes: ["leads_id", "name", "email", "created_at"],
      where: { builder_id: builderId, is_deleted: false },
      order: [["created_at", "DESC"]],
      limit: 3,
      raw: true,
    }),
  ]);

  return {
    contractor_count: contractorCount,
    contractor_data: contractorData || [],
    users_count: usersCount,
    users_data: usersData || [],
    lead_count: leadCount,
    lead_data: leadData || [],
  };
};

export default {
  getDashboardDataService,
};
