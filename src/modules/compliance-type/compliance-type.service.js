import db from "../../config/database/models/postgre-models/index.js";

export async function getAllComplianceTypesService() {
  const { ComplianceType } = db;
  return await ComplianceType.findAll({
    order: [["createdAt", "DESC"]],
  });
}
