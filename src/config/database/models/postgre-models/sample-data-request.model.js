import { Model, DataTypes } from "sequelize";

export const SAMPLE_DATA_REQUEST_STATUS = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  FAILED: "FAILED",
});

export class SampleDataRequest extends Model {
  static associate(models) {
    SampleDataRequest.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    SampleDataRequest.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    SampleDataRequest.belongsTo(models.Users, { foreignKey: "requested_by", as: "requestedByUser", onDelete: "SET NULL" });
    SampleDataRequest.belongsTo(models.Users, { foreignKey: "approver_user_id", as: "approverUser", onDelete: "SET NULL" });
    SampleDataRequest.belongsTo(models.Users, { foreignKey: "decided_by", as: "decidedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  SampleDataRequest.init(
    {
      sample_data_request_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: SAMPLE_DATA_REQUEST_STATUS.PENDING,
      },
      approval_token: { type: DataTypes.STRING(100), allowNull: false },
      requested_by: { type: DataTypes.UUID, allowNull: true },
      approver_user_id: { type: DataTypes.UUID, allowNull: true },
      approver_email: { type: DataTypes.STRING(255), allowNull: true },
      decided_by: { type: DataTypes.UUID, allowNull: true },
      decided_at: { type: DataTypes.DATE, allowNull: true },
      decision_note: { type: DataTypes.TEXT, allowNull: true },
      error_message: { type: DataTypes.TEXT, allowNull: true },
      // Percent of the import's phases completed, written by the worker as it
      // crosses each one. This is the only progress the Settings screen has —
      // the import runs off-thread, so what it reports here is all the UI can
      // honestly show.
      progress: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
      created_at: { type: DataTypes.DATE },
      updated_at: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "sample_data_request", modelName: "SampleDataRequest", underscored: true },
  );

  return SampleDataRequest;
};
