import { Model, DataTypes } from "sequelize";

export class JobDailyUpdate extends Model {
  static associate(models) {
    JobDailyUpdate.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobDailyUpdate.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "SET NULL" });
    JobDailyUpdate.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "SET NULL" });
    JobDailyUpdate.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobDailyUpdate.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobDailyUpdate.init(
    {
      job_daily_update_id: {
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
      // The site day the update covers — not when it was typed in.
      update_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      // Short headline for the list row; null on updates posted before titles
      // existed, which fall back to the first line of work_completed.
      title: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      // in_progress | completed | delayed — see DAILY_UPDATE_STATUSES.
      status: {
        type: DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "in_progress",
      },
      work_completed: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Site temperature for the day in °C; optional.
      temperature: {
        type: DataTypes.DECIMAL(4, 1),
        allowNull: true,
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
      tableName: "job_daily_update",
      modelName: "JobDailyUpdate",
      underscored: true,
    },
  );
  return JobDailyUpdate;
};
