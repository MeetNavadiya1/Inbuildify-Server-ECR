import { Model, DataTypes } from "sequelize";

export class EstateImages extends Model {
  static associate(models) {
    EstateImages.belongsTo(models.Estate, { foreignKey: "estate_id", as: "estate", onDelete: "CASCADE" });
    EstateImages.belongsTo(models.Users, { foreignKey: "uploaded_by", as: "uploadedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  EstateImages.init({
    estate_image_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    estate_id: { type: DataTypes.UUID, allowNull: true },
    image_url: { type: DataTypes.STRING(500), allowNull: true },
    uploaded_by: { type: DataTypes.UUID, allowNull: true },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    uploaded_at: { type: DataTypes.DATE },
  }, { sequelize, tableName: "estate_images", modelName: "EstateImages", underscored: true, timestamps: false });
  return EstateImages;
};
