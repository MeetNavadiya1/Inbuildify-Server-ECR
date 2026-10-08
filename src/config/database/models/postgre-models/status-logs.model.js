import { Model, DataTypes } from "sequelize";

export class StatusLogs extends Model {
  static associate(models) {}
}
export default (sequelize) => {
  StatusLogs.init({
    status_log_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    request_id: { type: DataTypes.UUID, allowNull: false },
    status_code: { type: DataTypes.INTEGER, allowNull: false },
    error: { type: DataTypes.TEXT, allowNull: true },
    method: { type: DataTypes.STRING(10), allowNull: true },
    url: { type: DataTypes.STRING(255), allowNull: true },
    request_body: { type: DataTypes.TEXT, allowNull: true },
    response: { type: DataTypes.TEXT, allowNull: true },
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, { sequelize, tableName: "status_logs", modelName: "StatusLogs", underscored: true, timestamps: false });
  return StatusLogs;
};
