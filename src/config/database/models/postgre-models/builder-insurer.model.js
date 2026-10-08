import { Model, DataTypes } from "sequelize";

export class BuilderInsurer extends Model {
  static associate(models) {
    BuilderInsurer.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    BuilderInsurer.belongsTo(models.State, { foreignKey: "state_id", as: "state", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  BuilderInsurer.init(
    {
      builder_insurer_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      builder_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
      },
      insurer_name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      insured_name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      phone_number: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      address_line1: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      address_line2: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      state_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      zip_code: {
        type: DataTypes.STRING(20),
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
      tableName: "builder_insurer",
      modelName: "BuilderInsurer",
      underscored: true,
    },
  );

  return BuilderInsurer;
};
