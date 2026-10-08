import { DataTypes } from "sequelize";

export default (sequelize) => {
  const DriveShare = sequelize.define(
    "DriveShare",
    {
      share_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      entity_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      entity_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      shared_by: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      shared_with_user: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      permission_level: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
      },
      updated_at: {
        type: DataTypes.DATE,
      },
    },
    {
      tableName: "drive_shares",
      modelName: "DriveShare",
      underscored: true,
      timestamps: true,
    }
  );

  return DriveShare;
};
