import { Model, DataTypes } from "sequelize";

export class ColorItemCustomField extends Model {
  static associate(models) {
    ColorItemCustomField.belongsTo(models.ColorItem, { foreignKey: "color_item", as: "colorItem" });
  }
}

export default (sequelize) => {
  ColorItemCustomField.init(
    {
      color_item_custom_field_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
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
      createdAt: {
        type: DataTypes.DATE,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: "color_item_custom_field",
      modelName: "ColorItemCustomField",
      underscored: true,
    },
  );

  return ColorItemCustomField;
};
