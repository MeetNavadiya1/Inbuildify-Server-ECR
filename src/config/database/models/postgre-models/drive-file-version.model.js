import { DataTypes } from "sequelize";

export default (sequelize) => {
  const DriveFileVersion = sequelize.define(
    "DriveFileVersion",
    {
      version_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      file_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      version_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      s3_key: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      file_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      size: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      mime_type: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      uploaded_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
      },
      updated_at: {
        type: DataTypes.DATE,
      },
    },
    {
      tableName: "drive_file_versions",
      modelName: "DriveFileVersion",
      underscored: true,
      timestamps: true,
    }
  );

  return DriveFileVersion;
};
