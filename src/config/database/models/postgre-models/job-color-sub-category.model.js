import { Model, DataTypes } from "sequelize";

export class JobColorSubCategory extends Model {
  static associate(models) {
    JobColorSubCategory.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobColorSubCategory.belongsTo(models.JobColorCategory, { foreignKey: "color_category_id", as: "colorCategory" });
    JobColorSubCategory.belongsTo(models.Users, { foreignKey: "created_by_id", as: "createdByUser" });
    JobColorSubCategory.belongsTo(models.Users, { foreignKey: "updated_by_id", as: "updatedByUser" });
  }
}

export default (sequelize) => {
  JobColorSubCategory.init(
    {
      color_sub_category_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      color_category_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      created_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updated_by_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      template_sub_category_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    },
    {
      sequelize,
      tableName: "job_color_sub_category",
      modelName: "JobColorSubCategory",
      underscored: true,
    },
  );
  return JobColorSubCategory;
};
