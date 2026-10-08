import { Model, DataTypes } from "sequelize";

export class ConstructionEtsRecharge extends Model {
  static associate(models) {
    ConstructionEtsRecharge.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ConstructionEtsRecharge.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    ConstructionEtsRecharge.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ConstructionEtsRecharge.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    ConstructionEtsRecharge.hasMany(models.ConstructionEtsRechargeApproval, { foreignKey: "construction_ets_recharge_id", as: "approvals" });
  }
}

export default (sequelize) => {
  ConstructionEtsRecharge.init(
    {
      construction_ets_recharge_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      enable_ets_supplier: { type: DataTypes.BOOLEAN, defaultValue: false },
      enable_recharge_supplier: { type: DataTypes.BOOLEAN, defaultValue: true },
      signature_section: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "construction_ets_recharge",
      modelName: "ConstructionEtsRecharge",
      underscored: true,
      indexes: [
        {
          unique: true,
          fields: ["company_id", "builder_id"],
          name: "uq_construction_ets_recharge_scope",
        },
      ],
    },
  );
  return ConstructionEtsRecharge;
};
