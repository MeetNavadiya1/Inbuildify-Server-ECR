import { Model, DataTypes } from "sequelize";

export class Customer extends Model {
  static associate(models) {
    Customer.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder" });
  }
}

export default (sequelize) => {
  Customer.init(
    {
      customer_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      email: { type: DataTypes.STRING(100), allowNull: false },
      builder_id: { type: DataTypes.UUID, allowNull: false },
      phone: { type: DataTypes.STRING(15), allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "customer", modelName: "Customer", underscored: true },
  );
  return Customer;
};
