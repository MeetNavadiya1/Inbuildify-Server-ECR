import { Model, DataTypes } from "sequelize";

export class Sms extends Model {
  static associate(models) {
    Sms.belongsTo(models.Leads, { foreignKey: "leads_id", as: "lead", onDelete: "CASCADE" });
    Sms.belongsTo(models.Users, { foreignKey: "recipient_id", as: "recipient", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  Sms.init(
    {
      sms_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      leads_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "leads",
          key: "leads_id",
        },
      },
      recipient_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "users",
          key: "users_id",
        },
      },
      message: {
        type: DataTypes.STRING(500),
        allowNull: false,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: {
        type: DataTypes.DATE,
        field: "created_at",
      },
      updatedAt: {
        type: DataTypes.DATE,
        field: "updated_at",
      },
    },
    {
      sequelize,
      tableName: "sms",
      modelName: "Sms",
      underscored: true,
      timestamps: true,
    },
  );
  return Sms;
};
