import { Model, DataTypes } from "sequelize";

export class Leads extends Model {
  static associate(models) {
    Leads.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Leads.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Leads.belongsTo(models.LeadSource, { foreignKey: "lead_source_id", as: "leadSource", onDelete: "SET NULL" });
    Leads.belongsTo(models.ClientType, { foreignKey: "client_type_id", as: "clientType", onDelete: "SET NULL" });
    Leads.belongsTo(models.State, { foreignKey: "region_id", as: "state", onDelete: "SET NULL" });
    Leads.belongsTo(models.HouseLandPackage, { foreignKey: "house_land_package_id", as: "houseLandPackage", onDelete: "SET NULL" });
    Leads.belongsTo(models.PropertyDetail, { foreignKey: "property_detail_id", as: "propertyDetail", onDelete: "SET NULL" });
    Leads.belongsTo(models.Users, { foreignKey: "assignee_id", as: "assignee" });
    Leads.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser" });
    Leads.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser" });
    Leads.belongsTo(models.LeadLostReason, { foreignKey: "lead_lost_reason_id", as: "leadLostReason", onDelete: "SET NULL" });
    Leads.hasMany(models.Invoice, { foreignKey: "leads_id", as: "invoices" });
    Leads.hasMany(models.Quotation, { foreignKey: "leads_id", as: "quotations" });
    Leads.hasMany(models.Opportunity, { foreignKey: "leads_id", as: "opportunities" });
    Leads.hasMany(models.LeadsContactMap, { foreignKey: "leads_id", as: "contactMaps" });
    Leads.hasMany(models.Appointment, { foreignKey: "lead_id", as: "appointments" });
    Leads.hasMany(models.Task, { foreignKey: "lead_id", as: "tasks" });
    Leads.hasMany(models.BusinessContact, { foreignKey: "leads_id", as: "businessContacts" });
    Leads.hasMany(models.FeaturedFacadeLead, { foreignKey: "leads_id", as: "featuredFacadeLeads" });
  }
}

export default (sequelize) => {
  Leads.init(
    {
      leads_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      reference_number: { type: DataTypes.STRING(30), allowNull: false },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      notes: { type: DataTypes.STRING(1000), allowNull: true },
      send_letter: { type: DataTypes.BOOLEAN, defaultValue: false },
      lead_source_id: { type: DataTypes.UUID, allowNull: true },
      status: { type: DataTypes.STRING(20), defaultValue: "New" },
      rating: { type: DataTypes.STRING(150), allowNull: true },
      land: { type: DataTypes.STRING(150), allowNull: true },
      finance: { type: DataTypes.STRING(150), allowNull: true },
      face_to_face: { type: DataTypes.STRING(150), allowNull: true },
      purpose: { type: DataTypes.STRING(150), allowNull: true },
      client_type_id: { type: DataTypes.UUID, allowNull: true },
      forcast_close: { type: DataTypes.DATEONLY, allowNull: true },
      build_budget: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      region_id: { type: DataTypes.UUID, allowNull: true },
      prelim_agreement: { type: DataTypes.DATEONLY, allowNull: true },
      client_profile: { type: DataTypes.STRING(500), allowNull: true },
      h_l_budget: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      assignee_note: { type: DataTypes.STRING(500), allowNull: true },
      assignee_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      house_land_package_id: { type: DataTypes.UUID, allowNull: true },
      property_detail_id: { type: DataTypes.UUID, allowNull: true },
      lead_lost_reason_id: { type: DataTypes.UUID, allowNull: true },
      lead_lost_comment: { type: DataTypes.STRING(1000), allowNull: true },
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal("CURRENT_TIMESTAMP") },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: sequelize.literal("CURRENT_TIMESTAMP") },
    },
    { sequelize, tableName: "leads", modelName: "Leads", underscored: true },
  );
  return Leads;
};
