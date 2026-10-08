import { Model, DataTypes } from "sequelize";

export class JobColorItemCustomField extends Model {
  static associate(models) {
    JobColorItemCustomField.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobColorItemCustomField.belongsTo(models.JobColorItem, { foreignKey: "color_item", as: "colorItem", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  JobColorItemCustomField.init(
    {
      color_item_custom_field_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      color_item: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      field_type: {
        type: DataTypes.ENUM("text", "checkbox", "dropdown_list", "radio_button"),
        allowNull: true,
      },
      field_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      required_field: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      sort_order: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: {
        type: DataTypes.DATE,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: "job_color_item_custom_field",
      modelName: "JobColorItemCustomField",
      underscored: true,
    }
  );

  return JobColorItemCustomField;
};
