import { Model, DataTypes } from "sequelize";

export class RecalculateDate extends Model {
  static associate(models) {
    RecalculateDate.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    RecalculateDate.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    RecalculateDate.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    RecalculateDate.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  RecalculateDate.init(
    {
      recalculate_date_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      recalculate_workflow_job_estimated_dates: { type: DataTypes.BOOLEAN, defaultValue: false },
      recalculate_construction_job_estimated_dates: { type: DataTypes.BOOLEAN, defaultValue: false },
      capture_reason_rebooking_and_rebooking_email: { type: DataTypes.BOOLEAN, defaultValue: false },
      capture_text: { type: DataTypes.STRING(500), allowNull: true },
      recalculate_confirmed_booking_dates: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "recalculate_date", modelName: "RecalculateDate", underscored: true },
  );
  return RecalculateDate;
};
