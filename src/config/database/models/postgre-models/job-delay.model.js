import { Model, DataTypes } from "sequelize";

export class JobDelay extends Model {
  static associate(models) {
    JobDelay.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobDelay.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobDelay.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobDelay.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobDelay.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobDelay.init(
    {
      job_delay_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      builder_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      reason: {
        type: DataTypes.ENUM("Private Inspection", "Materials", "Weather", "Variation", "Permits", "Others"),
        allowNull: false,
      },
      no_of_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      from_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      to_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      send_mail: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      status: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: ["EMAIL NOT SENT", "DATE NOT RECALCULATED"],
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: "job_delay",
      modelName: "JobDelay",
      underscored: true,
    },
  );
  return JobDelay;
};
