import { Model, DataTypes } from "sequelize";

export class ClientType extends Model {
  static associate(models) {
    ClientType.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    ClientType.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    ClientType.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    ClientType.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  ClientType.init(
    {
      client_type_id: {
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
      client_type: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
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
      tableName: "client_type",
      modelName: "ClientType",
      underscored: true,
    },
  );

  return ClientType;
};
