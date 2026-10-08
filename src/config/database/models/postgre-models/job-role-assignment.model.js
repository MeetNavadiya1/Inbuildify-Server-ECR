import { Model, DataTypes } from "sequelize";

/**
 * One row per (job, role) naming the user responsible for that role on that
 * job — the persistence behind the job header's "Assign Roles" modal.
 * See migration 20260731120000-create-job-role-assignment.js.
 */
export class JobRoleAssignment extends Model {
  static associate(models) {
    JobRoleAssignment.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobRoleAssignment.belongsTo(models.Role, { foreignKey: "role_id", as: "role", onDelete: "CASCADE" });
    JobRoleAssignment.belongsTo(models.Users, { foreignKey: "user_id", as: "user", onDelete: "CASCADE" });
    JobRoleAssignment.belongsTo(models.Users, { foreignKey: "assigned_by", as: "assignedByUser", onDelete: "SET NULL" });
    JobRoleAssignment.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobRoleAssignment.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });

    models.Job.hasMany(JobRoleAssignment, { foreignKey: "job_id", as: "roleAssignments", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  JobRoleAssignment.init(
    {
      job_role_assignment_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: { type: DataTypes.UUID, allowNull: false },
      role_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      assigned_by: { type: DataTypes.UUID, allowNull: true },
      assigned_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "job_role_assignment",
      modelName: "JobRoleAssignment",
      underscored: true,
      indexes: [
        { unique: true, fields: ["job_id", "role_id"], name: "job_role_assignment_job_role_uniq" },
      ],
    },
  );
  return JobRoleAssignment;
};
