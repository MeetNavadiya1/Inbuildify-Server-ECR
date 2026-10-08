import { Model, DataTypes } from "sequelize";

export class ConstructionOption extends Model {
  static associate(models) {
    ConstructionOption.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ConstructionOption.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    ConstructionOption.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ConstructionOption.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  ConstructionOption.init(
    {
      construction_option_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      option_name: { type: DataTypes.STRING(255), allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "construction_option",
      modelName: "ConstructionOption",
      underscored: true,
    },
  );
  return ConstructionOption;
};
