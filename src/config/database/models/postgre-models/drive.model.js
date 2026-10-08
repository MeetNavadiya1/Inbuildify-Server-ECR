import { Model, DataTypes } from "sequelize";

export class Drive extends Model {
  static associate(models) {
    Drive.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Drive.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Drive.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Drive.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    
    // Self-referencing associations for folder hierarchy
    Drive.belongsTo(models.Drive, { foreignKey: "parent_id", as: "parent", onDelete: "CASCADE" });
    Drive.hasMany(models.Drive, { foreignKey: "parent_id", as: "children" });
    
    // File association
    Drive.hasMany(models.DriveFile, { foreignKey: "folder_id", as: "files" });
  }
}

export default (sequelize) => {
  Drive.init(
    {
      drive_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      is_starred: { type: DataTypes.BOOLEAN, defaultValue: false },
      // FALSE cuts this folder off from the shares on the folders above it —
      // set when it is restored from Trash, so it comes back private even
      // though its parent is still shared. Its own children keep inheriting
      // from it, and a direct share on it is honoured either way.
      inherit_shares: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      parent_id: { type: DataTypes.UUID, allowNull: true },
      // Polymorphic owner — lets a folder be scoped to an entity (e.g. a Job's
      // Documents tree). NULL for ordinary company/builder Drive folders, which
      // is what the global Drive listing filters on. Mirrors drive_files.
      reference_id: { type: DataTypes.UUID, allowNull: true },
      reference_type: { type: DataTypes.STRING, allowNull: true },
      // Flags folders the sample-data importer cloned (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      created_at: { type: DataTypes.DATE },
      updated_at: { type: DataTypes.DATE },
      deleted_at: { type: DataTypes.DATE },
    },
    { 
      sequelize, 
      tableName: "drive", 
      modelName: "Drive", 
      underscored: true,
      paranoid: true, // Enable soft delete
      indexes: [
        { fields: ['company_id'] },
        { fields: ['parent_id'] },
        { fields: ['deleted_at'] },
        { fields: ["reference_id", "reference_type"] },
      ]
    }
  );
  return Drive;
};
