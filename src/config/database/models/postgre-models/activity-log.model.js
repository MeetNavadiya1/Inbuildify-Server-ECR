import { Model, DataTypes } from "sequelize";

export class ActivityLog extends Model {
  static associate(models) {
    ActivityLog.belongsTo(models.Users, { foreignKey: "user_id", as: "user", onDelete: "SET NULL" });
    ActivityLog.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ActivityLog.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    // For specific reference types, we don't define belongsTo directly with foreignKey constraint here 
    // because it's polymorphic. The application code handles joining if needed.
    ActivityLog.belongsTo(models.Notifications, { foreignKey: "module_id", targetKey: "notifications_id", as: "notification", constraints: false });
  }
}

export default (sequelize) => {
  ActivityLog.init(
    {
      activity_log_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      builder_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      reference_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      reference_type: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      sub_reference_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      sub_reference_type: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "users_id",
        },
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
      is_sample_data: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      // Whose sample data this row is. NOT user_id above — that is the actor the
      // line describes, which for a seeded row is a cloned demo teammate.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      created_at: {
        type: DataTypes.DATE,
      },
      updated_at: {
        type: DataTypes.DATE,
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      tableName: "activity_logs",
      modelName: "ActivityLog",
      underscored: true,
      paranoid: true, // enables deleted_at
      indexes: [
        { fields: ["company_id"] },
        { fields: ["builder_id"] },
        { fields: ["reference_id", "reference_type", { name: "created_at", order: "DESC" }] },
        { fields: ["sub_reference_id", "sub_reference_type"] },
      ],
    },
  );
  return ActivityLog;
};
