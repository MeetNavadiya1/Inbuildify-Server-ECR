import { Model, DataTypes } from "sequelize";

export class SchedulerEmail extends Model {
  static associate(models) {
    SchedulerEmail.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    SchedulerEmail.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    SchedulerEmail.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    SchedulerEmail.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}
export default (sequelize) => {
  SchedulerEmail.init({
    scheduler_email_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    builder_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    frequency: { type: DataTypes.STRING(50), allowNull: false },
    send_to_all_active_users: { type: DataTypes.BOOLEAN, defaultValue: false },
    notification_recipient_users: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
    reply_to_users: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
    exclude_recipients: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
    subject: { type: DataTypes.STRING(255), allowNull: false },
    message_body: { type: DataTypes.TEXT, allowNull: false },
    no_of_action_days: { type: DataTypes.INTEGER, allowNull: true },
    no_record_message: { type: DataTypes.BOOLEAN, defaultValue: false },
    no_record_message_body: { type: DataTypes.TEXT, allowNull: true },
    attach_files: { type: DataTypes.STRING(500), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    created_by: { type: DataTypes.UUID, allowNull: true },
    updated_by: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "scheduler_email", modelName: "SchedulerEmail", underscored: true });
  return SchedulerEmail;
};
