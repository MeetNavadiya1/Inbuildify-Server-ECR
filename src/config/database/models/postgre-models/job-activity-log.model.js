import { Model, DataTypes } from "sequelize";

export class JobActivityLog extends Model {
  static associate(models) {
    JobActivityLog.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "SET NULL" });
    JobActivityLog.belongsTo(models.Users, { foreignKey: "user_id", as: "user", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobActivityLog.init(
    {
      job_activity_log_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "job", key: "job_id" },
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: "users", key: "users_id" },
      },
      module: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      module_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      record_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      action: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      field_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      old_value: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      new_value: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: {
        type: DataTypes.DATE,
        field: "created_at",
      },
    },
    {
      sequelize,
      tableName: "job_activity_log",
      modelName: "JobActivityLog",
      underscored: true,
      updatedAt: false,
      indexes: [
        {
          name: "idx_job_activity_log_job_created",
          fields: ["job_id", { name: "created_at", order: "DESC" }],
        },
        {
          name: "idx_job_activity_log_module_id",
          fields: ["module_id"],
        },
        {
          name: "idx_job_activity_log_module",
          fields: ["module"],
        },
      ],
    },
  );
  return JobActivityLog;
};
