import { Model, DataTypes } from "sequelize";

export class ConstructionEtsRechargeApproval extends Model {
  static associate(models) {
    ConstructionEtsRechargeApproval.belongsTo(models.ConstructionEtsRecharge, { foreignKey: "construction_ets_recharge_id", as: "constructionEtsRecharge", onDelete: "CASCADE" });
    ConstructionEtsRechargeApproval.belongsTo(models.Role, { foreignKey: "role_id", as: "role", onDelete: "SET NULL" });
    ConstructionEtsRechargeApproval.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ConstructionEtsRechargeApproval.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  ConstructionEtsRechargeApproval.init(
    {
      construction_ets_recharge_approval_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      construction_ets_recharge_id: { type: DataTypes.UUID, allowNull: false },
      role_id: { type: DataTypes.UUID, allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "construction_ets_recharge_approval",
      modelName: "ConstructionEtsRechargeApproval",
      underscored: true,
    },
  );
  return ConstructionEtsRechargeApproval;
};