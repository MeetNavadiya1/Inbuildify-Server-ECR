import { Model, DataTypes } from "sequelize";

export class SalesProcessStageFunctionality extends Model {
  static associate(models) {}
}
export default (sequelize) => {
  SalesProcessStageFunctionality.init({
    functionality_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
  }, { sequelize, tableName: "sales_process_stage_functionality", modelName: "SalesProcessStageFunctionality", underscored: true, timestamps: false });
  return SalesProcessStageFunctionality;
};
