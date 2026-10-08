import { Model, DataTypes } from "sequelize";

export class StructureEngineer extends Model {
  static associate(models) {
    StructureEngineer.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    StructureEngineer.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    StructureEngineer.belongsTo(models.Users, { foreignKey: "created_by", as: "createdBy", onDelete: "SET NULL" });
    StructureEngineer.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedBy", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  StructureEngineer.init({
    structure_engineer_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(255), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(255), allowNull: true },
    price: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    address: { type: DataTypes.STRING(500), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    // Whose sample data this row is. Scopes Settings → Sample Data to one
    // account: every user under a company shares its builder_id.
    sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE },
    updated_at: { type: DataTypes.DATE },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
  }, {
    sequelize,
    tableName: "structure_engineer",
    modelName: "StructureEngineer",
    underscored: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  });
  return StructureEngineer;
};
