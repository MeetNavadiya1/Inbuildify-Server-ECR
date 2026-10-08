import { Model, DataTypes } from "sequelize";

export class Tags extends Model {
  static associate(models) {
    Tags.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  Tags.init(
    {
      tag_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      builder_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(100), allowNull: false },
      is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "tags", modelName: "Tags", underscored: true }
  );
  return Tags;
};
