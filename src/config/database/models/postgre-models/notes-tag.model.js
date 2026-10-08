import { Model, DataTypes } from "sequelize";

export class NotesTag extends Model {
  static associate(models) {
    NotesTag.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    NotesTag.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    NotesTag.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    NotesTag.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  NotesTag.init(
    {
      notes_tag_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(100), allowNull: false },
      background_color: { type: DataTypes.STRING(20), allowNull: true },
      font_color: { type: DataTypes.STRING(20), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "notes_tag", modelName: "NotesTag", underscored: true },
  );
  return NotesTag;
};
