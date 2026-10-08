import { Model, DataTypes } from "sequelize";

export class Todo extends Model {
  static associate(models) {
    Todo.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Todo.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Todo.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Todo.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  Todo.init(
    {
      todo_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: { type: DataTypes.UUID, allowNull: true },
      task_name: { type: DataTypes.STRING(255), allowNull: false },
      supplier_id: { type: DataTypes.UUID, allowNull: true },
      booking_date: { type: DataTypes.DATEONLY, allowNull: true },
      start_date: { type: DataTypes.DATEONLY, allowNull: true },
      finish_date: { type: DataTypes.DATEONLY, allowNull: true },
      site_supervisor_id: { type: DataTypes.UUID, allowNull: true },
      subject: { type: DataTypes.STRING(500), allowNull: true },
      message: { type: DataTypes.TEXT, allowNull: true },
      // "Completed" is the terminal done state. Together with "Cancelled" it
      // closes a to-do, which is what keeps it out of the Overdue / Today /
      // week buckets in the listing.
      status: {
        type: DataTypes.ENUM("Pending", "Confirmed", "Cancelled", "Completed"),
        defaultValue: "Pending",
      },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "todo",
      modelName: "Todo",
      underscored: true,
    },
  );
  return Todo;
};
