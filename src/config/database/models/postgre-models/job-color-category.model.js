import { Model, DataTypes } from "sequelize";

export class JobColorCategory extends Model {
  static associate(models) {
    JobColorCategory.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobColorCategory.belongsTo(models.JobColor, { foreignKey: "color_id", as: "color", onDelete: "CASCADE" });
    JobColorCategory.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    JobColorCategory.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    JobColorCategory.hasMany(models.JobColorItem, { foreignKey: "color_category_id", as: "colorItems" });
    JobColorCategory.hasMany(models.JobColorSubCategory, { foreignKey: "color_category_id", as: "colorSubCategories" });
  }
}

export default (sequelize) => {
  JobColorCategory.init(
    {
      color_category_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      color_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      category_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      selection_type: {
        type: DataTypes.STRING(100),
        defaultValue: "multiple",
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },
      status: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      suppliers: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      color_group: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      template_category_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "job_color_category",
      modelName: "JobColorCategory",
      underscored: true,
    },
  );

  return JobColorCategory;
};
