import { Model, DataTypes } from "sequelize";

export class Appointment extends Model {
  static associate(models) {
    Appointment.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Appointment.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Appointment.belongsTo(models.Users, { foreignKey: "link_to", as: "linkedUser" });
    Appointment.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
    Appointment.belongsTo(models.Users, { foreignKey: "updated_by", as: "updatedByUser", onDelete: "SET NULL" });
    Appointment.belongsTo(models.Leads, { foreignKey: "lead_id", as: "lead", onDelete: "SET NULL" });
    Appointment.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  Appointment.init(
    {
      appointment_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      builder_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      start_time: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      end_time: {
        type: DataTypes.TIME,
        allowNull: false,
      },
      location_text: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      link_to: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      lead_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      // When set, this appointment belongs to a job's Action timeline.
      job_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      link_type: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      select_users: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      notes: {
        type: DataTypes.JSONB,
        defaultValue: [],
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      send_appointment_customer: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      status: {
        type: DataTypes.ENUM("yes", "No", "May be"),
        defaultValue: "No",
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      // Whose sample data this row is. Scopes Settings → Sample Data to one
      // account: every user under a company shares its builder_id.
      sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
      createdAt: {
        type: DataTypes.DATE,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: "appointment",
      modelName: "Appointment",
      underscored: true,
    },
  );

  return Appointment;
};
